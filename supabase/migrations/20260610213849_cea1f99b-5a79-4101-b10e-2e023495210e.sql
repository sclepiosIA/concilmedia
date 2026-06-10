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
SECURITY INVOKER
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