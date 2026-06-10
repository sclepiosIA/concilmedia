/**
 * Parseur JSON tolérant pour les réponses des LLMs.
 *
 * Stratégie en cascade :
 * 1. Strip des fences markdown (```json … ```), trim
 * 2. JSON.parse direct
 * 3. Fallback : extraction du premier objet `{}` ou tableau `[]` équilibré
 *    (en ignorant les accolades dans les chaînes JSON)
 * 4. Sinon : throw `LLM_JSON_UNPARSABLE` avec un extrait de la réponse
 *
 * Anti-crash en démo : on ne laisse jamais `JSON.parse` jeter une erreur brute.
 */
export class LlmJsonParseError extends Error {
  constructor(public readonly raw: string) {
    super("LLM_JSON_UNPARSABLE");
    this.name = "LlmJsonParseError";
  }
}

function stripFences(text: string): string {
  return text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function findBalanced(text: string, open: "{" | "["): string | null {
  const close = open === "{" ? "}" : "]";
  const start = text.indexOf(open);
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

export function parseLlmJson<T = unknown>(text: string): T {
  if (!text || typeof text !== "string") {
    throw new LlmJsonParseError(String(text ?? ""));
  }
  const stripped = stripFences(text);
  try {
    return JSON.parse(stripped) as T;
  } catch {
    /* fallback */
  }

  // Essayer objet puis tableau, garder le plus précoce
  const objCandidate = findBalanced(stripped, "{");
  const arrCandidate = findBalanced(stripped, "[");
  const candidates = [objCandidate, arrCandidate].filter(
    (c): c is string => c !== null,
  );
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      /* try next */
    }
  }

  throw new LlmJsonParseError(stripped.slice(0, 500));
}
