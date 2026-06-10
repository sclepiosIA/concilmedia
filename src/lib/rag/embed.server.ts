// Server-only wrapper sur Lovable AI Gateway pour les embeddings.
// Modèle : google/gemini-embedding-001 (3072 dims). Batch + retry exponentiel.

const ENDPOINT = "https://ai.gateway.lovable.dev/v1/embeddings";
const MODEL = "google/gemini-embedding-001";

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function embedBatch(texts: string[], apiKey: string): Promise<number[][]> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({ model: MODEL, input: texts }),
    });
    if (res.ok) {
      const json = (await res.json()) as { data: Array<{ embedding: number[]; index: number }> };
      const sorted = [...json.data].sort((a, b) => a.index - b.index);
      return sorted.map((d) => d.embedding);
    }
    if (res.status === 402) {
      throw new Error("Crédits Lovable AI épuisés (HTTP 402). Rechargez le workspace.");
    }
    if (res.status === 429 || res.status >= 500) {
      const wait = 500 * Math.pow(2, attempt);
      await sleep(wait);
      continue;
    }
    const body = await res.text();
    throw new Error(`Embeddings ${res.status}: ${body.slice(0, 300)}`);
  }
  throw new Error("Embeddings : trop de tentatives (429/5xx)");
}

/**
 * Embed N textes. Batch de 32 max par requête (limite raisonnable).
 * Renvoie un array aligné sur l'entrée.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY manquante");
  if (texts.length === 0) return [];
  const BATCH = 32;
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH);
    const vecs = await embedBatch(slice, apiKey);
    out.push(...vecs);
  }
  return out;
}

export async function embedOne(text: string): Promise<number[]> {
  const [v] = await embedTexts([text]);
  return v;
}

/** Format pgvector text representation: "[0.1,0.2,...]". */
export function toPgVector(v: number[]): string {
  return "[" + v.map((x) => (Number.isFinite(x) ? x.toString() : "0")).join(",") + "]";
}
