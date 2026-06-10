
# Intégration du modèle ML ConcilMed comme alternative/complément au LLM

## Ce que contient le ZIP

Le notebook `ConcilMed_Etage2_Etage4.ipynb` entraîne deux modèles scikit-learn sur 3 lots de données réelles :

| Modèle | But | Algo | Perf rapportée |
|---|---|---|---|
| **Étage 2** (priorisation) | Pour un séjour : proba qu'il contienne ≥ 1 oubli (DNI) | `VotingClassifier(HistGradientBoosting + LogReg)` | AUROC 0.86–0.98 (très tiré par `nb_meds_hosp`) |
| **Étage 4** (gravité) | Pour un médicament *à domicile, absent à l'hôpital* : proba que l'oubli soit **grave (niveau 3)** | `HistGradientBoostingClassifier` | AUROC 0.72–0.79 |

Features Étage 2 : age, sexe, comorbidités (diabète, IRC, obésité, HTA, DID, DNID), score_comorb, nb_meds_chron, nb_meds_hosp, service, durée séjour, biologie (créat, glucose, HbA1c, K, PAS, CRP).
Features Étage 4 : même chose + `nn` (nom médicament normalisé via la fonction `norm_name`).

## Choix par défaut (skip questions)

1. **Hébergement** : microservice Python FastAPI séparé (le plus fidèle au notebook). Scaffold dans `ml-service/` du repo, tu le déploies sur Render/Railway/Fly.io. L'app appelle son URL HTTP via un nouveau provider `ml_concilmed`.
2. **Mode mixte ML+LLM** : **côte-à-côte** par défaut (les deux scores sont affichés avec badge d'écart). On garde une porte ouverte pour le mode "ML filtre, LLM justifie" en V2.
3. **Modèles** : pré-entraînés une fois sur les 3 lots fournis, sérialisés en `.joblib` et committés dans `ml-service/models/`. Réentraînement = manuel pour l'instant.

## Quoi remplacer (correspondance LLM ↔ ML)

| Endpoint LLM actuel | Modèle ML équivalent | Action |
|---|---|---|
| `prioritize` / `riskScore` patient (dashboard) | Étage 2 | Nouvelle source au choix : LLM, ML, ou les deux |
| `analyze` — détection DNI dans `AIAnalysisPanel` | Étage 2 (filtre patient) + Étage 4 (gravité par méd) | Idem |
| `validateConciliation` — gravité divergence | Étage 4 | Idem |
| `extractOrdonnance`, `extractBiologie`, `extractLettreAdmission`, `pharmacistDoc`, `matchPrescriptionAI`, `analyzePatientSynthesis`, `analyzePatientConciliationComplete`, `bulkImport` | — | Inchangé (pas d'équivalent ML, c'est du NLP / extraction libre) |

## Architecture cible

```text
┌──────────────────────┐         HTTPS          ┌────────────────────────┐
│ TanStack Start app   │ ─────────────────────▶ │ ml-service (FastAPI)   │
│ runAITask.server.ts  │   Bearer ML_API_KEY    │  /predict/layer2       │
│ → provider kind:     │                        │  /predict/layer4       │
│   "ml_concilmed"     │                        │  /health               │
└──────────────────────┘                        │  models/*.joblib       │
                                                └────────────────────────┘
```

## Étapes d'implémentation

### 1. Scaffold du microservice `ml-service/`

```text
ml-service/
├── app.py                  # FastAPI : /health, /predict/layer2, /predict/layer4
├── train.py                # Re-entraînement reproductible (lit data/*.xlsx)
├── ml/
│   ├── norm.py             # norm_name() copié du notebook
│   ├── layer2.py           # build_features_layer2 + pipeline
│   └── layer4.py           # build_features_layer4 + pipeline
├── models/
│   ├── layer2.joblib       # généré par train.py, committé
│   └── layer4.joblib
├── data/                   # les 3 lots du ZIP (gitignored ou DVC)
├── requirements.txt        # fastapi, uvicorn, scikit-learn, pandas, joblib, openpyxl
├── Dockerfile
└── README.md               # déploiement Render/Railway/Fly + ENV ML_API_KEY
```

Endpoints :

- `POST /predict/layer2` — corps : `{ sejour: {age, gender, did, dnid, diabete, irc, obesite, score_comorb, nb_meds_chron, nb_meds_hosp, service, los_j, creat, gluc, hba1c, k, pas, crp} }` → `{ proba_dni: 0.87, threshold: 0.5, label: "à vérifier" }`
- `POST /predict/layer4` — corps : `{ sejour: {...}, medication_name: "warfarine 5 mg" }` → `{ proba_grave: 0.62, threshold: 0.5, label: "grave probable", med_normalized: "warfarine" }`
- `POST /predict/layer4/batch` — pareil mais liste de médicaments (utile pour analyser une ordo entière en un appel).
- `GET /health` — renvoie versions modèles et hash du fichier joblib.
- Auth : header `Authorization: Bearer ${ML_API_KEY}` (clé partagée, vérifiée par middleware FastAPI).

### 2. Base de données — extension du système provider

Migration Supabase :

```sql
-- Ajoute "ml_concilmed" comme provider possible
-- (le champ kind est déjà text, pas d'enum à modifier)

-- Seed du provider ML
INSERT INTO public.ai_providers (name, kind, base_url, is_active, extra_config)
VALUES ('ML ConcilMed', 'ml_concilmed', 'https://your-ml-service.fly.dev', false,
        '{"layer2_threshold": 0.5, "layer4_threshold": 0.5}'::jsonb);

-- 2 nouvelles "ai_tasks" pour l'admin (même table, même UI éditeur)
INSERT INTO public.ai_tasks (slug, label, description, model, provider_id, system_prompt)
VALUES
  ('ml_prioritize_patient', 'ML — Priorisation patient (Étage 2)',
   'Score de risque DNI calculé par HistGradientBoosting+LogReg',
   'layer2', NULL, ''),
  ('ml_omission_severity', 'ML — Gravité d''un oubli (Étage 4)',
   'Probabilité qu''un médicament oublié soit un oubli grave (niv 3)',
   'layer4', NULL, '');

-- Préférence par tâche : 'llm' | 'ml' | 'both' (par tenant/admin, table app_settings ou ai_tasks.extra)
ALTER TABLE public.ai_tasks ADD COLUMN execution_mode text NOT NULL DEFAULT 'llm'
  CHECK (execution_mode IN ('llm','ml','both'));
```

### 3. Côté app — `runAITask` étendu

`src/lib/ai/runAITask.server.ts` :

- Ajout du `ProviderKind` `"ml_concilmed"` dans le union type.
- Nouveau helper `callMlConcilmed(provider, taskSlug, payload)` qui POSTe sur `${provider.base_url}/predict/{layer2|layer4}` avec `Authorization: Bearer ${process.env.ML_CONCILMED_API_KEY}` et `extra_config` du provider pour les seuils.
- Nouvelle fonction `runMixedTask(slug, payload)` qui :
  - lit `ai_tasks.execution_mode`
  - si `llm` → `runAITask` existant
  - si `ml` → `callMlConcilmed`
  - si `both` → lance les deux en parallèle (`Promise.allSettled`) et renvoie `{ llm, ml, agreement: boolean, deltaScore }`

### 4. Secret + provider config

Nouveau secret runtime à provisionner via le panneau Cloud : `ML_CONCILMED_API_KEY` (clé partagée entre l'app et le microservice). Le `base_url` du microservice se gère dans la page admin existante `/admin/ai/providers`.

### 5. Branchement dans les endpoints métier

Modifications surgicales (le contrat de retour côté front reste inchangé pour LLM-only) :

- `src/lib/conciliation/prioritize.functions.ts` → utilise `runMixedTask("prioritize_patient", …)` qui sait router vers ML (Étage 2) ou LLM. Côté DB, le champ `risk_scores.source` devient `"llm" | "ml" | "consensus"` pour traçabilité.
- `src/lib/conciliation/analyze.functions.ts` → quand `execution_mode='both'`, on stocke deux `conciliation_ai_analyses` (un avec `source="llm"`, un `source="ml"`) — colonne à ajouter à la table si absente.
- `src/lib/conciliation/validateConciliation.functions.ts` → l'évaluation de gravité par médicament passe par Étage 4 (batch) avant ou en plus du LLM.

### 6. UI admin — sélecteur de mode

Dans `src/routes/_authenticated/admin.ai.tasks.$slug.tsx`, pour les tâches éligibles (slug ∈ `{ prioritize_patient, analyze, validate_conciliation }`), ajouter un `RadioGroup` :
- ⚪ LLM uniquement
- ⚪ ML uniquement (uniquement si tâche couverte par un modèle ML)
- ⚪ ML + LLM (côte-à-côte)

Sauvegarde dans `ai_tasks.execution_mode`.

### 7. UI clinique — affichage des deux scores

Dans `src/components/conciliation/AIAnalysisPanel.tsx` et la carte de risque du dashboard :

- Mode `llm` → inchangé.
- Mode `ml` → carte simple "Score ML : 0.87 — patient à vérifier" + footer "Modèle Étage 2 (HistGB+LR)".
- Mode `both` → deux barres parallèles (LLM vs ML) avec :
  - badge **vert "consensus"** si même verdict
  - badge **amber "divergence"** + tooltip "LLM=0.42 / ML=0.81" sinon
  - sur les alertes de gravité (Étage 4) → colonne ajoutée "Gravité ML" dans `ClinicalAlertsPanel`.

### 8. Document `ml-service/README.md`

Procédure de déploiement Render/Railway/Fly + variables :
- `ML_API_KEY` (à coller dans le secret app `ML_CONCILMED_API_KEY`)
- Commande build : `pip install -r requirements.txt`
- Commande start : `uvicorn app:app --host 0.0.0.0 --port $PORT`

Avec un bouton "Test" dans `/admin/ai/providers` qui ping `/health` du microservice pour valider la config.

## Hors scope V1

- Réentraînement automatique depuis l'admin (endpoint `/train` à venir).
- Mode "ML filtre, LLM justifie" (V2 : ML pré-trie, LLM ne rédige la justification que sur les top-N).
- Calibration des seuils par site / spécialité.
- Logging détaillé des écarts ML vs LLM pour analyse rétroactive.

## Note importante (transparence)

Le notebook conclut lui-même que l'Étage 2 est presque entièrement porté par `nb_meds_hosp` (retirer cette variable ramène l'AUROC à 0.5). C'est utile en pratique mais ce n'est pas un modèle "riche". Je le mentionnerai dans la doc admin de la tâche `ml_prioritize_patient` pour que l'utilisateur sache exactement ce qu'il déclenche.
