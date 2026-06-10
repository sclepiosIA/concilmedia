# ConcilMed ML Service

FastAPI microservice exposing the two scikit-learn models from the ConcilMed notebook:

- **Étage 2** — `POST /predict/layer2` : priorisation patient (proba DNI sur un séjour)
- **Étage 4** — `POST /predict/layer4` + `POST /predict/layer4/batch` : gravité d'un oubli médicamenteux
- `GET /health` — version des modèles + hash

## Lancer en local

```bash
cd ml-service
pip install -r requirements.txt
python train.py --data-dir data --out-dir models   # produit layer2.joblib + layer4.joblib + meta.json
ML_API_KEY=changeme uvicorn app:app --reload --port 8000
```

## Déployer (Render / Railway / Fly.io)

Build command : `pip install -r requirements.txt`
Start command : `uvicorn app:app --host 0.0.0.0 --port $PORT`

Variables d'environnement :
- `ML_API_KEY` — clé partagée (à recopier dans le secret `ML_CONCILMED_API_KEY` de l'app)
- `MODELS_DIR` (optionnel) — chemin vers les `.joblib`, défaut `models/`

Ou avec le Dockerfile fourni : `docker build -t concilmed-ml .` puis pousse sur Fly/Railway.

## Brancher l'app

1. Déployer ce service → noter l'URL publique (ex. `https://concilmed-ml.fly.dev`).
2. Dans l'app, page `/admin/ai/providers`, éditer **ML ConcilMed** : coller l'URL dans `base_url`, activer le provider.
3. Ajouter le secret `ML_CONCILMED_API_KEY` côté app (= `ML_API_KEY` du service).
4. Dans `/admin/ai`, pour chaque tâche éligible (`prioritize_patient`, `analyze`, `validate_conciliation`),
   choisir le mode d'exécution : **LLM seul**, **ML seul** ou **ML + LLM côte-à-côte**.

## Ré-entraîner

Recopier de nouveaux fichiers `.xlsx` dans `data/<lot>/` (mêmes noms de colonnes que les 3 lots fournis) puis :

```bash
python train.py
```

Re-commit les `.joblib` ou redéploie le service.
