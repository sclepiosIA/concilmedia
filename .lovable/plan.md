## Plan datathon — 5 blocs, ~4h, ordre d'impact

Confirmé par exploration : `evaluateStoppForDci` (stoppStart.ts) et `CLASS_INTERACTIONS` (atcInteractions.ts) **ne sont jamais appelés** → l'audit est exact, c'est bien le meilleur ROI.

### BLOC 0 — Parsing LLM tolérant (centralisé) — ~30 min

Au lieu de patcher 7+ fichiers indépendamment, je centralise dans `runAITask.server.ts` qui est déjà le point de passage unique pour tous les appels IA.

- Créer `src/lib/llm/parseLlmJson.ts` : strip fences markdown → `JSON.parse` → fallback extraction du premier objet `{}` équilibré → throw `LLM_JSON_UNPARSABLE` propre.
- Dans `runAITask.server.ts` : ajouter une option `expectJson?: boolean` au retour ; quand `true`, parser via `parseLlmJson` et **retry une fois** la `generateText` si échec.
- Remplacer dans les 7 fichiers concernés (`analyze`, `analyzePatientConciliationComplete`, `analyzePatientSynthesis`, `extractOrdonnance`, `extractBiologie`, `extractLettreAdmission`, `bulkImport`, `matchPrescriptionAI`, `pharmacistDoc`, `cohort/goldStandard`) le `result.text.replace + JSON.parse` par `parseLlmJson(result.text)` (ou activer `expectJson` côté `runAITask`).

**Done quand** : un JSON entouré de texte parasite est récupéré sans crash, et un échec total affiche un toast clair au lieu d'un écran rouge.

### BLOC 1 — Câbler les moteurs déterministes — ~1h

- Créer `src/lib/conciliation/deterministicAlerts.ts` exportant `computeDeterministicAlerts({ age, comorbidites, traitements_dci })` qui :
  - classe chaque DCI via `classifyDci`,
  - applique les 8 couples de `CLASS_INTERACTIONS` → alertes `{ source: 'regle', type: 'interaction', severite, libelle, mecanisme, reference: 'Référentiel interne ATC' }`,
  - applique `evaluateStoppForDci` sur chaque DCI → alertes `{ source: 'regle', type: 'stopp', id, libelle, severite, reference: 'STOPP/START v2' }`.
- Dans `analyze.functions.ts`, après la construction du dossier et avant le retour : appeler la fonction et fusionner sous `payload.alertes_regles` (sans casser le format existant attendu par l'UI — on **ajoute** un champ).
- Persister ces alertes dans `conciliation_ai_analyses` à côté des alertes IA pour qu'elles soient visibles côté UI.

**Done quand** : sur Jean Martin / Sophie Lemoine, au moins 1 interaction de classe et 1 critère STOPP apparaissent, taggés source `regle`.

### BLOC 2 — Explicabilité visible — ~1h

- `RiskScoreBadge.tsx` : wrapper le badge dans un `HoverCard`/`Popover` (shadcn) listant `variables.breakdown` (variable / contribution / detail). Données déjà dispo depuis le loader de `episodes.$episodeId.tsx`, zéro requête supplémentaire.
- `ClinicalAlertsPanel.tsx` : afficher un badge de provenance par alerte :
  - `source === 'regle'` → badge vert **« Règle vérifiée »**
  - sinon → badge ambre **« Hypothèse IA »**
  - si une alerte IA matche une alerte déterministe (clé : type + classes/DCI concernées) → badge vert foncé **« Confirmé par règle »**
- Petit `mergeAlerts()` côté composant pour faire la corrélation IA↔règle.

**Done quand** : hover sur le score affiche la décomposition ; chaque alerte porte un badge de provenance ; au moins une alerte est « Confirmé par règle » sur le patient démo.

### BLOC 3 — Matching « light » mais crédible — ~1h

- Créer `src/lib/conciliation/normalize.ts` :
  - `normDci(s)` : lowercase + NFD sans accents + retrait dosage + table `SYNONYMES` (~50 princeps→DCI : doliprane→paracetamol, kardegic→aspirine, lasilix→furosemide, levothyrox→levothyroxine, lovenox→enoxaparine, etc.).
  - `parseDose(s)` : extrait valeur + unité, retourne `{ mg, unite }` (g→×1000, µg→÷1000).
- Dans `useMedicationReconciliation.ts → detectDivergences` :
  - remplacer le matching `includes()` par `normDci(a) === normDci(b)` avec garde `length >= 4` pour éviter les collisions courtes ;
  - comparer les doses via `parseDose` numérique (différence en mg, tolérance 0) au lieu de la sous-chaîne brute.
- Garder la logique côté hook (refactor serveur = next step pitch).

**Done quand** : « Doliprane 1000 mg » et « Paracétamol 1 g » sont appariés (pas de fausse omission) ; « 1000 mg » vs « 1000 µg » lève une `modification_dose`.

### BLOC 4 — Chiffre avant/après F1 — ~30 min (documenté, exécution manuelle)

`evaluate.functions.ts` + `EvaluationMatrix.tsx` existent déjà. Je documente la procédure ; l'exécution (re-seed + capture) reste manuelle.

- AVANT Bloc 3 : lancer `evaluatePrecision` sur la cohorte synthétique → screenshot `EvaluationMatrix` (precision/recall/F1 + détail `par_type`).
- APRÈS Bloc 3 : re-seed → re-détecter → relancer `evaluatePrecision` → second screenshot.
- Préparer le wording slide (avant/après F1, mention honnête de la limite « éval sur synthétique avec appariement sous-chaîne → borne haute »).

## Hors-scope (slides « next steps »)

Sécurité IDOR `supabaseAdmin`, `.env` versionné, NIR en clair, audit HDS, BDPM complet (15 000 CIS), RAG ANSM/RCP, classification intentionnalité ML, Vitest + CI, déplacement `detectDivergences` côté serveur.

## Détails techniques

- Centraliser le parsing dans `runAITask` plutôt que patcher 7 fichiers : un seul point de bug + meilleurs logs + retry unifié.
- Le retry sur `LLM_JSON_UNPARSABLE` se fait à l'intérieur de `runAITask` avec un message système légèrement renforcé (« Réponds uniquement par un objet JSON valide, sans texte autour »).
- Fusion IA↔règle (Bloc 2) : matcher par `(type, classes)` pour les interactions et par `(type, dci, critereId)` pour STOPP. Tolérant à la casse et à la normalisation.
- Aucune migration DB requise. Aucune nouvelle dépendance npm.
- Pas de modification des fichiers Supabase auto-générés ni des prompts en base (Admin IA reste la source de vérité ; on n'altère que le runtime).

## Ordre d'exécution recommandé

1. Bloc 0 (anti-crash, prérequis démo)
2. Bloc 1 (déterministe câblé → débloque le « Confirmé par règle » du Bloc 2)
3. Bloc 2 (explicabilité UI)
4. Bloc 3 (matching, plus risqué donc en dernier)
5. Bloc 4 (mesure ; exécution manuelle après Bloc 3)
