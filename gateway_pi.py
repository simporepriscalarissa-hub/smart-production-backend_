#!/usr/bin/env python3
"""
Gateway Raspberry Pi — Smart Production
Architecture HTTP :

  ESP32 ──HTTP POST──► Pi (ce serveur :5000/rfid)
                            │
                            ▼
                       Backend NestJS (HTTP)
                            │
                            ▼
                       Dashboard (WebSocket)

  Bouton GPIO ──► Pi lance YOLO ──HTTP POST──► Backend
"""

import json
import time
import threading
import requests
from flask import Flask, request, jsonify
import RPi.GPIO as GPIO

# ═══════════════════════════════════════════════════
#  CONFIGURATION
# ═══════════════════════════════════════════════════
BACKEND_URL       = "https://smartproduction.duckdns.org"
PI_PORT           = 5000           # Port HTTP que l'ESP32 appellera
BOUTON_GPIO       = 17             # Pin BCM du bouton physique
LED_GPIO          = 27             # LED verte = caméra active (None pour désactiver)
MODEL_PATH        = "/home/pi/pfe/best.pt"
REFERENCE_DEFAULT = "JEAN-001"
CONF_SEUIL        = 0.5
DELAI_SEC         = 4
STABILITE_REQUISE = 10

# ═══════════════════════════════════════════════════
#  ÉTAT GLOBAL
# ═══════════════════════════════════════════════════
camera_active = False
camera_thread = None

# ═══════════════════════════════════════════════════
#  SERVEUR HTTP (reçoit l'ESP32)
# ═══════════════════════════════════════════════════
app = Flask(__name__)

@app.route('/rfid', methods=['POST'])
def recevoir_rfid():
    """
    L'ESP32 envoie :  POST http://IP_DU_PI:5000/rfid
                      Body JSON : {"rfid": "ABCD1234"}
    """
    data = request.get_json(silent=True) or {}
    rfid = data.get('rfid', '').strip().upper()

    if not rfid:
        return jsonify({"error": "Champ 'rfid' manquant"}), 400

    print(f"📡 RFID reçu de l'ESP32 : {rfid}")

    # Relayer au backend en arrière-plan pour ne pas bloquer l'ESP32
    threading.Thread(target=envoyer_presence_backend, args=(rfid,), daemon=True).start()

    return jsonify({"status": "ok", "rfid": rfid}), 200


@app.route('/status', methods=['GET'])
def status():
    """Endpoint de diagnostic"""
    ouvrier = get_ouvrier_actif()
    return jsonify({
        "gateway": "actif",
        "camera_active": camera_active,
        "ouvrier_actif": ouvrier,
    })


# ═══════════════════════════════════════════════════
#  BACKEND : envoyer le scan RFID
# ═══════════════════════════════════════════════════
def envoyer_presence_backend(rfid: str):
    """POST /ouvriers/presence/:rfid → marque l'ouvrier Actif"""
    try:
        r = requests.post(
            f"{BACKEND_URL}/ouvriers/presence/{rfid}",
            timeout=5,
        )
        if r.status_code in (200, 201):
            data = r.json()
            print(f"✅ Présence validée : {data.get('ouvrier', rfid)}")
        else:
            print(f"⚠️  Badge refusé (HTTP {r.status_code})")
    except Exception as e:
        print(f"❌ Erreur envoi présence backend : {e}")


# ═══════════════════════════════════════════════════
#  BACKEND : récupérer l'ouvrier actif
# ═══════════════════════════════════════════════════
def get_ouvrier_actif() -> dict | None:
    """GET /ouvriers/last-session → retourne l'ouvrier Actif ou None"""
    try:
        r = requests.get(f"{BACKEND_URL}/ouvriers/last-session", timeout=3)
        if r.status_code == 200:
            data = r.json()
            if data.get('statut') == 'Actif':
                return data
        return None
    except Exception as e:
        print(f"❌ Erreur récup ouvrier actif : {e}")
        return None


# ═══════════════════════════════════════════════════
#  YOLO : boucle d'analyse caméra
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
                envoyer_resultat(ouvrier_id, est_conforme, type_defaut, confiance)
                dernier_envoi  = now
                frames_stables = 0

        cap.release()

    except ImportError:
        print("❌ Manque : pip install ultralytics opencv-python")
    except Exception as e:
        print(f"❌ Erreur YOLO : {e}")
    finally:
        camera_active = False
        if LED_GPIO:
            GPIO.output(LED_GPIO, GPIO.LOW)
        print("🛑 Caméra arrêtée")


def envoyer_resultat(ouvrier_id: int, est_conforme: bool,
                     type_defaut: str | None, confiance: float):
    """Envoie les résultats YOLO au backend via HTTP"""
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
        print(f"📤 Envoi backend : {label} — ouvrier #{ouvrier_id}")
    except Exception as e:
        print(f"⚠️  Erreur envoi résultat : {e}")


# ═══════════════════════════════════════════════════
#  GPIO : bouton physique
# ═══════════════════════════════════════════════════
def on_bouton(channel):
    global camera_active, camera_thread

    if camera_active:
        camera_active = False
        print("🛑 Arrêt caméra (bouton)")
        return

    ouvrier = get_ouvrier_actif()
    if ouvrier is None:
        print("⚠️  Aucun ouvrier actif — scannez d'abord le badge RFID")
        return

    ouvrier_id = ouvrier['id']
    print(f"🔘 Bouton → lancement analyse pour {ouvrier['prenom']} {ouvrier['nom']} (#{ouvrier_id})")
    camera_active = True
    camera_thread = threading.Thread(
        target=boucle_yolo, args=(ouvrier_id,), daemon=True
    )
    camera_thread.start()


# ═══════════════════════════════════════════════════
#  DÉMARRAGE
# ═══════════════════════════════════════════════════
if __name__ == "__main__":
    print("=" * 52)
    print("  Gateway Pi — Smart Production")
    print("=" * 52)
    print(f"  Backend  : {BACKEND_URL}")
    print(f"  Serveur  : http://0.0.0.0:{PI_PORT}  (pour l'ESP32)")
    print(f"  Bouton   : GPIO {BOUTON_GPIO} (BCM)")
    print(f"  Modèle   : {MODEL_PATH}")
    print("=" * 52)

    # GPIO
    GPIO.setmode(GPIO.BCM)
    GPIO.setup(BOUTON_GPIO, GPIO.IN, pull_up_down=GPIO.PUD_UP)
    GPIO.add_event_detect(BOUTON_GPIO, GPIO.FALLING,
                          callback=on_bouton, bouncetime=300)
    if LED_GPIO:
        GPIO.setup(LED_GPIO, GPIO.OUT)
        GPIO.output(LED_GPIO, GPIO.LOW)

    # Flask dans un thread séparé (non-bloquant)
    flask_thread = threading.Thread(
        target=lambda: app.run(host='0.0.0.0', port=PI_PORT, debug=False),
        daemon=True
    )
    flask_thread.start()

    print(f"✅ Serveur HTTP actif sur le port {PI_PORT}")
    print("✅ Bouton GPIO prêt")
    print("En attente de badges RFID et du bouton...\n")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n⏹️  Arrêt du gateway")
    finally:
        camera_active = False
        GPIO.cleanup()
