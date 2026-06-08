# Import PDF en masse — extraction IA structurée

## Objectif
Un modal accessible depuis la liste des patients permet de déposer 5–20 PDF en une fois. L'IA (Gemini vision via Lovable AI) lit chaque PDF, extrait identité + ATCD + comorbidités + allergies + biologie + traitements, puis affiche un tableau de validation patient par patient avant import.

## Flux utilisateur
1. Bouton « Import en masse » sur `/patients`
2. Modal : drop zone multi-fichiers (PDF/images, max 20)
3. Bouton « Analyser » → barre de progression (1 PDF à la fois)
4. Tableau récap : 1 ligne / patient extrait, statut (✓ prêt / ⚠ doublon potentiel / ✗ erreur)
5. Ligne dépliable → onglets Identité / ATCD-Comorb-Allergies / Biologie / Traitements, champs éditables, cases à cocher par item
6. Bouton « Importer N patients » → création atomique en base, toast récap, fermeture

## Base de données (1 migration)

Nouvelle table `biologie_resultats` :
- `patient_id`, `date_prelevement`, `parametre` (text), `valeur` (numeric), `unite`, `valeur_texte` (fallback), `source` (`pdf_import` / `manuel`)
- RLS scoped via `owns_patient(patient_id)`
- GRANT authenticated + service_role

## Serveur

### `src/lib/conciliation/bulkImport.functions.ts`
- `extractPatientDossier({ fileBase64, mimeType, fileName })` — server fn protégée
  - Upload PDF dans bucket `ordonnances` (réutilisé) sous `bulk/{userId}/{ts}_{name}`
  - Appel Gemini 3 Flash vision avec un prompt structuré demandant JSON :
    ```
    { patient:{nom,prenom,date_naissance,sexe,poids_kg,taille_cm},
      antecedents:[{type,libelle,date,details}],
      comorbidites:[{libelle,actif}],
      allergies:[{substance,reaction,gravite}],
      biologie:[{date,parametre,valeur,unite}],
      traitements:[{dci,nom_commercial,dosage,dosage_unite,voie,posologie_*}] }
    ```
  - Détection doublon : SELECT patients WHERE nom ILIKE + prenom ILIKE + date_naissance → renvoie `existing_patient_id?`
  - Retourne dossier extrait + path storage

- `commitBulkImport({ items: ExtractedDossier[] })` — server fn protégée
  - Pour chaque item validé : INSERT patient (ou réutiliser existing_patient_id), puis batch INSERT dans `antecedents`, `comorbidites`, `allergies`, `biologie_resultats`, `traitements_habituels` (source = `pdf_import`)
  - Wrapping try/catch par patient, renvoie `{ created, updated, failed:[{name,error}] }`

## UI

### `src/components/conciliation/BulkPatientImportModal.tsx`
- `Dialog` plein écran (max-w-5xl)
- Étapes contrôlées : `idle` → `extracting` → `review` → `importing` → `done`
- `useMutation` séquentielle (Promise chain pour ne pas saturer la gateway)
- État local : `Map<fileId, { status, data, selected: { atcd:bool[], comorb:bool[]... } }>`
- Sous-composants :
  - `BulkUploadDropzone` (drag & drop, liste fichiers + retirer)
  - `BulkReviewTable` (Accordion par patient avec onglets shadcn `Tabs`)
  - `BulkImportSummary` (résultats finaux)

### Intégration
- Ajouter bouton « Import PDF en masse » dans le header de `src/routes/_authenticated/patients.index.tsx`
- À la fermeture succès : `qc.invalidateQueries({queryKey:['patients']})`

## Détails techniques

- Limite : 20 PDF / lot (DoS guard + coût Gemini)
- Taille max par fichier : 10 MB (validé côté serveur)
- Schéma Zod côté serveur pour valider la sortie IA (champs optionnels tolérants)
- Si JSON IA invalide → item marqué `failed` avec message, n'interrompt pas le batch
- Réutilisation existante : pattern `fileToBase64` de `OrdonnanceUploader`, helper `createLovableAiGatewayProvider`

## Fichiers
**Nouveaux**
- `supabase/migrations/<ts>_biologie_resultats.sql`
- `src/lib/conciliation/bulkImport.functions.ts`
- `src/components/conciliation/BulkPatientImportModal.tsx`
- `src/components/conciliation/BulkUploadDropzone.tsx`
- `src/components/conciliation/BulkReviewTable.tsx`

**Modifiés**
- `src/routes/_authenticated/patients.index.tsx` (bouton + modal)

## Hors-scope
- OCR multi-pages > 50 pages (limite Gemini)
- Édition fine de la biologie après import (créer page dédiée plus tard)
- Réconciliation automatique avec patient existant (proposition manuelle seulement)
