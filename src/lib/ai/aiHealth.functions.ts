// Piste #12 — Détection de santé de la passerelle IA principale (Azure Foundry).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AiHealthStatus = "ok" | "degraded" | "down" | "unknown";

export interface AiHealthSnapshot {
  status: AiHealthStatus;
  message: string;
  latencyMs: number | null;
  providerKind: string;
  checkedAt: string;
}

let cache: { value: AiHealthSnapshot; expiresAt: number } | null = null;
const CACHE_TTL_MS = 60_000;

const AZURE_URL =
  "https://ia-interne-resource.services.ai.azure.com/openai/v1/chat/completions";

async function probeAzure(): Promise<AiHealthSnapshot> {
  const apiKey = process.env.AZURE_OPENAI_API_KEY ?? null;
  const checkedAt = new Date().toISOString();
  if (!apiKey) {
    // Fallback : ping Lovable si Azure non configuré.
    const lov = process.env.LOVABLE_API_KEY;
    if (!lov) {
      return {
        status: "down",
        message: "Aucune clé IA configurée (Azure ni Lovable).",
        latencyMs: null,
        providerKind: "none",
        checkedAt,
      };
    }
    return probeLovable(lov, checkedAt);
  }
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const resp = await fetch(AZURE_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-5.5",
        max_completion_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      }),
    });
    const latencyMs = Date.now() - start;
    if (resp.ok) {
      return {
        status: latencyMs > 3000 ? "degraded" : "ok",
        message:
          latencyMs > 3000
            ? `Azure OpenAI : latence élevée (${latencyMs} ms)`
            : "Azure OpenAI opérationnel.",
        latencyMs,
        providerKind: "azure_openai",
        checkedAt,
      };
    }
    if (resp.status === 429) {
      return { status: "degraded", message: "Azure : limite atteinte (429).", latencyMs, providerKind: "azure_openai", checkedAt };
    }
    if (resp.status >= 500) {
      return { status: "degraded", message: `Azure en erreur (${resp.status}).`, latencyMs, providerKind: "azure_openai", checkedAt };
    }
    return { status: "degraded", message: `Azure : réponse inattendue (${resp.status}).`, latencyMs, providerKind: "azure_openai", checkedAt };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const isTimeout = msg.toLowerCase().includes("abort");
    return {
      status: "down",
      message: isTimeout ? "Délai dépassé (>5 s) sur Azure OpenAI." : `Azure inaccessible : ${msg}`,
      latencyMs: Date.now() - start,
      providerKind: "azure_openai",
      checkedAt,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function probeLovable(apiKey: string, checkedAt: string): Promise<AiHealthSnapshot> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      }),
    });
    const latencyMs = Date.now() - start;
    if (resp.ok) {
      return {
        status: latencyMs > 2500 ? "degraded" : "ok",
        message: "Lovable Gateway opérationnel (fallback).",
        latencyMs,
        providerKind: "lovable",
        checkedAt,
      };
    }
    return { status: "degraded", message: `Lovable : ${resp.status}`, latencyMs, providerKind: "lovable", checkedAt };
  } catch (e: unknown) {
    return {
      status: "down",
      message: `Lovable inaccessible : ${e instanceof Error ? e.message : String(e)}`,
      latencyMs: Date.now() - start,
      providerKind: "lovable",
      checkedAt,
    };
  } finally {
    clearTimeout(timer);
  }
}

export const getAiGatewayHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<AiHealthSnapshot> => {
    if (cache && cache.expiresAt > Date.now()) return cache.value;
    const value = await probeAzure();
    cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  });

export const forceRefreshAiGatewayHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<AiHealthSnapshot> => {
    cache = null;
    const value = await probeAzure();
    cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  });
