# Comparaison conciliation IA vs pharmacien

## Objectif
Sous le bloc "Validation pharmacien" (ConciliationCompleteCard), permettre d'uploader un PDF de conciliation validée par le pharmacien (liste des divergences entre traitement habituel et prescription hospitalière). L'IA compare ensuite ce document avec sa propre analyse et produit un rapport de cohérence.

## Étapes

### 1. Base de données (migration)
Nouvelle table `pharmacist_conciliation_documents` :
- `analysis_id` (FK conciliation_ai_analyses, unique)
- `patient_id`, `episode_id`
- `storage_path`, `file_name`, `mime_type`, `file_size`
- `uploaded_by`, `uploaded_at`
- `comparison_payload` jsonb (résultat IA)
- `compared_at`

RLS : owner via `owns_patient(patient_id)`. GRANT authenticated + service_role.
Storage : réutiliser le bucket `ordonnances` (déjà privé) sous le préfixe `pharmacist-validation/{patient_id}/`.

### 2. Server functions (`src/lib/conciliation/pharmacistDoc.functions.ts`)
- `uploadPharmacistDoc` : reçoit `{ analysisId, patientId, episodeId, fileName, mimeType, base64 }` → upload bucket → insert row.
- `getPharmacistDoc({ analysisId })` → row + URL signée (300s).
- `deletePharmacistDoc({ analysisId })` → supprime fichier + row.
- `comparePharmacistVsAI({ analysisId })` : charge le PDF (signed url), charge l'analyse IA (payload), appelle Lovable AI Gateway (`google/gemini-3-flash-preview`) en multimodal (PDF + JSON IA) avec un prompt qui extrait les divergences listées par le pharmacien puis renvoie un JSON :
  ```
  {
    synthese: string,
    concordance_globale: 0-100,
    divergences_pharmacien: [{ medicament, type, severite_pharmacien, action }],
    matches: [{ medicament, statut: "concordant|ia_seulement|pharmacien_seulement|divergent", commentaire }],
    points_manques_par_ia: [...],
    points_manques_par_pharmacien: [...],
    conclusion: string
  }
  ```
  Sauve dans `comparison_payload`.

### 3. UI : composant `PharmacistDocumentCompareCard.tsx`
Inséré dans `ConciliationCompleteCard.tsx` **juste après** la `</section>` du panneau "Validation pharmacien" (ligne 459), uniquement quand `validation` existe (sinon message "Validez d'abord la conciliation").
Contenu :
- Zone upload PDF (drag & drop simple, input file, max 10 Mo, mime application/pdf).
- Si document présent : lien d'aperçu (URL signée), date upload, bouton "Supprimer".
- Bouton "Analyser la concordance" (déclenche `comparePharmacistVsAI`) avec spinner.
- Affichage du résultat : badge de concordance globale, synthèse, deux listes (concordances / divergences) avec couleurs sémantiques (`text-ok`, `text-major`, `text-crit`), conclusion.

### 4. Hors périmètre
- Pas de modification de `PharmacistConciliationPanel` ni du flux de validation existant.
- Pas d'OCR custom : on s'appuie sur la lecture PDF native du modèle Gemini.

## Détails techniques
- Upload côté client : lecture en base64 puis envoi à la server fn (PDF < 10 Mo).
- `client.server` (`supabaseAdmin`) chargé via `await import` dans le handler.
- Multimodal Gemini : message user `content` = `[{type:"text", text: prompt+payload IA}, {type:"file", file:{filename, file_data:"data:application/pdf;base64,..."}}]`.
- Invalidation react-query : queryKey `["pharmacist-doc", analysisId]`.

## Fichiers touchés
- migration SQL
- `src/lib/conciliation/pharmacistDoc.functions.ts` (nouveau)
- `src/components/conciliation/PharmacistDocumentCompareCard.tsx` (nouveau)
- `src/components/patient/ConciliationCompleteCard.tsx` (insertion du composant)
