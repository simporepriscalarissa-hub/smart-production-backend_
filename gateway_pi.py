#!/usr/bin/env python3
"""
Gateway Raspberry Pi — Smart Production

  ESP32 ──MQTT──► Pi (subscriber)
                      │
                      │  HTTP
                      ▼
                 Backend NestJS
                      │
                      ▼
                 Dashboard (WebSocket)

  Bouton GPIO ──► YOLO ──HTTP──► Backend
"""

import time
import json
import threading
import requests
import paho.mqtt.client as mqtt
import RPi.GPIO as GPIO

# ═══════════════════════════════════════════════════
#  CONFIGURATION
# ═══════════════════════════════════════════════════
BACKEND_URL       = "https://smartproduction.duckdns.org"

MQTT_BROKER       = "localhost"    # Mosquitto sur le Pi (ou IP du broker)
MQTT_PORT         = 1883
MQTT_TOPIC_RFID   = "rfid/scan"   # Topic publié par l'ESP32

BOUTON_GPIO       = 17             # Pin BCM bouton physique
LED_GPIO          = 27             # LED active pendant YOLO (None = désactivé)

MODEL_PATH        = "/home/pi/pfe/best.pt"
REFERENCE_DEFAULT = "JEAN-001"
CONF_SEUIL        = 0.5
DELAI_SEC         = 4
STABILITE_REQUISE = 10

# ═══════════════════════════════════════════════════
#  ÉTAT GLOBAL
# ═══════════════════════════════════════════════════
camera_active = False

# ═══════════════════════════════════════════════════
#  MQTT : reçoit l'ESP32
# ═══════════════════════════════════════════════════
def on_connect(client, userdata, flags, rc):
    if rc == 0:
        client.subscribe(MQTT_TOPIC_RFID)
        print(f"✅ MQTT connecté — abonné à '{MQTT_TOPIC_RFID}'")
    else:
        print(f"❌ MQTT erreur connexion (code {rc})")

def on_message(client, userdata, msg):
    """
    L'ESP32 publie sur rfid/scan :
      - JSON  : {"rfid": "ABCD1234"}
      - OU string brute : ABCD1234
    """
    try:
        payload = json.loads(msg.payload.decode())
        rfid = payload.get("rfid", "").strip().upper()
    except (json.JSONDecodeError, UnicodeDecodeError):
        rfid = msg.payload.decode().strip().upper()

    if not rfid:
        print("⚠️  Message MQTT sans RFID valide")
        return

    print(f"📡 RFID reçu via MQTT : {rfid}")
    threading.Thread(target=envoyer_presence, args=(rfid,), daemon=True).start()

# ═══════════════════════════════════════════════════
#  HTTP → Backend : scan RFID
# ═══════════════════════════════════════════════════
def envoyer_presence(rfid: str):
    """POST /ouvriers/presence/:rfid → marque l'ouvrier Actif en BDD"""
    try:
        r = requests.post(f"{BACKEND_URL}/ouvriers/presence/{rfid}", timeout=5)
        if r.status_code in (200, 201):
            print(f"✅ Présence validée : {r.json().get('ouvrier', rfid)}")
        else:
            print(f"⚠️  Badge refusé (HTTP {r.status_code})")
    except Exception as e:
        print(f"❌ Erreur envoi présence : {e}")

# ═══════════════════════════════════════════════════
#  HTTP → Backend : récupérer l'ouvrier actif
# ═══════════════════════════════════════════════════
def get_ouvrier_actif():
    """GET /ouvriers/last-session → ouvrier Actif ou None"""
    try:
        r = requests.get(f"{BACKEND_URL}/ouvriers/last-session", timeout=3)
        if r.status_code == 200:
            data = r.json()
            if data.get("statut") == "Actif":
                return data
    except Exception as e:
        print(f"❌ Erreur récup ouvrier actif : {e}")
    return None

# ═══════════════════════════════════════════════════
#  YOLO : analyse caméra
# ═══════════════════════════════════════════════════
def boucle_yolo(ouvrier_id: int):
    global camera_active
    try:
        from ultralytics import YOLO
        import cv2

        print("⏳ Chargement modèle YOLO...")
        model = YOLO(MODEL_PATH)
        cap   = cv2.VideoCapture(0)

        if not cap.isOpened():
            print("❌ Caméra introuvable")
            camera_active = False
            return

        if LED_GPIO:
            GPIO.output(LED_GPIO, GPIO.HIGH)

        print(f"🎥 Analyse démarrée — ouvrier #{ouvrier_id}")

        dernier_envoi  = 0
        frames_stables = 0
        dernier_statut = None

        while camera_active:
            ret, frame = cap.read()
            if not ret:
                break

            results      = model(frame, conf=CONF_SEUIL, verbose=False)
            defauts      = results[0].boxes
            est_conforme = len(defauts) == 0

            if est_conforme:
                statut_actuel = "conforme"
                type_defaut   = None
                confiance     = 0.0
            else:
                confs         = [float(b.conf[0]) for b in defauts]
                idx_max       = confs.index(max(confs))
                type_defaut   = results[0].names[int(defauts[idx_max].cls[0])]
                statut_actuel = f"defaut_{type_defaut}"
                confiance     = confs[idx_max]

            if statut_actuel == dernier_statut:
                frames_stables += 1
            else:
                frames_stables = 0
                dernier_statut = statut_actuel

            now = time.time()
            if frames_stables >= STABILITE_REQUISE and (now - dernier_envoi > DELAI_SEC):
                envoyer_resultat(ouvrier_id, est_conforme, type_defaut, confiance)
                dernier_envoi  = now
                frames_stables = 0

        cap.release()

    except ImportError:
        print("❌ pip install ultralytics opencv-python")
    except Exception as e:
        print(f"❌ Erreur YOLO : {e}")
    finally:
        camera_active = False
        if LED_GPIO:
            GPIO.output(LED_GPIO, GPIO.LOW)
        print("🛑 Caméra arrêtée")

def envoyer_resultat(ouvrier_id: int, est_conforme: bool,
                     type_defaut, confiance: float):
    """POST /qualite + /production → HTTP vers backend"""
    payload_qualite = {
        "ouvrierId":      ouvrier_id,
        "reference":      REFERENCE_DEFAULT,
        "statutIA":       "conforme" if est_conforme else "non_conforme",
        "typeDefaut":     type_defaut,
        "scoreConfiance": round(confiance, 4),
        "dateDetection":  time.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    payload_prod = {
        "ouvrierId":           ouvrier_id,
        "reference":           REFERENCE_DEFAULT,
        "quantiteProduite":    1,
        "quantiteConforme":    1 if est_conforme else 0,
        "quantiteNonConforme": 0 if est_conforme else 1,
    }
    try:
        requests.post(f"{BACKEND_URL}/qualite",    json=payload_qualite, timeout=3)
        requests.post(f"{BACKEND_URL}/production", json=payload_prod,    timeout=3)
        label = "CONFORME ✅" if est_conforme else f"DÉFAUT ❌ ({type_defaut})"
        print(f"📤 Envoi HTTP backend : {label} — ouvrier #{ouvrier_id}")
    except Exception as e:
        print(f"⚠️  Erreur envoi résultat : {e}")

# ═══════════════════════════════════════════════════
#  GPIO : bouton physique
# ═══════════════════════════════════════════════════
def on_bouton(channel):
    global camera_active

    if camera_active:
        camera_active = False
        print("🛑 Arrêt caméra (bouton)")
        return

    ouvrier = get_ouvrier_actif()
    if ouvrier is None:
        print("⚠️  Aucun ouvrier actif — scannez d'abord le badge RFID")
        return

    print(f"🔘 Bouton → analyse pour {ouvrier['prenom']} {ouvrier['nom']} (#{ouvrier['id']})")
    camera_active = True
    threading.Thread(target=boucle_yolo, args=(ouvrier['id'],), daemon=True).start()

# ═══════════════════════════════════════════════════
#  POINT D'ENTRÉE
# ═══════════════════════════════════════════════════
if __name__ == "__main__":
    print("=" * 52)
    print("  Gateway Pi — Smart Production")
    print("=" * 52)
    print(f"  MQTT    : {MQTT_BROKER}:{MQTT_PORT} → topic '{MQTT_TOPIC_RFID}'")
    print(f"  Backend : {BACKEND_URL}  (HTTP)")
    print(f"  Bouton  : GPIO {BOUTON_GPIO} (BCM)")
    print("=" * 52)

    # GPIO
    GPIO.setmode(GPIO.BCM)
    GPIO.setup(BOUTON_GPIO, GPIO.IN, pull_up_down=GPIO.PUD_UP)
    GPIO.add_event_detect(BOUTON_GPIO, GPIO.FALLING,
                          callback=on_bouton, bouncetime=300)
    if LED_GPIO:
        GPIO.setup(LED_GPIO, GPIO.OUT)
        GPIO.output(LED_GPIO, GPIO.LOW)

    # MQTT
    client = mqtt.Client(client_id="gateway_pi")
    client.on_connect = on_connect
    client.on_message = on_message

    try:
        client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
    except Exception as e:
        print(f"❌ Impossible de joindre le broker MQTT : {e}")
        print("   → sudo apt install mosquitto && sudo systemctl start mosquitto")
        GPIO.cleanup()
        exit(1)

    print("✅ En attente de badges RFID (MQTT) et du bouton (GPIO)...\n")

    try:
        client.loop_forever()   # Bloquant — gère la reconnexion automatiquement
    except KeyboardInterrupt:
        print("\n⏹️  Arrêt du gateway")
    finally:
        camera_active = False
        GPIO.cleanup()
        client.disconnect()
