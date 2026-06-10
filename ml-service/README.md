# ML ConcilMed — Microservice

FastAPI service hosting the two scikit-learn models extracted from the
ConcilMed notebook:

- **Layer 2** — Patient prioritization (`VotingClassifier(HistGB + LogReg)`),
  predicts likelihood that a patient will have at least one DNI (drug
  reconciliation discrepancy). AUROC 0.86–0.98 on the original 3 batches,
  but performance is **almost entirely driven by `nb_meds_hosp`** (removing
  that single feature drops AUROC to ~0.5). Treat the score as a triage
  signal, not as a clinical truth.
- **Layer 4** — Omission severity (`HistGradientBoostingClassifier`),
  predicts whether a medication missing at admission is a *serious* omission
  (level 3). AUROC 0.72–0.79.

## Endpoints

All requests must include `Authorization: Bearer $ML_CONCILMED_API_KEY`.

### `POST /predict/layer2`
```json
{
  "age": 78,
  "sex": "F",
  "nb_comorbidites": 4,
  "has_insuffisance_renale": true,
  "has_insuffisance_hepatique": false,
  "nb_meds_hosp": 9,
  "via_urgences": true,
  "duree_sejour": 5,
  "service": "geriatrie",
  "creatinine": 110, "glucose": 1.3, "hba1c": 7.8,
  "kaliemie": 4.2, "pa_sys": 145, "pa_dia": 82, "crp": 18
}
```
Response:
```json
{ "score": 0.82, "label": 1, "model_version": "layer2-v1", "model_kind": "VotingClassifier" }
```

### `POST /predict/layer4`
```json
{
  "norm_name": "amlodipine",
  "atc_class": "C08CA01",
  "age": 78,
  "nb_meds_hosp": 9,
  "duree_sejour": 5,
  "service": "geriatrie"
}
```
Response:
```json
{ "severity_score": 0.71, "is_severe": 1, "model_version": "layer4-v1" }
```

### `POST /predict/layer4/batch`
Same shape, but `{ "items": [ ... ] }` — returns `{ "results": [ ... ] }`.

### `GET /healthz`
Returns `{"status":"ok","models":{"layer2":true,"layer4":true}}`.

## Local run
```bash
cd ml-service
pip install -r requirements.txt
export ML_CONCILMED_API_KEY=$(openssl rand -hex 32)
uvicorn app.main:app --reload --port 8000
```

## Deploy

### Render.com (recommended for POC)
1. New + → Web Service → connect this repo, root dir `ml-service/`
2. Runtime: Docker (uses the `Dockerfile`)
3. Add env var `ML_CONCILMED_API_KEY` (same value you set in Lovable secrets)
4. Deploy → copy the `https://…onrender.com` URL into `ML_CONCILMED_BASE_URL`

### Fly.io
```bash
cd ml-service
fly launch --no-deploy
fly secrets set ML_CONCILMED_API_KEY=$(openssl rand -hex 32)
fly deploy
```

### Hugging Face Spaces (Docker)
Push `ml-service/` to a Docker Space, add `ML_CONCILMED_API_KEY` as a Secret.

## Train / refresh models
The two `.joblib` files in `app/models/` are produced by the original
notebook (`notebook_concilmed.ipynb`). To retrain on the latest data, see
`app/train.py` (skeleton) and re-run it with the 3 batches in `data/`.
