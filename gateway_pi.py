#!/usr/bin/env python3
"""
Gateway Raspberry Pi — Smart Production
Flux complet :
  ESP32 (RFID) → MQTT → [ce script] → Backend
  Bouton GPIO  → [ce script] → YOLO → Backend
"""

import json
import time
import threading
import requests
import paho.mqtt.client as mqtt
import RPi.GPIO as GPIO

# ═══════════════════════════════════════════════════
#  CONFIGURATION — à adapter à ton environnement
# ═══════════════════════════════════════════════════
BACKEND_URL       = "https://smartproduction.duckdns.org"
MQTT_BROKER       = "localhost"        # Mosquitto tourne sur le Pi
MQTT_PORT         = 1883
MQTT_TOPIC_RFID   = "rfid/scan"       # Topic publié par l'ESP32
BOUTON_GPIO       = 17                 # Pin BCM du bouton physique
LED_GPIO          = 27                 # LED verte = caméra active (optionnel)
MODEL_PATH        = "/home/pi/pfe/best.pt"
REFERENCE_DEFAULT = "JEAN-001"         # Référence produit par défaut
CONF_SEUIL        = 0.5
DELAI_SEC         = 4                  # Secondes min entre deux envois
STABILITE_REQUISE = 10                 # Frames stables avant envoi

# ═══════════════════════════════════════════════════
#  ÉTAT GLOBAL
# ═══════════════════════════════════════════════════
camera_active  = False
camera_thread  = None

# ═══════════════════════════════════════════════════
#  BACKEND : scan RFID
# ═══════════════════════════════════════════════════
def envoyer_presence(rfid: str):
    """POST /ouvriers/presence/:rfid → marque l'ouvrier comme Actif"""
    try:
        rfid_clean = rfid.strip().upper()
        r = requests.post(
            f"{BACKEND_URL}/ouvriers/presence/{rfid_clean}",
            timeout=5,
        )
        if r.status_code in (200, 201):
            data = r.json()
            print(f"✅ Badge validé : {data.get('ouvrier', rfid_clean)}")
        else:
            print(f"⚠️  Badge refusé (HTTP {r.status_code}) — RFID: {rfid_clean}")
    except requests.exceptions.ConnectionError:
        print(f"❌ Backend injoignable — RFID {rfid} mémorisé, réessai dans 5s")
        time.sleep(5)
        envoyer_presence(rfid)
    except Exception as e:
        print(f"❌ Erreur RFID → backend : {e}")


# ═══════════════════════════════════════════════════
#  BACKEND : ouvrier actif courant
# ═══════════════════════════════════════════════════
def get_ouvrier_actif() -> dict | None:
    """GET /ouvriers/last-session → retourne l'ouvrier Actif ou None"""
    try:
        r = requests.get(f"{BACKEND_URL}/ouvriers/last-session", timeout=3)
        if r.status_code == 200:
            data = r.json()
            if data.get("statut") == "Actif":
                return data
        return None
    except Exception as e:
        print(f"❌ Erreur récup ouvrier actif : {e}")
        return None


# ═══════════════════════════════════════════════════
#  YOLO : boucle d'analyse
# ═══════════════════════════════════════════════════
def boucle_yolo(ouvrier_id: int):
    global camera_active

    try:
        from ultralytics import YOLO
        import cv2

        print(f"⏳ Chargement modèle YOLO...")
        model = YOLO(MODEL_PATH)
        cap   = cv2.VideoCapture(0)

        if not cap.isOpened():
            print("❌ Impossible d'ouvrir la caméra")
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
                _envoyer_resultat(ouvrier_id, est_conforme, type_defaut, confiance)
                dernier_envoi  = now
                frames_stables = 0

        cap.release()

    except ImportError:
        print("❌ ultralytics ou cv2 non installé — pip install ultralytics opencv-python")
    except Exception as e:
        print(f"❌ Erreur YOLO : {e}")
    finally:
        camera_active = False
        if LED_GPIO:
            GPIO.output(LED_GPIO, GPIO.LOW)
        print("🛑 Caméra arrêtée")


def _envoyer_resultat(ouvrier_id: int, est_conforme: bool,
                      type_defaut: str | None, confiance: float):
    """Envoie les résultats YOLO au backend (qualite + production)"""
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
        statut = "CONFORME ✅" if est_conforme else f"DÉFAUT ❌ ({type_defaut})"
        print(f"📤 Envoi backend : {statut} — ouvrier #{ouvrier_id}")
    except Exception as e:
        print(f"⚠️  Erreur envoi backend : {e}")


# ═══════════════════════════════════════════════════
#  MQTT : callbacks
# ═══════════════════════════════════════════════════
def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print(f"✅ MQTT connecté → abonné à '{MQTT_TOPIC_RFID}'")
        client.subscribe(MQTT_TOPIC_RFID)
    else:
        print(f"❌ MQTT connexion échouée (code {rc})")


def on_message(client, userdata, msg):
    """Message reçu de l'ESP32 : {'rfid': 'ABCD1234'}"""
    try:
        payload = json.loads(msg.payload.decode("utf-8"))
        rfid    = payload.get("rfid", "").strip()
        if rfid:
            print(f"📡 RFID reçu via MQTT : {rfid}")
            threading.Thread(target=envoyer_presence, args=(rfid,), daemon=True).start()
        else:
            print(f"⚠️  Message MQTT sans champ 'rfid' : {payload}")
    except json.JSONDecodeError:
        # Fallback : payload est le RFID brut (string simple)
        rfid = msg.payload.decode("utf-8").strip()
        if rfid:
            print(f"📡 RFID brut reçu : {rfid}")
            threading.Thread(target=envoyer_presence, args=(rfid,), daemon=True).start()
    except Exception as e:
        print(f"❌ Erreur message MQTT : {e}")


# ═══════════════════════════════════════════════════
#  GPIO : bouton physique
# ═══════════════════════════════════════════════════
def on_bouton(channel):
    global camera_active, camera_thread

    if camera_active:
        # 2e appui = arrêt caméra
        camera_active = False
        print("🛑 Arrêt caméra demandé via bouton")
        return

    ouvrier = get_ouvrier_actif()
    if ouvrier is None:
        print("⚠️  Aucun ouvrier actif — scannez d'abord votre badge RFID")
        return

    ouvrier_id = ouvrier["id"]
    print(f"🔘 Bouton appuyé — lancement analyse pour {ouvrier['prenom']} {ouvrier['nom']}")

    camera_active = True
    camera_thread = threading.Thread(
        target=boucle_yolo, args=(ouvrier_id,), daemon=True
    )
    camera_thread.start()


# ═══════════════════════════════════════════════════
#  POINT D'ENTRÉE
# ═══════════════════════════════════════════════════
if __name__ == "__main__":
    print("=" * 50)
    print("  Gateway Pi — Smart Production")
    print("=" * 50)
    print(f"  Backend   : {BACKEND_URL}")
    print(f"  MQTT      : {MQTT_BROKER}:{MQTT_PORT}  topic={MQTT_TOPIC_RFID}")
    print(f"  Bouton    : GPIO {BOUTON_GPIO} (BCM)")
    print(f"  Modèle    : {MODEL_PATH}")
    print("=" * 50)

    # ── GPIO setup ──────────────────────────────
    GPIO.setmode(GPIO.BCM)
    GPIO.setup(BOUTON_GPIO, GPIO.IN, pull_up_down=GPIO.PUD_UP)
    GPIO.add_event_detect(
        BOUTON_GPIO, GPIO.FALLING, callback=on_bouton, bouncetime=300
    )
    if LED_GPIO:
        GPIO.setup(LED_GPIO, GPIO.OUT)
        GPIO.output(LED_GPIO, GPIO.LOW)

    # ── MQTT setup ──────────────────────────────
    mqtt_client = mqtt.Client(client_id="gateway_pi")
    mqtt_client.on_connect = on_connect
    mqtt_client.on_message = on_message

    try:
        mqtt_client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
    except Exception as e:
        print(f"❌ Impossible de se connecter au broker MQTT : {e}")
        print("   → Vérifiez que Mosquitto est installé : sudo apt install mosquitto")
        GPIO.cleanup()
        exit(1)

    print("✅ Gateway actif — en attente de badges RFID et du bouton...")

    try:
        mqtt_client.loop_forever()   # Bloquant — gère reconnexion automatique
    except KeyboardInterrupt:
        print("\n⏹️  Arrêt du gateway")
    finally:
        camera_active = False
        GPIO.cleanup()
        mqtt_client.disconnect()
