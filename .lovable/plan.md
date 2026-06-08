
# Prototype mémoire — Conciliation Médicamenteuse assistée par IA

Extension du module existant pour couvrir les 4 piliers du sujet de mémoire de Clémentine Carrière Pelletier (DU IA Santé Hospitalière, 2026).

## Architecture cible (pipeline 3 couches)

```text
┌──────────────────────────────────────────────────────────────────┐
│ COUCHE 1 — OCR/NLP                                               │
│ Upload ordonnance (PDF/photo) → Lovable AI Vision (Gemini)       │
│ → extraction structurée DCI / dosage / posologie / voie          │
│ → pré-remplissage du Bilan Médicamenteux Optimisé (BMO)          │
├──────────────────────────────────────────────────────────────────┤
│ COUCHE 2 — Score de priorisation (risque DNI)                    │
│ Variables : âge, polypharmacie, classes ATC à risque, urgences,  │
│ comorbidités, insuffisance rénale, anticoagulants…               │
│ → score 0-100 + classification (faible / modéré / élevé)         │
│ Approche : règles pondérées inspirées modèle CHU Reims + IA      │
├──────────────────────────────────────────────────────────────────┤
│ COUCHE 3 — Détection de divergences                              │
│ BMO vs prescription d'admission → DNI / DID / DIND               │
│ Gravité : classes ATC, règles STOPP/START, interactions          │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌──────────────────────────────┐
              │ Dashboard mémoire            │
              │ • File priorisée patients    │
              │ • Métriques (précision DNI)  │
              │ • Dataset 200-500 synthétique│
              └──────────────────────────────┘
```

## Détails techniques

### 1. OCR ordonnances (Couche 1)

- Composant `OrdonnanceUploader` (ville) sur la fiche patient et dans le panneau de conciliation.
- ServerFn `extractOrdonnance` : reçoit fichier PDF/image (base64), appelle `google/gemini-3-flash-preview` en mode vision avec `Output.object` Zod → renvoie liste structurée `{ medicament, dosage, posologie, voie, frequence, prescripteur?, date? }`.
- Bouton « Importer ces médicaments » qui crée en batch les `traitements_habituels` du patient.
- Storage bucket privé `ordonnances` (RLS owner) pour conserver les sources.

### 2. Score de priorisation (Couche 2)

- Nouvelle table `risk_scores` (episode_id, score 0-100, niveau, variables_jsonb, computed_at).
- Module `src/lib/conciliation/riskScore.ts` (règles pondérées) :
  - âge ≥ 75 : +20 / 65-74 : +10
  - polypharmacie ≥ 5 médicaments : +15 / ≥ 10 : +25
  - anticoagulants / antidiabétiques / cardio à marge étroite : +10/classe
  - insuffisance rénale, hépatique (comorbidités) : +10
  - admission via urgences : +15
  - ≥ 3 comorbidités : +10
- ServerFn `computePrioritization` calcule + persiste.
- Possibilité d'un « avis IA » optionnel (gemini-3-flash) pour ajustement contextuel.

### 3. Détection DNI/DID/DIND (Couche 3)

- Renommage du résultat actuel (`divergences`) en classification trois classes :
  - **DNI** — divergence non intentionnelle (erreur)
  - **DID** — intentionnelle documentée
  - **DIND** — intentionnelle non documentée (à clarifier)
- Champ `intention` (`intentionnelle | non_intentionnelle | a_clarifier`) + `documentation` (texte justification clinicien) sur `conciliation_medicaments`.
- Algorithme + appel IA enrichis : règles STOPP/START locales (top 20 critères gériatriques) + détection interactions par classe ATC.
- Gravité : `mineur | modere | majeur | critique` (mapping ATC + règles).

### 4. Dataset synthétique + Dashboard évaluation

- Page `/dashboard` (mémoire) :
  - KPI : nb patients, nb épisodes, % épisodes à risque élevé, précision DNI vs ground-truth.
  - File priorisée (top 20 par score) avec lien direct vers conciliation.
  - Bouton « Générer dataset synthétique » → ServerFn `seedSyntheticCohort(n)` qui crée n=200 patients réalistes (profils Antilles : diabète, HTA, drépanocytose, polypharmacie) avec BMO + prescriptions d'admission contenant des DNI étiquetées (`ground_truth_label`).
- Table `ground_truth_dnis` pour stocker l'étiquetage attendu (par médicament/épisode).
- ServerFn `evaluatePrecision` : compare `divergences` détectées vs `ground_truth_dnis` → précision, rappel, F1, matrice de confusion.

## Schéma BDD — migrations à ajouter

- `ALTER TABLE conciliation_medicaments` : `intention`, `documentation`, `gravite`, `classe_atc`, `is_synthetic`.
- `CREATE TABLE risk_scores`.
- `CREATE TABLE ground_truth_dnis`.
- `ALTER TABLE patients` : `is_synthetic boolean default false`, `cohort_tag text`.
- Bucket Storage `ordonnances` (privé) + policies owner.

## Nouvelles routes

```text
/dashboard                 # KPI + file priorisée + évaluation (mémoire)
/patients/$id              # +OrdonnanceUploader
/episodes/$id              # +badge score, +intention/gravité par ligne
/evaluation                # détail métriques + matrice de confusion
```

## Fichiers principaux à créer / modifier

```text
src/lib/conciliation/
  ├─ riskScore.ts                  (règles pondérées)
  ├─ stoppStart.ts                 (top 20 critères)
  ├─ atcInteractions.ts            (table classes à risque)
  ├─ extractOrdonnance.functions.ts (vision IA)
  ├─ prioritize.functions.ts        (score + persist)
  ├─ evaluate.functions.ts          (précision/rappel)
  └─ seedSynthetic.functions.ts     (dataset 200 pts)

src/components/conciliation/
  ├─ OrdonnanceUploader.tsx
  ├─ RiskScoreBadge.tsx
  ├─ DivergenceClassifier.tsx       (DNI/DID/DIND)
  └─ EvaluationMatrix.tsx

src/routes/_authenticated/
  ├─ dashboard.tsx
  └─ evaluation.tsx
```

## Étapes d'implémentation

1. Migration BDD (colonnes intention/gravité, tables risk_scores + ground_truth_dnis, bucket storage)
2. Référentiels locaux : `atcInteractions.ts`, `stoppStart.ts`
3. Module `riskScore.ts` + ServerFn `computePrioritization` + badge
4. ServerFn `extractOrdonnance` (vision Gemini) + composant `OrdonnanceUploader`
5. Enrichir classification divergences (intention + gravité) + UI panneau
6. ServerFn `seedSyntheticCohort` (200 patients avec DNI étiquetées)
7. ServerFn `evaluatePrecision` + page `/evaluation`
8. Page `/dashboard` (KPI + file priorisée + bouton seed)
9. Test bout-en-bout : seed → priorisation → upload ordonnance → conciliation → évaluation

## Hors périmètre (réservé itérations futures)

- Vrai entraînement ML (regression logistique scikit) — on simule via règles pondérées + IA, ce que le sujet autorise pour le prototype.
- Connexion DPI réel (MIMIC-III, Thériaque API) — on utilise des seeds synthétiques.
- Export BMO/BME PDF, intervention pharmaceutique formalisée.
- Fine-tuning CamemBERT-bio — on utilise Gemini multimodal directement.
