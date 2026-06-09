# Plan — Optimisation Datathon Conciliation Médicamenteuse IA

## Objectif
Transformer l'app en démonstrateur hospitalier crédible. Lecture du dossier patient en < 5 s, synthèse IA proéminente, design médical épuré (bleu/vert/orange/rouge sur fond clair).

## 1. Audit ciblé (avant édition)
- Vérifier la présence réelle des sections "Systèmes atteints" et "Organes concernés" (probablement dans `ComorbiditesSection` ou `ClinicalProfileCard`).
- Recenser les composants de la fiche patient : `ClinicalProfileCard`, `MedicationProfileCard`, `EpisodesSection`, `TraitementsHabituelsSection`, `BiologieSection`, `SynthesePatientDialog`, `OrdonnanceUploader`, `BulkPatientImportModal`.
- Confirmer l'état actuel de l'upload multi-fichiers (déjà refait dans `OrdonnanceUploader`, à vérifier aussi `BulkPatientImportModal`).

## 2. Nettoyage
- Supprimer "Systèmes atteints" et "Organes concernés" partout où ils apparaissent (UI uniquement, on ne touche pas la BDD).

## 3. Refonte `ClinicalProfileCard` → "PROFIL PATIENT ET VIGILANCE MÉDICAMENTEUSE"
Section unique, visible en haut, structurée en tuiles :
1. **Comorbidités** — badges colorés (HTA, diabète, IRC, obésité…), détection auto à partir des libellés.
2. **IMC automatique** — calcul poids/taille, catégorie OMS (insuffisance / normal / surpoids / obésité I-II-III), badge couleur.
3. **Allergies** — badges rouges si présentes, badge vert "Aucune allergie connue" sinon.
4. **Profil de risque clinique** — cardiovasculaire / rénal / métabolique / obésité, code couleur (vert/orange/rouge).
5. **Points de vigilance pour la conciliation** — liste auto selon comorbidités + traitements (antidiabétiques, adaptations rénales, antihypertenseurs, interactions, manquants/ajoutés, haut risque).
6. **Complexité patient** — score + niveau (Faible/Modéré/Élevé) basé sur âge, nb traitements, comorbidités, IR, facteurs de risque (utiliser `complexityScore.ts` + extensions).

Composant `ClinicalProfileCard` lit `patients` (poids, taille, date_naissance), `comorbidites`, `allergies`, `traitements_habituels`.

## 4. Synthèse IA en tête de fiche patient
Nouveau composant `AISynthesisHeader` placé juste après l'en-tête patient, AVANT Épisodes :
- Cartes-stat (icônes + chiffres) : Médicaments identifiés, Interactions, Divergences, Manquants, Adaptations posologiques, Haut risque.
- Bloc "Recommandations IA" (3-5 puces clés).
- Bouton "Analyse IA complète" déclenche `analyzePatientSynthesis` (déjà existant) et stocke résultat ; affiche dernier résultat si présent dans `conciliation_ai_analyses`.

## 5. Import multi-documents
- `OrdonnanceUploader` : déjà multi-fichiers. Ajouter accept explicite multi (image+pdf), bouton "Ajouter d'autres documents" toujours visible après import, possibilité d'ajouter en plusieurs vagues sans reset.
- Vérifier que `BulkPatientImportModal` accepte aussi multi-files (à patcher si non).

## 6. Design hospitalier
- Tokens dans `src/styles.css` : `--medical-blue`, `--clinical-green`, `--vigilance-orange`, `--risk-red` (déjà partiellement via tailwind colors). Ajouter helpers `bg-medical-*` si besoin.
- Fond clair `bg-background`, cartes blanches avec bordure douce, headings semibold uppercase tracking-wide pour sections cliniques.
- Badges cohérents : variant `outline` + classes utilitaires couleur tonale.
- Pas de surcharge : grille 2 col desktop / 1 col mobile pour les tuiles du profil.

## 7. Garde-fous
- Aucune migration BDD.
- Pas de changement de logique métier conciliation/IA backend.
- Conserver toutes les routes et fonctionnalités existantes.

## Fichiers modifiés (estimé)
- `src/components/patient/ClinicalProfileCard.tsx` (refonte)
- `src/components/patient/AISynthesisHeader.tsx` (nouveau)
- `src/routes/_authenticated/patients.$patientId.tsx` (ordre des sections + synthèse en tête)
- `src/lib/clinical/complexityScore.ts` (étendre inputs)
- `src/components/patient/ComorbiditesSection.tsx` (retirer systèmes/organes si présent)
- `src/components/conciliation/OrdonnanceUploader.tsx` (peaufinage multi)
- `src/styles.css` (tokens couleurs médicales si manquants)

## Étapes d'exécution
1. Audit fichiers cités.
2. Nettoyage systèmes/organes.
3. Refonte `ClinicalProfileCard` (tuiles + IMC + complexité étendue).
4. Création `AISynthesisHeader` + intégration en haut.
5. Peaufinage upload multi.
6. Ajustements design tokens.
7. Vérification build + preview.
