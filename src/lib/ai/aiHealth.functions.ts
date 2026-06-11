// Piste #12 v1 — Détection de santé de la passerelle IA (Lovable Gateway).
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

// Cache module-level pour éviter de marteler le provider.
let cache: { value: AiHealthSnapshot; expiresAt: number } | null = null;
const CACHE_TTL_MS = 60_000;

async function probeLovableGateway(): Promise<AiHealthSnapshot> {
  const apiKey = process.env.LOVABLE_API_KEY ?? null;
  const checkedAt = new Date().toISOString();
  if (!apiKey) {
    return {
      status: "down",
      message: "LOVABLE_API_KEY absente — IA indisponible.",
      latencyMs: null,
      providerKind: "lovable",
      checkedAt,
    };
  }
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "vercel-ai-sdk",
      },
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
        message: latencyMs > 2500 ? `Latence élevée (${latencyMs} ms)` : "Passerelle IA opérationnelle.",
        latencyMs,
        providerKind: "lovable",
        checkedAt,
      };
    }
    if (resp.status === 402) {
      return {
        status: "down",
        message: "Crédits IA épuisés — ajoutez des crédits dans l'espace de travail.",
        latencyMs,
        providerKind: "lovable",
        checkedAt,
      };
    }
    if (resp.status === 429) {
      return {
        status: "degraded",
        message: "Limite IA atteinte temporairement (429).",
        latencyMs,
        providerKind: "lovable",
        checkedAt,
      };
    }
    if (resp.status >= 500) {
      return {
        status: "degraded",
        message: `Passerelle IA en erreur (${resp.status}).`,
        latencyMs,
        providerKind: "lovable",
        checkedAt,
      };
    }
    return {
      status: "degraded",
      message: `Réponse inattendue (${resp.status}).`,
      latencyMs,
      providerKind: "lovable",
      checkedAt,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const isTimeout = msg.toLowerCase().includes("abort");
    return {
      status: "down",
      message: isTimeout ? "Délai dépassé (>4 s) sur la passerelle IA." : `IA inaccessible : ${msg}`,
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
    const value = await probeLovableGateway();
    cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  });

export const forceRefreshAiGatewayHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<AiHealthSnapshot> => {
    cache = null;
    const value = await probeLovableGateway();
    cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  });
