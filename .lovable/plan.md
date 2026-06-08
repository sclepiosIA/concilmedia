## Objectif

Depuis la fiche patient, importer plusieurs PDF en une fois → produire :
1. **Toujours** : enrichissement du dossier patient (ATCD / comorbidités / allergies / biologie / traitements habituels) avec dédup (déjà en place).
2. **Toujours** : **Fiche de synthèse patient** (vue + export PDF) regroupant identité, ATCD, comorbidités, allergies, bio récente, traitements habituels, et analyse IA (interactions, doublons, adaptations DFG).
3. **Si une ordonnance hospitalière est détectée** dans les PDF : création auto d'un **épisode** avec les prescriptions hospitalières + lancement détection divergences + analyse IA → conciliation complète accessible depuis la fiche patient.
4. **Export PDF** des deux livrables (synthèse patient & fiche de conciliation d'épisode).

## Plan technique

### 1. Extraction : classifier le type de document et capter les prescriptions hospi
Fichier : `src/lib/conciliation/bulkImport.functions.ts`
- Étendre `DossierSchema` :
  - `document_type`: `"ordonnance_ville" | "ordonnance_hospitaliere" | "compte_rendu" | "bilan_bio" | "autre"`
  - `prescriptions_hospitalieres`: tableau (mêmes champs que `TraitementSchema` + `voie`, `frequence`, `duree`, `motif`)
  - `episode_context` optionnel : `{ motif, service, date_admission }`
- Mettre à jour le system prompt pour :
  - classifier le document
  - distinguer "traitements habituels du patient" (→ `traitements`) vs "prescription faite à l'hôpital pendant ce séjour" (→ `prescriptions_hospitalieres`)
  - capter motif / service / date admission si présents

### 2. Commit : créer un épisode si ordo hospi détectée
Fichier : `src/lib/conciliation/bulkImport.functions.ts` (`commitBulkImport`)
- Ajouter param `auto_create_episode: boolean` (default true quand `targetPatientId` fourni).
- Après ingestion des entités du patient :
  - Agréger toutes les `prescriptions_hospitalieres` de tous les items pour ce patient.
  - S'il y en a ≥1 OU si un item a `document_type === "ordonnance_hospitaliere"` : créer un épisode (`motif` = premier `episode_context.motif` trouvé sinon "Hospitalisation – import PDF", `service` idem sinon "Médecine") et insérer toutes les prescriptions dans `prescriptions_hospitalieres` (avec dédup sur `dci`).
  - Retourner `created_episode_ids: string[]` dans le summary.

### 3. UI : feedback dans le modal d'import
Fichier : `src/components/conciliation/BulkPatientImportModal.tsx`
- Onglet review : badge "Ordo hospi" / "Bilan bio" / "Ordo ville" selon `document_type`.
- 5e onglet "Prescriptions hospi" listant les prescriptions extraites (éditable comme les traitements).
- Écran final "done" : si `created_episode_ids.length > 0`, bouton **"Ouvrir la conciliation →"** qui navigue vers `/episodes/{id}`.

### 4. Fiche de synthèse patient (vue + export PDF)
Nouveau fichier : `src/components/patient/SynthesePatientCard.tsx`
- Composant affichable dans un dialog/onglet de la fiche patient, regroupant :
  - bandeau identité + alertes (allergies sévères, DFG bas, INR haut)
  - sections compactes ATCD / Comorbidités / Allergies / Bio récente (1 valeur/paramètre) / Traitements habituels actifs
  - bloc Analyse IA (si présente — sinon bouton "Lancer l'analyse" qui appelle une nouvelle serverFn `analyzePatientSynthesis` patient-only, sans épisode)
- Nouveau serverFn : `src/lib/conciliation/analyzePatientSynthesis.functions.ts` (clone de `analyzeConciliation` mais sans `prescriptions_hospitalieres`, persiste dans une nouvelle colonne `patient_synthesis_analyses` ou réutilise `conciliation_ai_analyses` avec `episode_id NULL`).

Bouton "Synthèse patient" ajouté dans `src/routes/_authenticated/patients.$patientId.tsx` à côté de "Nouvel épisode".

### 5. Export PDF
Route serveur : `src/routes/api/patients.$patientId.synthese-pdf.ts` (GET)
- Charge le patient + toutes les entités + dernière analyse IA.
- Génère un PDF (lib JS pure compatible Worker : **`pdf-lib`**, déjà compatible Cloudflare) avec mise en page A4 :
  - en-tête : identité + date du jour + alertes
  - sections tabulaires (ATCD, comorb, allergies, bio, traitements)
  - encart "Analyse pharmaceutique IA"
- Renvoie `application/pdf` en téléchargement.
- Bouton "Exporter PDF" sur `SynthesePatientCard`.

Idem pour épisode : `src/routes/api/episodes.$episodeId.conciliation-pdf.ts`
- Identité + contexte épisode
- Tableau **BMO domicile vs Prescription hospi** côte à côte
- Tableau des divergences avec statut / justification
- Encart analyse IA
- Bouton "Exporter PDF" sur la page `episodes.$episodeId.tsx`.

⚠️ `pdf-lib` ne fait pas la mise en page haut niveau → on génère manuellement (texte + tables simples). Pas de dépendance Node-only.

### 6. Migration mineure
Si on choisit `conciliation_ai_analyses` avec `episode_id NULL` pour les analyses patient-only : ALTER la colonne `episode_id` en nullable. Sinon, créer table `patient_synthesis_analyses(patient_id, payload, model, created_at)` avec GRANT + RLS via `owns_patient`.
Décision : **rendre `episode_id` nullable** (1 ligne SQL, pas de nouvelle table).

## Hors scope
- OCR de PDF scannés (déjà géré par Gemini multimodal).
- Réconciliation cross-épisodes (historique).
- Signature électronique du PDF.

## Questions ouvertes
Aucune — on lance l'implémentation au feu vert.
