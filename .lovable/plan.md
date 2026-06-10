## Problème

Sur la liste patients, M. Moreau (97 ans, 11 traitements, IRC, 6 comorbidités) apparaît en **P4 — "Conciliation à relire (risque faible)"**.

En base, son épisode n'a :
- aucune ligne dans `risk_scores` (le score de priorisation n'a jamais été calculé),
- aucune divergence dans `conciliation_medicaments` (l'analyse IA n'a pas tourné),
- aucune validation pharmacien.

Le label "faible" vient donc uniquement du **texte par défaut** dans `src/lib/conciliation/triageScale.ts` (l. 85-87) :

```ts
level = 4;
reason = "Conciliation à relire (risque faible)";
```

C'est trompeur : on n'a pas mesuré le risque, on a juste fixé un placeholder.

## Correctifs proposés

### 1. `src/lib/conciliation/triageScale.ts`
- Quand `hasActiveEpisode === true` mais qu'**aucune analyse n'a tourné** (`worstRisk === null` ET total divergences === 0 ET `oldestPendingAnalysisAt === null`), ne plus dire "risque faible". Remplacer par : `"Conciliation à initier — risque non évalué"`.
- Ajouter, en plus, une **garde de sécurité gériatrique** appliquée *avant* le calcul : si `age ≥ 75` ET (`nb_traitements ≥ 5` OU IRC connue), forcer le niveau minimum à **P3** avec la raison `"Patient âgé polymédiqué — priorisation à calculer"`. Cela évite qu'un Moreau passe en P4 "faible" simplement parce que le moteur de score n'a pas encore tourné.
- Pour faire ce calcul, `computePatientTriage` doit recevoir 3 nouveaux champs optionnels : `age`, `nbTraitements`, `hasInsuffisanceRenale`.

### 2. `src/hooks/usePatientsTriage.ts`
- Récupérer en plus, en parallèle :
  - `patients.date_naissance` → calcul de l'âge,
  - `count` sur `traitements_habituels` (actif=true) par patient,
  - `comorbidites` actives par patient → détecter IRC via le même regex que `prioritize.functions.ts` (`/renal|rein|ckd|insuffisance r[ée]nale|dfg/i`).
- Passer ces 3 champs à `computePatientTriage`.

### 3. `src/components/conciliation/TriageBadge.tsx`
- Dans le tooltip, quand `worstRisk === null`, afficher explicitement `Score de risque : non calculé` (au lieu de masquer la ligne) pour lever toute ambiguïté.

### 4. Déclenchement automatique du score (optionnel mais recommandé)
- Dans `src/routes/_authenticated/episodes.$episodeId.tsx`, si l'épisode n'a aucun `risk_score`, appeler `computePrioritization` au montage (déjà importé ailleurs). Comme ça, dès qu'on ouvre Moreau, le score se calcule et le triage devient réel.

## Vérification

1. Ouvrir `/patients` : Moreau doit passer en **P3** avec tooltip "Patient âgé polymédiqué — priorisation à calculer", plus de mention "faible".
2. Ouvrir la fiche Moreau → `computePrioritization` se déclenche → la ligne se met à jour avec le vrai niveau (probablement *élevé* / *critique* vu l'âge + IRC + polymédication).
3. Pour un patient jeune sans antécédents et sans analyse : on doit voir "Conciliation à initier — risque non évalué" en P4 (comportement attendu).

## Fichiers modifiés
- `src/lib/conciliation/triageScale.ts`
- `src/hooks/usePatientsTriage.ts`
- `src/components/conciliation/TriageBadge.tsx`
- `src/routes/_authenticated/episodes.$episodeId.tsx`
