## Contexte

Actuellement, pour chaque constatation IA (divergences, interactions, contre-indications, adaptations, doublons, allergies, médicaments haut risque) le pharmacien peut **Accepter / Modifier / Refuser** et ajouter un commentaire + un texte libre `modification`. Mais **les champs structurés de l'IA (sévérité, médicaments concernés, mécanisme, risque, recommandation, alternative, référence) ne sont pas éditables**. Le pharmacien doit pouvoir corriger ces champs avant de valider.

## Objectif

Rendre chaque constatation IA **modifiable en place** tant que la conciliation n'est pas validée (ou après un clic « Modifier la validation »). La version validée doit refléter les corrections du pharmacien.

## Approche

Étendre `ItemDecision` avec un objet `overrides` (clé/valeur, partiel) sauvegardé dans `conciliation_validations.item_decisions`. À l'affichage, on calcule la valeur effective = `override ?? IA`. Aucune migration DB nécessaire : `item_decisions` est déjà `jsonb`.

### 1. Modèle de données (code uniquement, pas de migration)

`src/lib/conciliation/validateConciliation.functions.ts`
- Ajouter un type `ItemOverrides` partiel :
  ```ts
  type ItemOverrides = Partial<{
    severite: string;
    medicaments: string;        // libellé reconstitué
    mecanisme: string;
    risque: string;
    recommandation: string;
    alternative: string;
    reference: string;
  }>;
  ```
- Étendre `ItemDecision` avec `overrides?: ItemOverrides`.
- Étendre le schéma Zod en conséquence (champs `.string().max(2000).optional()`).

### 2. UI éditable (`ClinicalAlertsPanel.tsx`)

- Dans `AlertItem`, ajouter un mode édition (toggle « Éditer la constatation IA ») actif uniquement quand `validation && !readOnly`.
- En mode édition, remplacer les `<Detail>` figés par des `<Textarea>` / `<Input>` pour : sévérité (Select : mineure / modérée / majeure / contre_indication), médicaments concernés, mécanisme, risque, recommandation, alternative, référence.
- À chaque édition, écrire dans `decision.overrides[champ]` via `validation.onChange`. Si un champ est ré-effacé pour revenir à la valeur IA → supprimer la clé de `overrides`.
- L'affichage par défaut (mode lecture) utilise la valeur effective : `override ?? valeur IA`, avec un petit badge « ✎ modifié par pharmacien » sur les champs surchargés.
- Toggle « Réinitialiser » : supprime tout `overrides` (garde le statut accepted/modified/rejected).
- Indiquer que cliquer « Éditer » bascule automatiquement le statut sur `modified` si aucun statut n'est posé.

### 3. État local (`ConciliationCompleteCard.tsx`)

- Pas de changement de logique : `decisions` contient déjà `ItemDecision[]`, qui transportera désormais aussi `overrides`.
- Verrouillage : `isLocked = !!validation && !editingValidation` — déjà en place. Tant que `!isLocked`, tout est éditable. « Modifier la validation » réactive l'édition (bouton déjà présent).
- Lors de `saveConciliationValidation`, les `overrides` sont persistés dans `item_decisions`.

### 4. Restitution dans le document pharmacien

`src/lib/conciliation/pharmacistDoc.functions.ts` (PDF/synthèse) : lorsqu'il existe, utiliser `decision.overrides.<champ>` en priorité, sinon la valeur IA. Marquer typographiquement les champs corrigés par le pharmacien (préfixe « [Corrigé] » ou astérisque + note de bas de page).

### 5. Tableau « Divergences ville ↔ hôpital » (section B)

Ce tableau (lignes 297-341 du Card) restera en lecture seule sur valeurs IA — l'édition se fait depuis la section A « Résultats de conciliation médicamenteuse » (où les mêmes items apparaissent dans `ClinicalAlertsPanel`). Les valeurs effectives (overrides) sont aussi appliquées dans ce tableau pour cohérence visuelle.

## Hors scope

- Ajouter / supprimer une constatation entière (uniquement édition des constatations IA existantes).
- Modifier les sections « Actions prioritaires », « Surveillance », « Conclusion clinique » : restent du ressort de l'IA (re-lancer si besoin).
- Changements de schéma DB (`item_decisions` est déjà `jsonb`).

## Fichiers touchés

- `src/lib/conciliation/validateConciliation.functions.ts` — type + schéma Zod
- `src/components/conciliation/ClinicalAlertsPanel.tsx` — mode édition par item, valeur effective
- `src/components/patient/ConciliationCompleteCard.tsx` — appliquer la valeur effective dans le tableau divergences
- `src/lib/conciliation/pharmacistDoc.functions.ts` — prendre en compte les overrides dans le document pharmacien
