## Problème observé

Sur l'écran de Mme X (FA, CHA2DS2-VASc=4) :
- L'Apixaban apparaît **2 fois** : une fois en "Contre-indications", une fois en "Médicaments à haut risque".
- Le libellé "Contre-indication" est **faux** sur le plan clinique : il s'agit d'une **omission hospitalière** d'un anticoagulant indispensable (l'Apixaban n'est PAS contre-indiqué, il est manquant à l'hôpital alors qu'il est requis).
- La section B "Aide à la décision clinique" est aujourd'hui une synthèse clinique générique, pas une vraie aide à la conciliation pour le pharmacien.

## Cause racine

Le prompt de `analyzePatientConciliationComplete` ne propose à l'IA aucune catégorie pour les vraies divergences de conciliation (omission, ajout non justifié, switch IV/PO, modification de posologie ville↔hôpital). L'IA case donc l'omission d'Apixaban dans `contre_indications`, puis le re-mentionne dans `medicaments_haut_risque` parce qu'Apixaban est un AOD à risque → doublon.

De plus, la section B n'expose que `synthese` / `conclusion_clinique` / `surveillance`, sans rien de spécifique à la conciliation.

## Plan de correction

### 1. Refondre le prompt et le schéma autour de la conciliation médicamenteuse

Ajouter une nouvelle catégorie **`divergences_conciliation`** au payload IA, qui devient le **cœur** de la section A :

```
divergences_conciliation: [{
  type: "omission" | "ajout_non_justifie" | "switch" | "modification_posologie" | "substitution_classe",
  medicament_ville: string | null,
  medicament_hopital: string | null,
  severite: "mineure" | "moderee" | "majeure" | "critique",
  justification_clinique: string,   // pourquoi c'est un problème (CHA2DS2, DFG, INR...)
  risque: string,
  recommandation: string,           // "Reprendre Apixaban 5 mg x2/j", "Documenter l'arrêt", etc.
  alternative: string,
  reference: string,
  confiance: 0-100
}]
```

Règles ajoutées au prompt :
- **Une molécule ne doit apparaître que dans UNE seule catégorie** ; priorité = divergence_conciliation > contre_indication > interaction > haut_risque.
- "Contre-indication" est réservé aux médicaments **prescrits** alors qu'ils sont contre-indiqués chez ce patient (pas aux médicaments manquants).
- Les anticoagulants/AOD ne doivent plus être listés systématiquement comme "haut risque" s'ils sont déjà couverts par une divergence.

### 2. Mettre à jour `AIAnalysisPayload` et `ClinicalAlertsPanel`

- Ajouter le type `divergences_conciliation` dans `AIAnalysisPayload` (`src/lib/conciliation/analyze.functions.ts`).
- Ajouter une section dédiée **"Divergences de conciliation"** en tête du panneau A (avec icône, badge type omission/ajout/switch, couleur selon sévérité).
- Étendre `ItemDecision["category"]` pour inclure `"divergences_conciliation"` (migration : ajouter la valeur dans le `z.enum`).
- Compter ces items dans le `totalAlertes` et dans les compteurs accepté/modifié/refusé de la carte.

### 3. Transformer la section B en vraie aide à la décision pour la conciliation

Remplacer le contenu actuel de la section B par 3 blocs orientés pharmacien :

1. **Tableau de synthèse des divergences** — pour chaque divergence (omission / ajout / switch / modif posologie), une ligne : ville → hôpital, action recommandée, niveau d'urgence.
2. **Actions prioritaires** — liste ordonnée d'interventions pharmaceutiques concrètes (ex : "Contacter le prescripteur pour reprise Apixaban 5 mg x2/j — urgent"), générées par l'IA.
3. **Surveillance recommandée** — conservée (déjà utile).

Renommer la section : "B. Aide à la décision pharmaceutique" (au lieu de "Aide à la décision clinique").

Ajouter ces champs au prompt :
```
"actions_prioritaires": [{"action":"...", "urgence":"immediate|24h|differee", "destinataire":"prescripteur|IDE|patient", "justification":"..."}]
```

### 4. Validation et migration

- Pas de migration SQL (le payload est stocké en JSONB, le nouveau champ s'ajoute sans schéma).
- Les anciennes analyses sans `divergences_conciliation` continuent de s'afficher (les sections vides ne sont pas rendues).
- L'utilisateur doit "Relancer l'IA" pour bénéficier de la nouvelle structure.

## Fichiers modifiés

- `src/lib/conciliation/analyzePatientConciliationComplete.functions.ts` — nouveau prompt, nouvelles règles anti-doublon.
- `src/lib/conciliation/analyze.functions.ts` — type `AIAnalysisPayload` étendu.
- `src/lib/conciliation/validateConciliation.functions.ts` — ajouter `"divergences_conciliation"` au z.enum de `ItemDecision`.
- `src/components/conciliation/ClinicalAlertsPanel.tsx` — nouvelle section "Divergences", catégorie ajoutée.
- `src/components/patient/ConciliationCompleteCard.tsx` — section B refondue (tableau divergences + actions prioritaires), titre renommé, totaux mis à jour.

## Résultat attendu

- Plus de doublon : Apixaban apparaîtra une seule fois, dans **"Divergences de conciliation → Omission majeure"** avec recommandation "Reprendre Apixaban 5 mg x2/j (CHA2DS2-VASc=4, DFG 78)".
- La section B devient un véritable outil de travail pharmaceutique (actions priorisées) plutôt qu'un résumé clinique général.
