## Détection des omissions dans la prescription hospitalière

Ajouter, en tête de la colonne « Prescriptions hospitalières », une section **« Médicaments du domicile non repris »** qui liste les traitements habituels du patient absents de la prescription hospitalière, avec deux actions par ligne :

1. **Ajouter** → crée la prescription hospitalière à partir du traitement domicile (même DCI, dosage, voie, posologie matin/midi/soir/coucher), source `omission_corrigee`.
2. **Omission souhaitée** → marque l'omission comme justifiée (avec commentaire optionnel) ; la ligne disparaît de la liste et n'apparaît plus comme alerte.

### Détection
Réutilise `dciKey()` de `prescriptionMatch.ts` : un traitement domicile est « omis » si aucune prescription hospitalière active n'a la même clé DCI.

### Persistance des omissions justifiées
Nouvelle table `public.prescription_omissions` :
- `episode_id` (FK episodes)
- `traitement_id` (FK traitements_habituels)
- `justifiee` boolean
- `commentaire` text nullable
- timestamps + `created_by`
- unique (`episode_id`, `traitement_id`)
- RLS scope via `owns_episode(episode_id)`
- GRANT `authenticated` + `service_role`

### UI (`PrescriptionsHospitalieresColumn.tsx`)
Bloc encadré au-dessus de la liste, affiché seulement s'il existe des omissions non justifiées :
- titre « ⚠ N médicament(s) du domicile non repris »
- pour chaque ligne : DCI + dosage + voie + posologie, bouton **Ajouter** (mutation insert), bouton **Omission souhaitée** (ouvre petit champ commentaire puis insert dans `prescription_omissions`).
- Query supplémentaire pour `prescription_omissions` afin de filtrer.

### Fichiers touchés
- nouvelle migration SQL (table + RLS + grants)
- `src/components/conciliation/PrescriptionsHospitalieresColumn.tsx` (calcul des omissions, nouveau bloc UI, mutations)
- éventuellement petit composant `OmissionsPanel.tsx` pour isoler le bloc

### Hors scope
Pas de modification de l'analyse IA ni de la carte « Aide à la décision pharmaceutique » — l'utilisateur pourra relancer l'IA s'il souhaite ré-analyser après correction.
