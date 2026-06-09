## Objectif

1. Remplacer l'analyse pharmaceutique IA "légère" actuelle par une **conciliation pharmaceutique complète** (le même niveau de détail que l'analyse d'épisode existante : interactions, doublons, contre-indications, médicaments à haut risque, allergies croisées, adaptations posologiques, surveillance bio, conclusion clinique).
2. L'afficher en **section dédiée en bas de la fiche patient**, pas uniquement dans le dialog "Synthèse patient".
3. Rendre **toutes les cards de la fiche patient repliables** pour améliorer la lisibilité.

## 1) Server function `analyzePatientConciliationComplete`

Nouveau fichier `src/lib/conciliation/analyzePatientConciliationComplete.functions.ts` :
- Input : `{ patientId }`
- Charge en parallèle : patient, allergies, antécédents, comorbidités, traitements habituels actifs, **prescriptions hospitalières actives du dernier épisode**, biologie récente (50 derniers résultats, dédupliqués par paramètre)
- Prompt système enrichi (basé sur celui de `analyzeConciliation`) — exige le **JSON complet** avec interactions / doublons_therapeutiques / contre_indications / adaptations_posologiques / medicaments_haut_risque / allergies_croisees / surveillance / conclusion_clinique + score_risque + synthese
- Modèle : `google/gemini-3-flash-preview` via le gateway Lovable AI déjà en place
- Persiste dans `conciliation_ai_analyses` (avec `episode_id = null` et `patient_id` pour distinguer du dialog actuel, via une 2ᵉ ligne ou via un `analysis_type='conciliation_complete'` — colonne à ajouter)

**Migration** : ajouter `analysis_type text` sur `conciliation_ai_analyses` (`'synthese' | 'conciliation_complete'`, défaut `'synthese'` pour ne pas casser l'existant). Backfill : ne touche pas aux lignes existantes.

## 2) UI — composant `ConciliationCompleteCard`

Nouveau composant `src/components/patient/ConciliationCompleteCard.tsx` :
- Bouton "Lancer la conciliation complète" / "Relancer"
- Affichage riche réutilisant le style de `AIAnalysisPanel` (déjà utilisé sur la page épisode) : score de risque, synthèse, blocs détaillés avec sévérité, mécanisme, recommandation, alternative, référence (ANSM/HAS/Vidal/RCP/STOPP-START), niveau de confiance
- Export PDF (peut être ajouté dans une itération suivante — pas dans ce premier jet)
- Auto-déclenchement à l'ouverture **si** le patient a un traitement domicile ET au moins une prescription hospitalière (sinon message d'attente)

## 3) Cards repliables

Nouveau composant `src/components/patient/CollapsibleSection.tsx` :
- Wrapper basé sur `@/components/ui/collapsible` (shadcn — disponible)
- Props : `title`, `icon`, `defaultOpen`, `storageKey` (mémorise l'état par patient via `localStorage`), `badge` optionnel (compteur, alerte)
- Animation chevron, transitions natives `data-[state=open]`

Appliqué à toutes les sections de `patients.$patientId.tsx` :
- Profil clinique (`ClinicalProfileCard`)
- Profil médicamenteux (`MedicationProfileCard`)
- Traitements habituels
- Prescriptions hospitalières
- Biologie
- **Conciliation pharmaceutique complète** (nouvelle section, en bas)

Par défaut : profil + traitements + prescriptions ouverts ; biologie + conciliation repliés (ou ouvert si analyse déjà disponible).

## Fichiers touchés

**Créés**
- `src/lib/conciliation/analyzePatientConciliationComplete.functions.ts`
- `src/components/patient/ConciliationCompleteCard.tsx`
- `src/components/patient/CollapsibleSection.tsx`
- Migration : `ALTER TABLE conciliation_ai_analyses ADD COLUMN analysis_type text DEFAULT 'synthese'`

**Modifiés**
- `src/routes/_authenticated/patients.$patientId.tsx` — wrapper `CollapsibleSection` autour de chaque section + ajout de la nouvelle section conciliation complète en bas
- `src/integrations/supabase/types.ts` (regénéré)

## Hors-scope (non touché)

- Le dialog `SynthesePatientDialog` reste pour l'export PDF rapide existant
- Le `AIAnalysisPanel` de la page épisode n'est pas modifié
- Le système de coloration des prescriptions hospitalières reste tel quel
