from ultralytics import YOLO
import cv2, requests, time

# ─── CONFIGURATION ──────────────────────────────────────────
MODEL_PATH = "/home/ilef/pfe_final/11m.pt"
BACKEND    = "http://localhost:3001"
REFERENCE  = "JEAN-001"
CONF_SEUIL = 0.5
DELAI_SEC  = 4
STABILITE_REQUISE = 10

def get_active_worker():
    """ Récupère l'ID de l'ouvrier et vérifie s'il est actif """
    try:
        r = requests.get(f"{BACKEND}/ouvriers/last-session", timeout=2)
        if r.status_code == 200:
            data = r.json()
            
            #  On vérifie le statut avant de continuer ---
            if data.get('statut') == 'Inactif':
                print(f"❌ ACCÈS REFUSÉ : {data['prenom']} {data['nom']} est INACTIF.")
                return None
            
            print(f"👤 Ouvrier identifié : {data['nom']} (ID: {data['id']})")
            return data['id']
        return None
    except Exception as e:
        # print(f"Erreur connexion backend: {e}")
        return None

# ─── INITIALISATION ─────────────────────────────────────────
print("⏳ Chargement du modèle...")
model = YOLO(MODEL_PATH)
cap   = cv2.VideoCapture(0)

# ATTENTE DE CONNEXION RFID
print("📡 En attente d'un badge RFID ACTIF sur le poste...")
OUVRIER_ID = None
while OUVRIER_ID is None:
    OUVRIER_ID = get_active_worker()
    if OUVRIER_ID is None:
        time.sleep(2) 

# Variables de contrôle
dernier_envoi = 0
compteur_conforme = 0
compteur_non_conforme = 0
frames_stables = 0
dernier_statut_detecte = None

# --- DÉBUT DE LA BOUCLE PRINCIPALE ---
while True:
    ret, frame = cap.read()
    if not ret: 
        break

    results = model(frame, conf=CONF_SEUIL, verbose=False)
    annotated_frame = results[0].plot()
    
    defauts = results[0].boxes
    est_conforme = len(defauts) == 0
    
    if est_conforme:
        statut_actuel = "conforme"
        type_defaut = None
        confiance = 0.0
    else:
        confs = [float(b.conf[0]) for b in defauts]
        idx_max = confs.index(max(confs))
        type_defaut = results[0].names[int(defauts[idx_max].cls[0])]
        statut_actuel = f"defaut_{type_defaut}"
        confiance = confs[idx_max]

    # --- LOGIQUE DE STABILITÉ ---
    if statut_actuel == dernier_statut_detecte:
        frames_stables += 1
    else:
        frames_stables = 0
        dernier_statut_detecte = statut_actuel

    temps_actuel = time.time()
    
    if frames_stables >= STABILITE_REQUISE and (temps_actuel - dernier_envoi > DELAI_SEC):
        
        payload_qualite = {
            "ouvrierId": OUVRIER_ID, 
            "reference": REFERENCE,
            "statutIA": "conforme" if est_conforme else "non_conforme",
            "typeDefaut": type_defaut,
            "scoreConfiance": round(confiance, 4),
            "dateDetection": time.strftime("%Y-%m-%dT%H:%M:%SZ")
        }

        payload_production = {
            "ouvrierId": OUVRIER_ID,
            "reference": REFERENCE,
            "quantiteProduite": 1,
            "quantiteConforme": 1 if est_conforme else 0,
            "quantiteNonConforme": 0 if est_conforme else 1
        }

        try:
            requests.post(f"{BACKEND}/qualite", json=payload_qualite, timeout=2)
            requests.post(f"{BACKEND}/production", json=payload_production, timeout=2)

            if est_conforme:
                compteur_conforme += 1
            else:
                compteur_non_conforme += 1
            
            print(f"✅ [ENVOI] {statut_actuel.upper()} pour ID:{OUVRIER_ID}")
            dernier_envoi = temps_actuel
            frames_stables = 0 
            
        except Exception as e:
            print(f"⚠️ Erreur backend : {e}")

    # Affichage
    cv2.putText(annotated_frame, f"Ouvrier Actif ID: {OUVRIER_ID}", (10, 30), 
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
    cv2.imshow("Controle Qualite PFE", annotated_frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()