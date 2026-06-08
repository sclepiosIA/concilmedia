# Plan — Conciliation guidée par upload d'ordonnance

## Objectif

Refondre l'écran épisode (`/episodes/$episodeId`) pour qu'un médecin/pharmacien puisse réaliser une conciliation **en 3 gestes évidents** :

1. **Uploader** l'ordonnance hospitalière (photo / PDF)
2. **Visualiser** automatiquement les divergences vs traitement habituel
3. **Valider** chaque divergence

L'upload devient le point d'entrée central et déclenche toute la chaîne (extraction OCR → enregistrement prescriptions → détection divergences).

## Nouveau layout de l'écran épisode

```text
┌──────────────────────────────────────────────────────────┐
│ HEADER patient (inchangé) + stepper 3 étapes             │
├──────────────────────────────────────────────────────────┤
│  ÉTAPE 1 — UPLOAD ORDONNANCE  (grande dropzone centrale) │
│  [📄 Glissez l'ordonnance ici ou cliquez]                │
│  → extraction IA en cours… → N médicaments détectés      │
├──────────────────────────────────────────────────────────┤
│  ÉTAPE 2 — COMPARAISON 3 colonnes                        │
│  ┌────────────┬────────────────┬────────────────────┐    │
│  │ DOMICILE   │ HOSPITALIER    │ DIVERGENCES        │    │
│  │ (lecture)  │ (extrait OCR + │ (auto-détectées,   │    │
│  │            │  éditable)     │  badges gravité)   │    │
│  └────────────┴────────────────┴────────────────────┘    │
├──────────────────────────────────────────────────────────┤
│  ÉTAPE 3 — VALIDATION (panel pharmacien actuel, compacté)│
└──────────────────────────────────────────────────────────┘
```

## Changements concrets

### 1. Zone d'upload mise en avant
- Nouveau composant `OrdonnanceDropzone` (grand, centré, drag&drop visible) en tête de l'espace de travail, **avant** les colonnes.
- Réutilise `extractOrdonnance.functions.ts` + `OrdonnanceUploader` existants mais avec une UI proéminente (icône, CTA, états : vide / extraction / succès).
- Après extraction : insertion automatique en lot dans `prescriptions_hospitalieres`, puis appel automatique de `detectDivergences()`.
- Lorsque ≥1 prescription existe déjà, la dropzone se replie en bandeau compact "+ Ajouter une autre ordonnance".

### 2. Vue 3 colonnes synchronisée
- **Col 1 — Domicile** : `TraitementsDomicileColumn` existant (lecture seule, compact).
- **Col 2 — Hospitalier** : `PrescriptionsHospitalieresColumn` existant, mais items issus de l'OCR badgés "📄 OCR" pour montrer la provenance.
- **Col 3 — Divergences** : nouveau composant `DivergencesColumn` qui affiche les divergences détectées en cartes synthétiques (gravité + type + DCI), avec lien vers la ligne correspondante dans le panel de validation en dessous.

### 3. Stepper réellement piloté
Le stepper du header reflète l'avancement réel :
1. **Ordonnance importée** (≥1 prescription_hospitaliere) ✅
2. **Divergences détectées** (≥1 conciliation_medicaments) ✅
3. **Validation terminée** (toutes résolues) ✅

### 4. Suppression / déplacement
- Le bloc "Détecter divergences" (bouton manuel) devient secondaire : déclenchement automatique post-upload, bouton reste disponible mais discret.
- `PharmacistConciliationPanel` reste dessous, en pleine largeur, pour la phase de validation.
- `AIAnalysisPanel` déplacé en bas (secondaire).

## Fichiers touchés

- **Nouveau** `src/components/conciliation/OrdonnanceDropzone.tsx` — zone hero d'upload + états.
- **Nouveau** `src/components/conciliation/DivergencesColumn.tsx` — colonne synthèse divergences.
- **Modifié** `src/routes/_authenticated/episodes.$episodeId.tsx` — nouveau layout (hero upload + grid 3 colonnes + panel validation + analyse IA en pied).
- **Modifié** `src/components/conciliation/PrescriptionsHospitalieresColumn.tsx` — badge "OCR" sur items issus d'extraction.
- Réutilisés sans changement : `useMedicationReconciliation`, `extractOrdonnance.functions.ts`, `PharmacistConciliationPanel`, `TraitementsDomicileColumn`, `RiskScoreBadge`, `AIAnalysisPanel`.

## Détails techniques

- L'extraction OCR existante renvoie déjà une liste structurée → insertion bulk dans `prescriptions_hospitalieres` (mutation déjà disponible côté hook ou à ajouter).
- Pour tracer la provenance OCR sans migration DB : marquer via un champ existant (`source` ou commentaire) si présent ; sinon ajouter colonne `source TEXT` à `prescriptions_hospitalieres` dans une petite migration avec les GRANTs.
- Après insertion bulk : `await recon.detectDivergences()` puis `qc.invalidateQueries`.
- Aucun changement RLS, aucun nouveau secret.

## Hors scope

- Pas de refonte du profil patient (déjà validé).
- Pas de mode présentation plein écran / slides.
- Pas de modification des scores de risque ni de l'analyse IA.
