// Server-only wrapper sur Azure OpenAI (Foundry) pour les embeddings.
// Déploiement Azure : text-embedding-3-large (3072 dims) sur ia-interne-resource.
// Fallback : Lovable Gateway (google/gemini-embedding-001) si AZURE_OPENAI_API_KEY absent.

const AZURE_RESOURCE_HOST = "ia-interne-resource.services.ai.azure.com";
const AZURE_DEPLOYMENT = "text-embedding-3-large";
const AZURE_ENDPOINT = `https://${AZURE_RESOURCE_HOST}/openai/v1/embeddings`;

const LOVABLE_ENDPOINT = "https://ai.gateway.lovable.dev/v1/embeddings";
const LOVABLE_MODEL = "google/gemini-embedding-001";

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

type ProviderChoice = { kind: "azure"; key: string } | { kind: "lovable"; key: string };

function pickProvider(): ProviderChoice {
  const azure = process.env.AZURE_OPENAI_API_KEY;
  if (azure) return { kind: "azure", key: azure };
  const lov = process.env.LOVABLE_API_KEY;
  if (lov) return { kind: "lovable", key: lov };
  throw new Error("Aucune clé d'embedding configurée (AZURE_OPENAI_API_KEY ou LOVABLE_API_KEY).");
}

async function embedBatch(texts: string[], provider: ProviderChoice): Promise<number[][]> {
  const endpoint = provider.kind === "azure" ? AZURE_ENDPOINT : LOVABLE_ENDPOINT;
  const model = provider.kind === "azure" ? AZURE_DEPLOYMENT : LOVABLE_MODEL;
  const headers: Record<string, string> =
    provider.kind === "azure"
      ? { "Content-Type": "application/json", "api-key": provider.key, Authorization: `Bearer ${provider.key}` }
      : { "Content-Type": "application/json", "Lovable-API-Key": provider.key };

  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ model, input: texts }),
    });
    if (res.ok) {
      const json = (await res.json()) as { data: Array<{ embedding: number[]; index: number }> };
      const sorted = [...json.data].sort((a, b) => a.index - b.index);
      return sorted.map((d) => d.embedding);
    }
    if (res.status === 402) {
      throw new Error("Crédits IA épuisés (HTTP 402).");
    }
    if (res.status === 429 || res.status >= 500) {
      const wait = 500 * Math.pow(2, attempt);
      await sleep(wait);
      continue;
    }
    const body = await res.text();
    throw new Error(`Embeddings ${provider.kind} ${res.status}: ${body.slice(0, 300)}`);
  }
  throw new Error("Embeddings : trop de tentatives (429/5xx)");
}

/**
 * Embed N textes. Batch de 32 max par requête.
 * Renvoie un array aligné sur l'entrée.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const provider = pickProvider();
  const BATCH = 32;
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH);
    const vecs = await embedBatch(slice, provider);
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
