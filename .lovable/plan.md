## Objectif

Créer une app autonome dédiée à la conciliation médicamenteuse, en reprenant la logique et l'UI du module présent dans DPI POINT. (table `conciliation_medicaments`, hook `useMedicationReconciliation`, `PharmacistConciliationPanel`, ATCD / allergies / traitements habituels / prescriptions).

## Stack

- TanStack Start (déjà en place), Tailwind v4, shadcn.
- Lovable Cloud (DB + auth) — activé en début de build.
- Lovable AI Gateway (Gemini) pour l'analyse pharmaceutique IA.
- TanStack Query côté front, `createServerFn` pour l'IA.

## Schéma de base de données (repris de DPI)

Tables (toutes en `public`, avec GRANT + RLS scopée `auth.uid()`):

- `patients` — identité (nom, prénom, ddn, sexe, poids, taille, NIR optionnel, créé par user).
- `allergies` — patient_id, substance, réaction, sévérité, date.
- `antecedents` — patient_id, type (medical/chirurgical/familial/obstétrical), description, date, actif.
- `comorbidites` — patient_id, libellé, code CIM-10 optionnel, statut.
- `traitements_habituels` — patient_id, dci, nom_commercial, dosage, dosage_unite, voie_administration, posologie_matin/midi/soir/coucher, indication, source (ordonnance/patient/MT/pharmacie), actif.
- `prescriptions_hospitalieres` — patient_id, episode_id, medicament (DCI), dosage, posologie, voie_administration, date_debut, date_fin, prescripteur.
- `episodes` — patient_id, motif, date_entree, date_sortie, service.
- `conciliation_medicaments` — schéma identique à DPI (phase entrée/sortie, medication_domicile jsonb, medication_hospitalisation jsonb, type_divergence, intention, justification, action_corrective, statut, pharmacien_id, dates).
- `conciliation_ai_analyses` — episode_id, payload (interactions, doublons, contre-indications, redondances, score), model, créé le.

Policies: `auth.uid() = created_by` (ou via `episode → patient → created_by`). `service_role` pour edge.

## Architecture front

Routes (TanStack file-based):

```text
src/routes/
  index.tsx                       -> dashboard (liste épisodes + KPIs conciliation)
  _authenticated/
    patients.index.tsx            -> liste patients
    patients.$id.tsx              -> fiche patient (onglets ATCD/allergies/traitements/comorbidités)
    episodes.$id.conciliation.tsx -> écran principal de conciliation
  auth.tsx                        -> login (email+password)
```

Composants réutilisés du DPI (portés tels quels, adaptés aux imports locaux) :

- `PharmacistConciliationPanel` — tableau divergences, filtres statut/type, actions valider/justifier.
- `MedicationConciliationItemRow`, `DivergenceBadge`, `IntentionSelector`, `JustificationDialog`.
- Sections fiche patient : `AntecedentsSection`, `AllergiesSection`, `TraitementsHabituelsSection`, `ComorbiditesSection`, `PrescriptionsActivesSection` (extraites de `PatientSynthesisConfigurable`).

## Hooks

- `useMedicationReconciliation(episodeId)` — copie quasi conforme du hook DPI (query + 4 mutations: add/update/validate/detectDivergences). Adaptation: `passage_id` → `episode_id`.
- `usePatientFile(patientId)` — récupère antécédents, allergies, comorbidités, traitements habituels en parallèle.
- `useAIConciliationAnalysis(episodeId)` — lance l'analyse IA et lit le dernier rapport.

## Analyse IA (Lovable AI Gateway)

`src/lib/conciliation/analyze.functions.ts` — `createServerFn` POST :

- Input: `episodeId`.
- Charge patient + antécédents + allergies + comorbidités + traitements habituels + prescriptions + conciliations.
- Prompt système pharmacien clinicien (FR) demandant un JSON structuré (`Output.object` zod) :
  - `interactions` (paires DCI, sévérité, mécanisme, recommandation)
  - `doublons_therapeutiques`
  - `contre_indications` (vs allergies/comorbidités)
  - `redondances_classe`
  - `adaptations_posologiques` (insuffisance rénale/hépatique si comorbidité présente)
  - `score_risque` 0-100 + `synthese` texte.
- Modèle: `google/gemini-3-flash-preview` via le provider helper (`createLovableAiGatewayProvider`).
- Persiste le résultat dans `conciliation_ai_analyses`.
- Gestion explicite 429 / 402.

UI : bouton "Lancer l'analyse IA" sur l'écran conciliation, panneau dépliable affichant interactions/doublons/CI/score + bouton "Créer divergence" qui pré-remplit le formulaire.

## Écran de conciliation (episodes/$id/conciliation)

Layout 3 colonnes (identique DPI) :

1. **Gauche** — Traitement domicile (BMO) : liste `traitements_habituels` + ajout rapide.
2. **Centre** — Tableau de conciliation (PharmacistConciliationPanel) avec filtres phase entrée/sortie, statut, type divergence, actions inline.
3. **Droite** — Prescriptions hospitalières actives + panneau d'analyse IA.

Header : bandeau patient (nom, âge, allergies critiques en rouge, comorbidités), boutons "Détecter divergences" (algorithmique) et "Analyse IA".

## Étapes d'implémentation

1. Activer Lovable Cloud + provisionner `LOVABLE_API_KEY`.
2. Migration SQL : tables + GRANT + RLS + trigger `updated_at`.
3. Page auth (email/password, redirection post-login).
4. CRUD patients (liste + création + fiche avec onglets).
5. Sections ATCD / allergies / comorbidités / traitements habituels (formulaires + listes).
6. Module épisodes (création depuis fiche patient).
7. Prescriptions hospitalières (formulaire dans l'épisode).
8. Hook `useMedicationReconciliation` + écran conciliation 3 colonnes.
9. PharmacistConciliationPanel + dialogs justification/intention.
10. Détection algorithmique des divergences (omission / modif dose).
11. ServerFn d'analyse IA + UI panneau IA + persistance.
12. Dashboard d'accueil (KPIs : épisodes ouverts, divergences non traitées, score risque moyen).
13. Seed démo (1 patient, ATCD, allergies, 5 traitements, 1 épisode, prescriptions générant divergences).

## Hors périmètre (confirmé)

Pas de gestion patient avancée, pas de workflow pharmacien étendu (interventions, traçabilité, export BMO/BME PDF) — réservé à une itération ultérieure.
