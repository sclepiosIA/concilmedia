## Objectif

Créer une page dédiée `/architecture-ia` (accessible aux utilisateurs authentifiés) qui illustre **précisément** l'architecture IA réelle du projet, en corrigeant l'omission du schéma précédent : **plusieurs providers LLM coexistent** (Lovable AI Gateway + Azure OpenAI + Azure Foundry OpenAI Responses + Azure Foundry Anthropic), tous orchestrés par `resolveAITask` à partir de la table `ai_tasks` / `ai_providers`.

## Contenu de la page

### 1. En-tête
Titre, sous-titre, badge "4 couches", date de mise à jour.

### 2. Schéma global (Mermaid rendu inline via `mermaid` lib)
Diagramme à 4 couches verticales montrant le flux : **Dossier patient → Couche 1 Déterministe → Couche 2 ML inline → Couche 3 LLM multi-providers (résolu via `ai_tasks`) → Couche 4 Orchestration / UI**. Les flèches montrent que la couche LLM peut router vers **Lovable Gateway, Azure OpenAI classique, Azure Foundry (Responses API) ou Azure Foundry (Anthropic)** selon le `provider.kind` + `extra_config.variant`.

### 3. Section "Couche 1 — Moteur déterministe"
Cards : normalisation DCI, `DRUG_SYNONYMS`, `hospitalCovers()`, `deterministicAlerts` (STOPP/START + interactions ATC), dédup par `rule.id`. Liens vers les fichiers sources.

### 4. Section "Couche 2 — ML inline (`mlConcilmed.server.ts`)"
Deux cards :
- **Étage 2 — Triage patient** : entrées (âge, comorbidités, IR/IH, bio, durée séjour…), formule logistique, sortie `score ∈ [0,1]`, consommateur `usePatientsTriage`.
- **Étage 4 — Gravité des omissions** : keywords haut risque + ATC prefixes (B01, A10, C01, N03, L04, N05A, N02A), formule, seuils `high ≥ 0.7 / moderate ≥ 0.4`, injection dans `DivergenceConciliation.ml_severity_score`.

Avantages mis en avant : 0 latence réseau, déterministe, compatible workerd, pas de secret.

### 5. Section "Couche 3 — LLM multi-providers"
Diagramme + tableau exhaustif des providers réellement supportés par `runAITask.server.ts` :

| Provider kind | SDK | Endpoint | Auth | Variante |
|---|---|---|---|---|
| `lovable` | `@ai-sdk/openai-compatible` | `ai.gateway.lovable.dev/v1` | `Lovable-API-Key` | — |
| `openai` | `@ai-sdk/openai` | api.openai.com | Bearer | — |
| `azure_openai` | `@ai-sdk/azure` | `*.openai.azure.com` | `api-key` | classique |
| `azure_openai` | `@ai-sdk/openai` (`.responses()`) | `services.ai.azure.com/openai/v1/responses` | `api-key` | `azure_foundry_responses` |
| `azure_openai` | `@ai-sdk/openai-compatible` | `services.ai.azure.com/openai/v1` | `api-key` + Bearer | foundry legacy |
| `google` | `@ai-sdk/google` | generativelanguage.googleapis.com | apiKey | — |
| `anthropic` | `@ai-sdk/anthropic` | api.anthropic.com | apiKey | — |
| `anthropic` | `@ai-sdk/anthropic` | Azure Foundry | `api-key` | `azure_foundry_anthropic` |
| `openai_compatible` | `@ai-sdk/openai-compatible` | custom | Bearer | — |

Encadré "Résolution dynamique" : `resolveAITask(slug, fallback)` lit `ai_tasks` + `ai_providers`, déchiffre la clé via `ai_provider_decrypt_key(AI_PROVIDERS_ENCRYPTION_KEY)`, construit le modèle et adapte `callOptions` (GPT-5 : `max_completion_tokens` + `reasoning_effort`).

Tableau "Modèles disponibles pour la cohorte" (lu depuis `AVAILABLE_MODELS`) : Gemini 3 Flash, GPT-5 (Lovable), **Claude Opus 4.8 via Azure Foundry**, **GPT-5.4 / GPT-5 Nano via Azure Foundry Responses**.

### 6. Section "Couche 4 — Tâches IA"
Tableau des `ai_tasks` (slug → fichier → usage) :

| Slug | Server fn | Rôle |
|---|---|---|
| `analyze_conciliation` | `analyze.functions.ts` | Analyse complète d'un épisode |
| `analyze_patient_complete` | `analyzePatientConciliationComplete.functions.ts` | Synthèse multi-épisodes patient |
| `analyze_patient_synthesis` | `analyzePatientSynthesis.functions.ts` | Header synthèse patient |
| `match_prescription` | `matchPrescriptionAI.functions.ts` | Concordance ville/hôpital |
| `extract_ordonnance` | `extractOrdonnance.functions.ts` | OCR ordonnance |
| `extract_lettre_admission` | `extractLettreAdmission.functions.ts` | Extraction lettre admission |
| `extract_biologie` | `extractBiologie.functions.ts` | Extraction biologie |
| `pharmacist_doc_compare` | `pharmacistDoc.functions.ts` | Comparaison doc pharmacien |
| `prioritize` | `prioritize.functions.ts` | Tri actions cliniques |

Mention du mode `execution_mode ∈ {llm, ml, both}` configurable par tâche.

### 7. Section "Sécurité & secrets"
- `LOVABLE_API_KEY` (env, jamais exposée client)
- `AZURE_OPENAI_API_KEY` (env, fallback)
- Clés provider chiffrées en base via `pgp_sym_encrypt` + `AI_PROVIDERS_ENCRYPTION_KEY`
- Server functions protégées par `requireSupabaseAuth` + `attachSupabaseAuth`

### 8. Flux end-to-end (Mermaid sequence)
`UI → useServerFn → analyzeConciliation → resolveAITask → buildModel(Azure Foundry) → generateText → AI SDK Output.object → BDD conciliation_ai_analyses → UI AIAnalysisPanel` avec parallèlement appel `scoreOmissionsSeverity` (ML inline).

## Détails techniques

- **Nouvelle route** : `src/routes/_authenticated/architecture-ia.tsx` (utilise le gate auth existant).
- **Dépendance** : ajouter `mermaid` (`bun add mermaid`) pour rendu client-side des deux schémas. Composant `<MermaidDiagram>` réutilisable dans `src/components/architecture/MermaidDiagram.tsx` (init côté client uniquement, `useEffect` + `mermaid.render`).
- **Composants** : 
  - `src/components/architecture/LayerCard.tsx` — card avec numéro de couche, titre, description, sous-éléments.
  - `src/components/architecture/ProviderTable.tsx` — tableau providers.
  - `src/components/architecture/TaskTable.tsx` — tableau tâches.
- **Données statiques** : la liste des modèles est importée depuis `src/lib/ai/availableModels.ts` (déjà existant). Le reste est codé en dur dans la page (documentation).
- **Navigation** : ajouter un lien "Architecture IA" dans le header/sidebar admin existant (à confirmer où — probablement dans `admin.tsx` outlet) — sinon route accessible directement par URL.
- **Style** : tokens existants (`bg-primary/5`, `border-primary/30`, cards shadcn). Pas de nouvelles couleurs.
- **Pas de logique backend nouvelle** — page 100 % documentation/lecture seule.

## Hors scope

- Pas de modification de `runAITask.server.ts`, des tâches IA, du ML, ni des RLS.
- Pas d'export PDF de la page (pourra être ajouté plus tard).
- Pas de stats temps réel (utilisation, coût) — page documentaire.
