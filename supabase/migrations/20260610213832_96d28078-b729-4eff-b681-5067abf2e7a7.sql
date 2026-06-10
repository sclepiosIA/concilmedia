CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE public.rag_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  titre text NOT NULL,
  version text,
  url text,
  licence text,
  ingested_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.rag_documents TO authenticated;
GRANT ALL ON public.rag_documents TO service_role;
ALTER TABLE public.rag_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read rag_documents" ON public.rag_documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service writes rag_documents" ON public.rag_documents FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_rag_documents_source ON public.rag_documents(source);

CREATE TABLE public.rag_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.rag_documents(id) ON DELETE CASCADE,
  ord integer NOT NULL DEFAULT 0,
  content text NOT NULL,
  tokens integer,
  embedding vector(3072) NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.rag_chunks TO authenticated;
GRANT ALL ON public.rag_chunks TO service_role;
ALTER TABLE public.rag_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read rag_chunks" ON public.rag_chunks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service writes rag_chunks" ON public.rag_chunks FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_rag_chunks_document ON public.rag_chunks(document_id);
CREATE INDEX idx_rag_chunks_content_trgm ON public.rag_chunks USING gin (content gin_trgm_ops);
-- Note : pgvector HNSW supporte max 2000 dims. Pour 3072 (gemini-embedding-001),
-- on n'index pas explicitement et on s'appuie sur le scan séquentiel (corpus < 50k chunks).
-- L'index trgm sert de filtre lexical de secours.

CREATE TABLE public.rag_query_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query text NOT NULL,
  top_k integer NOT NULL,
  hits jsonb NOT NULL DEFAULT '[]'::jsonb,
  used_in_analysis boolean NOT NULL DEFAULT false,
  episode_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.rag_query_logs TO authenticated;
GRANT ALL ON public.rag_query_logs TO service_role;
ALTER TABLE public.rag_query_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read rag_query_logs" ON public.rag_query_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service writes rag_query_logs" ON public.rag_query_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_rag_query_logs_created ON public.rag_query_logs(created_at DESC);

-- Fonction de recherche par similarité cosinus
CREATE OR REPLACE FUNCTION public.match_rag_chunks(
  query_embedding vector(3072),
  match_count integer DEFAULT 6,
  source_filter text[] DEFAULT NULL,
  similarity_threshold real DEFAULT 0.3
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  content text,
  source text,
  titre text,
  version text,
  metadata jsonb,
  similarity real
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.document_id,
    c.content,
    d.source,
    d.titre,
    d.version,
    c.metadata,
    (1 - (c.embedding <=> query_embedding))::real AS similarity
  FROM public.rag_chunks c
  JOIN public.rag_documents d ON d.id = c.document_id
  WHERE (source_filter IS NULL OR d.source = ANY(source_filter))
    AND (1 - (c.embedding <=> query_embedding)) >= similarity_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION public.match_rag_chunks(vector, integer, text[], real) TO authenticated, service_role;