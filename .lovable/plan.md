
## Objectif

Permettre dans l'onglet « 1. Import cohorte » d'uploader **en une fois** le jeu complet d'une cohorte synthétique au format détecté dans vos fichiers :

| Fichier | Contenu | Clé |
|---|---|---|
| `patients.xlsx` | démographie, comorbidités (HTA, diabète, IRC…) | `patient_id` (ex. `PATE3707CF4`) |
| `sejours.xlsx` | séjours hospitaliers, motif, service, bio d'entrée | `sejour_id` ↔ `patient_id` |
| `prescriptions.xlsx` | prescriptions hospitalières (DCI, dose, voie, fréquence) | `sejour_id` |
| `meds_chron.xlsx` | BMO/traitements habituels (source = `BMO_entree`) | `sejour_id` |
| `divergences.xlsx` | gold standard pharmacien (type, gravité, justification) | `sejour_id` |
| `ordonnances.zip` | PDFs ville `PATxxx_{mg\|ca\|en\|ne}.pdf` | `patient_id` |
| `bilansbio.zip` | PDFs bio `PATxxx.pdf` | `patient_id` |

Chaque fichier est **optionnel et indépendant** — l'utilisateur peut n'uploader que ce qu'il a.

## UI (onglet « 1. Import cohorte »)

Nouvelle carte **« Import dataset cohorte (multi-fichiers) »** au-dessus du roster CSV existant, avec une grille de 7 dropzones (une par type), un bouton « Tout importer », et un récapitulatif (lignes valides / erreurs / PDFs mappés). Les 3 cartes restantes (roster CSV, PDF unitaire, gold standard) ne bougent pas.

Mapping intelligent : un fichier déposé est auto-classé par son nom (`patients.xlsx` → patients, `*.zip` contenant `bilans` → bilans). L'utilisateur peut corriger via un select.

## Parsing client (browser)

- XLSX : `xlsx` déjà installé, lecture via `await import("xlsx")` dans le handler (pas au top-level — SSR safe).
- ZIP : ajout de `jszip` (pur JS, edge-compatible) pour lister/extraire les PDFs côté navigateur en base64.
- Normalisation des dates Excel (number serial) → ISO `YYYY-MM-DD` via `XLSX.SSF`.
- Détection d'erreurs évidentes (cf. `sejours.xlsx` où certaines colonnes bio contiennent des serials Excel = données corrompues à la source) : on ignore les valeurs aberrantes (>10000) avec un warning, on garde la ligne.
- Aperçu de 5 lignes/fichier + nombre de PDFs trouvés.

## Serveur (3 nouvelles serverFn dans `src/lib/cohort/`)

1. `importCohortDataset.functions.ts` — `POST`, `requireSupabaseAuth`, Zod strict :
   - input : `{ cohortId, patients[], sejours[], prescriptions[], medsChron[], divergences[] }` (chaque liste optionnelle, max 5000)
   - upsert `patients` (clé externe = `patient_id` → stocké dans `notes` ou nouvelle colonne `external_ref`), crée les `episodes` (= sejours), `prescriptions_hospitalieres`, `traitements_habituels`, `pharmacist_divergences_gold`.
2. `importCohortPdfBundle.functions.ts` — `POST` par PDF (appelé en boucle côté client avec progress bar) :
   - input : `{ cohortId, externalPatientRef, kind: "ordonnance_ville"|"bilan_bio", subtype?: "mg"|"ca"|"en"|"ne", fileName, mimeType, fileBase64 }`
   - upload dans bucket `ordonnances`, insert dans `documents_sources` lié au patient résolu via `external_ref`.
3. (réutilise les tables existantes ; voir migration ci-dessous)

## Migration DB

Une seule migration :
- `ALTER TABLE patients ADD COLUMN external_ref TEXT` + `CREATE UNIQUE INDEX patients_cohort_external_ref_uidx ON patients(cohort_id, external_ref) WHERE external_ref IS NOT NULL` — permet de mapper les `PATxxx` aux UUID internes et de dédupliquer entre upload XLSX et upload ZIP.
- `ALTER TABLE episodes ADD COLUMN external_ref TEXT` (pour `sejour_id`).
- Idem `prescriptions_hospitalieres` et `traitements_habituels` : colonne `source_sejour_ref TEXT` pour rattacher avant que les episodes ne soient créés (ou ordre d'insert : patients → episodes → presc/meds → divergences).
- Pas de nouvelle table : tout passe par les tables cohorte existantes.

## Détails techniques

- **Ordre d'import** côté serveur : patients → sejours → (prescriptions + meds_chron en parallèle) → divergences → PDFs. Chaque étape résout les FK via `external_ref`.
- **Idempotence** : `ON CONFLICT (cohort_id, external_ref) DO UPDATE` sur patients/episodes pour qu'un ré-upload mette à jour sans dupliquer.
- **PDFs** : uploadés un par un (FormData base64) pour éviter de dépasser la limite payload du worker ; barre de progression `x / N`.
- **Mapping noms** : les `PATxxx` n'ont pas de nom/prénom → on génère `Patient PATxxx` comme `nom`, ID comme `prenom`, pour respecter le `NOT NULL` actuel (ou la migration les rend nullables — à confirmer en lisant le schéma).
- **Pas de breaking change** sur le roster CSV existant ni sur les uploads PDF unitaires.

## Fichiers créés / modifiés

- ➕ `src/lib/cohort/importCohortDataset.functions.ts`
- ➕ `src/lib/cohort/importCohortPdfBundle.functions.ts`
- ➕ `src/components/cohort/CohortDatasetUploader.tsx` (carte multi-dropzone)
- ✏️ `src/components/cohort/CohortImportTab.tsx` (ajout de la carte en haut)
- ➕ migration SQL (colonnes `external_ref`)
- ➕ `bun add jszip`

## Hors-scope

- Aucune extraction LLM sur les PDFs au moment de l'import (juste stockage + lien). L'analyse IA se lance ensuite via l'onglet « 2. Conciliation IA ».
- Pas de traitement des colonnes bio corrompues (serials Excel dans `glucose_mmol_L` etc.) — on les importe telles quelles avec un warning, le nettoyage est une étape séparée.

Confirmez et je passe en build.
