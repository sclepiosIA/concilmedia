## Objectif

Transformer `/_authenticated/evaluation` en banc d'essai cohorte :
1. Upload massif de fichiers patients (multi-patient, multi-doc) avec tag cohorte
2. Tri IA automatique (patient, document, traitement habituel, bio, prescription hospi)
3. Conciliation IA automatique sur chaque épisode créé
4. Upload du PDF pharmacien (gold standard) par patient
5. Analyse de corrélation IA vs pharmacien + stats cohorte
6. Benchmark LLM vs ML sur 3 axes : triage patient complexe, détection DNI, sévérité

## Flux utilisateur

```text
[1] Saisir tag cohorte (ex. "lot-mars-cardio")
    │
[2] Drop N fichiers (ordo ville, lettres admission, ordo hospi, bio, CRH)
    │   → BulkPatientImport existant (extract + commit) avec cohort_tag
    │   → IA classe par patient + crée épisodes auto
    │
[3] Bouton "Lancer conciliation IA cohorte"
    │   → boucle sur les épisodes créés
    │   → analyzePatientConciliationComplete pour chacun
    │
[4] Pour chaque patient : drop du PDF pharmacien (gold standard)
    │   → extractPharmacistGoldStandard (nouvelle serverFn)
    │   → JSON normalisé : { divergences:[{med, type, severite}], triage_complexe:bool }
    │
[5] Bouton "Calculer corrélation cohorte"
    │   → comparePharmacistVsIA (nouvelle serverFn)
    │   → calcule TP/FP/FN par patient et global
    │   → calcule aussi métriques ML (Layer2 triage, Layer4 severity)
    │
[6] Dashboard de résultats
    │   ├── Métriques cohorte (precision/recall/F1 IA vs pharmacien)
    │   ├── Stats par patient (table triable)
    │   ├── Comparatif LLM vs ML (3 onglets)
    │   └── Export CSV
```

## Détail technique

### Base de données (1 migration)

- `cohorts` (nouveau) : `id`, `tag`, `label`, `created_by`, `created_at`
- `patients.cohort_id uuid null` (nouveau) — set à l'import
- `pharmacist_gold_standards` (nouveau) :
  - `id`, `patient_id`, `episode_id`, `cohort_id`
  - `storage_path`, `file_name`, `extracted_json jsonb`
  - `triage_complexe boolean`, `nb_divergences int`
  - `uploaded_by`, `created_at`
- `cohort_evaluations` (nouveau) : cache des runs avec
  - `cohort_id`, `metrics_ia jsonb`, `metrics_ml jsonb`, `per_patient jsonb`, `computed_at`
- GRANTs + RLS scoping par `created_by` / `cohort.created_by`

### Server functions (nouvelles)

| Fichier | Fonctions |
|---|---|
| `src/lib/cohort/cohort.functions.ts` | `createCohort`, `listCohorts`, `getCohortPatients` |
| `src/lib/cohort/runCohortConciliation.functions.ts` | Boucle `analyzePatientConciliationComplete` sur épisodes d'une cohorte, retourne progression |
| `src/lib/cohort/goldStandard.functions.ts` | `uploadPharmacistGoldPDF` (storage `ordonnances`), `extractPharmacistGoldStandard` (LLM → JSON normalisé), `listGoldStandards` |
| `src/lib/cohort/evaluateCohort.functions.ts` | `comparePharmacistVsIA` (TP/FP/FN par patient + global, par type de divergence, par sévérité) + `computeMLBaselines` (appelle `predictLayer2Sync` + heuristique détection + `predictLayer4Sync`) |

### Réutilisation existante

- `BulkPatientImportModal` : ajout d'une prop `cohortId` → propage dans `commitBulkImport`
- `extractPatientDossier` / `commitBulkImport` : reçoivent `cohort_id` optionnel, le copient sur `patients.cohort_id`
- `analyzePatientConciliationComplete` : appelé tel quel
- `mlConcilmed.server.ts` : `predictLayer2Sync` + `predictLayer4Sync` réutilisés sans modification

### UI — `src/routes/_authenticated/evaluation.tsx` (refonte)

Page à onglets :
- **Onglet "Import cohorte"** : input tag cohorte + zone drop + bouton "Importer". Table de progression par fichier.
- **Onglet "Conciliation IA"** : liste épisodes de la cohorte, bouton "Lancer", barre progression, statut par patient.
- **Onglet "Gold standard pharmacien"** : tableau patients × bouton upload PDF + badge "extrait" / "manquant".
- **Onglet "Résultats"** :
  - Cards : Precision / Recall / F1 IA vs Pharma
  - Tableau par patient (DNI détectées IA, DNI pharma, accord %)
  - Section "LLM vs ML" — 3 sous-cartes (Triage / Détection / Sévérité) avec métriques côte à côte
  - Bouton "Export CSV"

Composants nouveaux :
- `src/components/cohort/CohortImportTab.tsx`
- `src/components/cohort/CohortRunTab.tsx`
- `src/components/cohort/GoldStandardTab.tsx`
- `src/components/cohort/CohortResultsTab.tsx`
- `src/components/cohort/LLMvsMLPanel.tsx`

### Prompt extraction gold-standard

Schéma strict :
```json
{
  "patient": { "nom":"...", "prenom":"...", "date_naissance":"YYYY-MM-DD" },
  "triage_complexe": true,
  "divergences": [
    { "medicament":"...", "type":"omission|ajout|modification|substitution",
      "severite":"mineure|moderee|majeure|critique", "commentaire":"..." }
  ]
}
```

### Algorithme corrélation (par patient puis agrégé)

- Match med par DCI normalisée (lower + sans espace) + type
- TP = match IA ∩ pharma | FP = IA only | FN = pharma only
- Precision, Recall, F1 + accord pondéré par sévérité
- Pour le triage : confusion matrix IA-triage vs pharma-triage vs ML-triage

## Hors scope (à confirmer plus tard)

- Pas de re-training ML automatique
- Pas de notification/email
- Garde la page synthétique existante en lecture seule (route `/evaluation-synth` si besoin) — non prioritaire

## Fichiers touchés

**Nouveaux** : 1 migration + 4 fichiers `.functions.ts` + 5 composants React + 1 route éventuelle
**Modifiés** : `evaluation.tsx`, `BulkPatientImportModal.tsx`, `bulkImport.functions.ts` (param cohort_id)
