// Recherche par similarité vectorielle dans le corpus RAG.
import { embedOne, toPgVector } from "./embed.server";

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

export interface RagHit {
  id: string;
  document_id: string;
  content: string;
  source: string;
  titre: string;
  version: string | null;
  similarity: number;
  metadata: JsonValue;
}

export interface RagContext {
  hits: RagHit[];
}


export async function retrieveContext(
  query: string,
  topK = 6,
  filters?: { source?: string[]; threshold?: number; episodeId?: string },
): Promise<RagContext> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const q = (query ?? "").trim();
  if (!q) return { hits: [] };

  const vec = await embedOne(q);
  const { data, error } = await supabaseAdmin.rpc("match_rag_chunks", {
    query_embedding: toPgVector(vec) as unknown as string,
    match_count: topK,
    source_filter: filters?.source ?? null,
    similarity_threshold: filters?.threshold ?? 0.3,
  } as never);
  if (error) throw new Error(`match_rag_chunks: ${error.message}`);

  const hits: RagHit[] = ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    document_id: String(r.document_id),
    content: String(r.content),
    source: String(r.source),
    titre: String(r.titre),
    version: (r.version as string | null) ?? null,
    similarity: Number(r.similarity ?? 0),
    metadata: (r.metadata as Record<string, unknown> | null) ?? {},
  }));

  // Log async, ne bloque pas la requête
  void supabaseAdmin
    .from("rag_query_logs")
    .insert({
      query: q.slice(0, 1000),
      top_k: topK,
      hits: hits.map((h) => ({ id: h.id, source: h.source, similarity: h.similarity })) as never,
      used_in_analysis: filters?.episodeId != null,
      episode_id: filters?.episodeId ?? null,
    })
    .then(() => {});

  return { hits };
}
