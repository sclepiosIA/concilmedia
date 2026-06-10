
# Piste #2 — Intégration de la BDPM (Base de Données Publique des Médicaments)

## Contexte

La normalisation actuelle (`src/lib/conciliation/normalize.ts`) repose sur une table manuelle d'une cinquantaine de princeps → DCI. Insuffisant pour la prod : ~15 000 spécialités en BDPM, formes galéniques, dosages, voies, statut d'AMM et code ATC manquent.

La BDPM est publiée par l'ANSM (open data, fichiers texte tabulés mis à jour quotidiennement) — référentiel officiel, gratuit, opposable.

## Objectif

Disposer d'un **référentiel BDPM local interrogeable** pour :
1. Normaliser n'importe quelle dénomination (princeps, générique, mal orthographiée) vers DCI + code ATC.
2. Identifier les médicaments par CIS (spécialité) ou CIP (présentation/conditionnement).
3. Exposer forme galénique, dosage, voie d'administration, statut d'AMM, titulaire.
4. Servir de source pour les autres pistes : RAG (#3), interactions ATC déterministes, autocomplétion saisie.

## Périmètre

### 1. Schéma — tables BDPM

```text
bdpm_specialites
├── cis bigint PK              (Code Identifiant Spécialité)
├── denomination text
├── forme text                 (comprimé, gélule, solution injectable…)
├── voies text[]
├── statut_amm text
├── type_amm text
├── etat_commercialisation text
├── titulaire text
├── surveillance_renforcee boolean
└── updated_at timestamptz

bdpm_presentations
├── cip7 bigint PK             (Code Identifiant Présentation 7 chiffres)
├── cip13 bigint UNIQUE
├── cis bigint REFERENCES bdpm_specialites(cis)
├── libelle text
├── statut_admin text
├── etat_commercialisation text
├── agrement_collectivites boolean
├── taux_remboursement text
└── prix_eur numeric

bdpm_compositions
├── id bigserial PK
├── cis bigint REFERENCES bdpm_specialites(cis)
├── designation_element_pharma text
├── code_substance bigint
├── denomination_substance text       ← DCI brute
├── dosage_substance text
├── reference_dosage text
└── nature_composant text

bdpm_atc
├── cis bigint PRIMARY KEY REFERENCES bdpm_specialites(cis)
├── code_atc text                     (ex: B01AC06)
└── libelle_atc text
```

Index trigram (`pg_trgm`) sur `bdpm_specialites.denomination` et `bdpm_compositions.denomination_substance` pour la recherche floue.

GRANT SELECT à `authenticated` + `anon` (référentiel public, lecture seule). Écriture réservée à `service_role`.

### 2. Pipeline d'import

ServerFn `importBdpm` (admin uniquement, déclenchable manuellement) :
- Télécharge les fichiers depuis `https://base-donnees-publique.medicaments.gouv.fr/telechargement.php` :
  - `CIS_bdpm.txt` (spécialités)
  - `CIS_CIP_bdpm.txt` (présentations)
  - `CIS_COMPO_bdpm.txt` (compositions)
  - `CIS_GENER_bdpm.txt` (groupes génériques)
  - `CIS_ATC_bdpm.txt` (classification ATC)
- Parsing CSV tabulé latin-1 → upsert par chunks de 1000 lignes.
- Journal d'import dans `bdpm_import_runs` (date, fichier, lignes traitées, durée, erreurs).

Page admin `/admin/bdpm` :
- Statut du dernier import (date, volume).
- Bouton « Synchroniser maintenant ».
- Recherche test : saisir un nom, voir résultats normalisés (CIS, DCI, ATC, forme).

### 3. Service de normalisation v2

Nouveau module `src/lib/conciliation/normalizeBdpm.server.ts` :
- `normalizeDrugBdpm(input)` → `{ cis?, dci?, atc?, forme?, dosage?, confidence }`.
- Stratégie en cascade :
  1. Match exact dénomination BDPM (case-insensitive, sans accents).
  2. Match exact substance dans `bdpm_compositions` (cas saisie déjà en DCI).
  3. Recherche trigram (`similarity > 0.6`).
  4. Fallback synonymes manuels actuels.
  5. Si aucun match : retourne `{ dci: normDci(input), confidence: 0.3 }` (legacy).

`normalize.ts` legacy gardé comme fallback hors-ligne.

### 4. Intégration dans le pipeline existant

- **`extractOrdonnance.functions.ts`** et **`matchPrescriptionAI.functions.ts`** : enrichir chaque ligne extraite avec `cis` + `atc` via `normalizeDrugBdpm`.
- **`traitements_habituels`** et **`prescriptions_hospitalieres`** : ajouter colonnes `cis bigint`, `code_atc text` (migration + types regénérés) pour stocker la normalisation persistante.
- **`deterministicAlerts.ts`** : utiliser `code_atc` (déjà attendu via `atcInteractions.ts`) au lieu de mapping nom → ATC partiel.

### 5. UI — saisie assistée

- Composant `<DrugAutocomplete />` (Combobox shadcn + serverFn `searchBdpm`) avec :
  - debounce 200 ms,
  - affichage `dénomination — DCI — forme — dosage`,
  - sélection => remplit DCI + CIS + ATC.
- Branché dans `TraitementsHabituelsSection` et `PrescriptionsHospitalieresSection` (saisie manuelle), sans toucher au flux OCR.

## Hors périmètre

- Pas d'intégration Vidal/Thériaque payants (BDPM seule suffit pour le périmètre AMM/ATC).
- Pas de RCP plein-texte (couvert par piste #3 RAG).
- Pas de prix dynamique temps réel — figé par import.
- Pas de cron automatique au premier jet : import manuel via bouton admin. Un cron mensuel viendra dans la piste #15 (« évaluation continue »).

## Fichiers touchés

- **Migration SQL** : `bdpm_specialites`, `bdpm_presentations`, `bdpm_compositions`, `bdpm_atc`, `bdpm_import_runs` (+ GRANT + RLS + extension `pg_trgm` si absent + index trigram).
- **Migration SQL** : `ALTER TABLE traitements_habituels ADD COLUMN cis bigint, code_atc text` + idem `prescriptions_hospitalieres`.
- **Nouveau** : `src/lib/bdpm/importBdpm.functions.ts` (admin import + status).
- **Nouveau** : `src/lib/bdpm/searchBdpm.functions.ts` (recherche pour autocomplete).
- **Nouveau** : `src/lib/conciliation/normalizeBdpm.server.ts`.
- **Nouveau** : `src/routes/_authenticated/admin.bdpm.tsx`.
- **Modifié** : `src/routes/_authenticated/admin.tsx` (lien « BDPM » dans la nav admin).
- **Nouveau** : `src/components/DrugAutocomplete.tsx`.
- **Modifié** : `src/components/patient/TraitementsHabituelsSection.tsx`, `PrescriptionsHospitalieresSection.tsx` (intégration autocomplete).
- **Modifié** : `extractOrdonnance.functions.ts`, `matchPrescriptionAI.functions.ts` (enrichissement CIS/ATC après extraction).
- **Modifié** : `src/lib/conciliation/deterministicAlerts.ts` (utilisation `code_atc` BDPM).
- **Modifié** : `src/routes/_authenticated/ameliorations.tsx` (badge « Livré v1 » sur piste #2).

## Vérification

- Lancer un import depuis `/admin/bdpm` → vérifier ≥ 15 000 spécialités importées, dernier run vert.
- Tester `searchBdpm("dolip")` → renvoie Doliprane / paracétamol / N02BE01.
- Saisir manuellement un traitement avec autocomplete → ligne stockée avec `cis` + `code_atc`.
- Re-traiter un patient existant → alertes déterministes utilisent les codes ATC BDPM.

