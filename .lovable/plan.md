
# Piste #3 — RAG sur thésaurus cliniques

## Objectif

Ancrer les analyses LLM sur des passages issus de thésaurus de référence (STOPP/START v2, Laroche, ANSM Thésaurus interactions, RCP BDPM, recommandations HAS/SPILF) au lieu de laisser le modèle inventer ses sources. Chaque alerte cite un extrait vectorisable et opposable.

## Périmètre v1

Livrable : une infrastructure RAG complète (ingestion + retrieval + injection dans le prompt), seedée avec **STOPP/START v2 + Laroche + un sous-ensemble RCP BDPM**. Les corpus ANSM/HAS PDF feront l'objet d'imports admin progressifs.

Hors périmètre v1 : reranking dense (cross-encoder), BM25 hybride, ingestion automatique de PDF (admin upload manuel seulement), licences payantes (Vidal/Thériaque).

## Architecture

```text
                    ┌──────────────────────────┐
                    │   /admin/rag (page)      │
                    │   • upload texte/md       │
                    │   • re-seed STOPP/Laroche │
                    │   • recherche test        │
                    └────────────┬─────────────┘
                                 │ serverFn
                                 ▼
   embedDocuments ─► Lovable AI embeddings (gemini-embedding-001, 3072)
                                 │
                                 ▼
                      ┌──────────────────────┐
                      │ rag_documents        │  source, version, url, licence
                      │ rag_chunks           │  content, embedding vector(3072)
                      └──────────┬───────────┘
                                 │
analyzeConciliation ─► buildRagContext(dossier) ─► top-k passages ─► system prompt + "sources" obligatoires
```

## Schéma BDD

Migration unique :

- `CREATE EXTENSION IF NOT EXISTS vector`
- `rag_documents` (id, source, titre, version, url, licence, ingested_at)
- `rag_chunks` (id, document_id FK, ord, content text, tokens int, embedding vector(3072), metadata jsonb, created_at)
  - Index HNSW : `USING hnsw (embedding vector_cosine_ops)`
  - Index trgm sur `content` pour fallback lexical simple
- `rag_query_logs` (id, query, top_k, hits jsonb, used_in_analysis bool, episode_id null, created_at) — pour mesurer l'utilité réelle
- GRANT `SELECT` à `authenticated` (corpus public + métadonnées), `ALL` à `service_role`. Aucune écriture utilisateur — ingestion via serverFn admin.
- RLS activée, policies SELECT ouvertes pour `authenticated`.

## Serveur

Nouveaux fichiers, tous server-only via `createServerFn` + `requireSupabaseAuth` + check rôle admin pour l'ingestion :

1. **`src/lib/rag/embed.server.ts`** — wrapper `embedTexts(texts: string[])` qui appelle `POST https://ai.gateway.lovable.dev/v1/embeddings` (modèle `google/gemini-embedding-001`, batch de 32, retry exponentiel sur 429/500). Renvoie `number[][]`.
2. **`src/lib/rag/chunk.server.ts`** — `chunk(text, { maxChars: 1200, overlap: 200 })` qui découpe sur paragraphes puis sur phrases.
3. **`src/lib/rag/ingestCorpus.functions.ts`** :
   - `ingestStoppStart()` : sérialise les règles du fichier existant `src/lib/conciliation/stoppStart.ts` (déjà structuré : id, label, classe, conditions) en chunks "STOPP-E1 — IPP > 8 semaines sans indication : …". Source = "STOPP/START v2".
   - `ingestLaroche()` : seed initial codé en dur d'une trentaine de critères Laroche (médicaments inappropriés sujet âgé). Source = "Liste de Laroche 2015".
   - `ingestRcpFromBdpm({ limit })` : pour les 200 premières spécialités BDPM les plus prescrites, génère un chunk synthétique "DCI X — forme Y — voie Z — titulaire — surveillance renforcée : oui/non — code ATC : …" depuis `bdpm_specialites`+`bdpm_atc`+`bdpm_compositions`. Source = "BDPM v<date import>".
   - `ingestText({ source, titre, version, url, licence, text })` : import manuel admin pour PDF/HTML décodé côté client.
4. **`src/lib/rag/retrieve.server.ts`** — `retrieveContext(query: string, k=6, filters?: { source?: string[] })` :
   - Embedding de la query.
   - SQL function `match_rag_chunks(query_embedding, match_count, source_filter)` : `1 - (embedding <=> query) AS similarity`, filtrage optionnel sur source, threshold 0.5.
   - Log dans `rag_query_logs`.
5. **`src/lib/rag/buildRagContext.server.ts`** — `buildRagContext(dossier)` :
   - Construit 1 query par signal fort du dossier : chaque interaction de classes ATC présentes, chaque comorbidité majeure, chaque critère d'âge>75ans, chaque DCI haut risque. Plafond 8 queries.
   - Dédoublonne les chunks récupérés, garde top 12 globalement (≈ 6k tokens).
   - Retourne `{ passages: Array<{ id, source, citation, content }>, asPromptSection: string }` où `asPromptSection` est formaté comme :
     ```
     # Références opposables
     [S1] STOPP/START v2 — règle E1 : "…"
     [S2] BDPM v2026-06 — APIXABAN 5 mg : "…"
     ```

## Intégration dans `analyzeConciliation` et `analyzePatientConciliationComplete`

- Construire `ragContext` après chargement du dossier, avant `generateText`.
- Concaténer `asPromptSection` au début du `systemPrompt` (avant les règles JSON) avec consigne ajoutée :
  > Tu as accès aux passages numérotés [S1]…[Sn] ci-dessus. Chaque alerte produite DOIT remplir le champ `reference` avec le code [Sn] correspondant ; si aucune source ne couvre l'alerte, mets `reference: "non couvert RAG"` et baisse le score `confiance` ≤ 60.
- Stocker `ragContext.passages` dans la colonne `payload.rag_sources` de `conciliation_ai_analyses` pour pouvoir afficher les sources dans l'UI patient (à brancher plus tard, hors v1).

## UI

Nouvelle route `/admin/rag` (protégée admin via has_role) :

- **Statut** : nb documents, nb chunks, dernier ingest par source.
- **Boutons** : "Re-seed STOPP/START", "Re-seed Laroche", "Indexer top 200 BDPM" (désactivé si BDPM vide).
- **Upload manuel** : `<textarea>` + champs source/titre/version/licence → `ingestText`. Pas d'upload PDF côté serveur en v1 (parser PDF Worker-incompatible côté workerd) — l'utilisateur colle le texte extrait.
- **Recherche test** : champ libre → top-k passages avec score, source, citation.
- Lien depuis `admin.tsx` (à côté de "BDPM" et "RLHF").

## Fichiers touchés

- Migration : `rag_documents`, `rag_chunks` (vector 3072 + HNSW), `rag_query_logs`, fonction SQL `match_rag_chunks`, `CREATE EXTENSION vector`.
- Nouveaux : `src/lib/rag/{embed,chunk,retrieve,buildRagContext}.server.ts`, `src/lib/rag/ingestCorpus.functions.ts`, `src/routes/_authenticated/admin.rag.tsx`.
- Modifiés : `src/lib/conciliation/analyze.functions.ts` et `analyzePatientConciliationComplete.functions.ts` (injection RAG dans le system prompt + persistence des sources), `src/routes/_authenticated/admin.tsx` (nav), `src/routes/_authenticated/ameliorations.tsx` (badge "Livré v1" sur piste #3).

## Vérification

1. Migration appliquée + `vector` listé dans `pg_extension`.
2. `/admin/rag` → "Re-seed STOPP/START" → ~100 chunks insérés, embeddings dim 3072.
3. Recherche test "patient âgé sous IPP au long cours" → règle STOPP-E1 dans le top-3.
4. Analyser un patient existant → `payload.rag_sources` non vide, alertes IA citent `[S1]`, `[S2]`, … au lieu de "ANSM 2024".
5. Coût : `usage.prompt_tokens` ≤ 30k par analyse (vérifié dans les logs).

## Limites assumées v1

- pgvector 3072 dims sur HNSW : OK techniquement, taille index ~12 MB pour 10k chunks.
- Pas de cross-encoder reranker — la qualité dépendra du chunking et de la formulation des queries auto-construites.
- Pas de gestion fine de licences : seuls les corpus libres (STOPP, Laroche, BDPM) sont seedés par défaut.
- Pas de cron de refresh : ingestion à la demande depuis `/admin/rag`.
