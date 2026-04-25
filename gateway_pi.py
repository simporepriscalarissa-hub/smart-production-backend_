import cv2
import requests
import time
import json
import RPi.GPIO as GPIO
import os
import paho.mqtt.client as mqtt
from ultralytics import YOLO

# --- CONFIGURATION ---
BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "best.pt")

BACKEND_URL    = "https://smartproduction.duckdns.org"
MQTT_BROKER    = "localhost"
TOPIC_RFID     = "production/rfid"
TOPIC_RESPONSE = "production/rfid/response"
BUTTON_PIN     = 17

REFERENCE_DEFAULT = "JEAN-001"
CONF_SEUIL        = 0.5
DELAI_SEC         = 4       # secondes min entre deux envois backend
STABILITE_REQUISE = 10      # frames stables avant envoi

# --- INITIALISATION ---
print(f"⏳ Chargement du modèle depuis : {MODEL_PATH}")
if not os.path.exists(MODEL_PATH):
    print(f"❌ ERREUR : {MODEL_PATH} introuvable !")
    exit()

model = YOLO(MODEL_PATH)
GPIO.setmode(GPIO.BCM)
GPIO.setup(BUTTON_PIN, GPIO.IN, pull_up_down=GPIO.PUD_UP)

active_worker_id = None
camera_active    = False

# --- VALIDATION RFID → BACKEND ---
def validate_worker(rfid_code):
    """
    POST /ouvriers/presence/:rfid
    Marque l'ouvrier comme Actif en BDD et retourne ses infos.
    """
    global active_worker_id
    try:
        rfid_clean = rfid_code.strip().upper()
        url = f"{BACKEND_URL}/ouvriers/presence/{rfid_clean}"
        print(f"🔍 Vérification badge {rfid_clean} → {url}")

        res = requests.post(url, timeout=5)
        print(f"📡 Réponse backend : {res.text}")

        if res.status_code in (200, 201):
            data = res.json()
            # Le backend retourne { status, message, ouvrier: "Prénom Nom" }
            # On récupère l'ID via last-session
            session = requests.get(f"{BACKEND_URL}/ouvriers/last-session", timeout=3)
            if session.status_code == 200:
                active_worker_id = session.json().get('id')
            print(f"✅ Accès accordé — ouvrier ID : {active_worker_id}")
            return True
        else:
            print(f"❌ Badge refusé (HTTP {res.status_code})")
            active_worker_id = None
            return False

    except Exception as e:
        print(f"⚠️ Erreur connexion backend : {e}")
        return False

# --- ENVOI RÉSULTAT YOLO → BACKEND ---
def envoyer_resultat(ouvrier_id, est_conforme, type_defaut, confiance):
    """POST /qualite + /production avec le bon format"""
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
        print(f"📤 Envoyé : {label} — ouvrier #{ouvrier_id}")
    except Exception as e:
        print(f"☁️ Erreur envoi backend : {e}")

# --- CALLBACK MQTT ---
def on_message(client, userdata, msg):
    rfid_code = msg.payload.decode().strip()
    print(f"\n📥 RFID reçu de l'ESP32 : {rfid_code}")

    if validate_worker(rfid_code):
        reponse = json.dumps({"status": "autorise", "ouvrierId": active_worker_id})
        client.publish(TOPIC_RESPONSE, reponse)
    else:
        client.publish(TOPIC_RESPONSE, json.dumps({"status": "refuse"}))

# --- CONFIGURATION MQTT ---
mqtt_client = mqtt.Client()
mqtt_client.on_message = on_message
try:
    mqtt_client.connect(MQTT_BROKER, 1883, 60)
    mqtt_client.subscribe(TOPIC_RFID)
    mqtt_client.loop_start()
    print("✅ Connecté au broker MQTT local.")
except Exception as e:
    print(f"❌ Impossible de se connecter au broker MQTT : {e}")

# --- BOUCLE PRINCIPALE ---
def main():
    global active_worker_id, camera_active
    print("🚀 Système prêt ! Scannez un badge puis appuyez sur le bouton.")

    try:
        while True:
            # Bouton appuyé
            if GPIO.input(BUTTON_PIN) == GPIO.LOW:
                time.sleep(0.05)  # anti-rebond

                if camera_active:
                    # 2e appui = arrêt caméra
                    camera_active = False
                    print("🛑 Arrêt session demandé.")
                    time.sleep(0.5)
                    continue

                if active_worker_id is None:
                    print("⚠️ Aucun ouvrier identifié — scannez d'abord votre badge !")
                    time.sleep(1)
                    continue

                # Démarrage session YOLO
                print(f"📸 Démarrage session pour ouvrier #{active_worker_id}")
                camera_active = True
                cap = cv2.VideoCapture(0)

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

                    # Stabilité : n'envoie que si le même statut est stable
                    if statut_actuel == dernier_statut:
                        frames_stables += 1
                    else:
                        frames_stables = 0
                        dernier_statut = statut_actuel

                    now = time.time()
                    if frames_stables >= STABILITE_REQUISE and (now - dernier_envoi > DELAI_SEC):
                        envoyer_resultat(active_worker_id, est_conforme, type_defaut, confiance)
                        dernier_envoi  = now
                        frames_stables = 0

                    # Vérifier si bouton appuyé pour arrêter
                    if GPIO.input(BUTTON_PIN) == GPIO.LOW:
                        time.sleep(0.05)
                        camera_active = False

                cap.release()
                print("⏹️ Session terminée. Prêt pour le prochain badge.")
                active_worker_id = None
                camera_active    = False

            time.sleep(0.1)

    except KeyboardInterrupt:
        print("👋 Arrêt du script...")
    finally:
        camera_active = False
        GPIO.cleanup()
        mqtt_client.loop_stop()

if __name__ == "__main__":
    main()
