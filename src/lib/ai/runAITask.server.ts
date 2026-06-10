// Server-only. Resolves an AI task config from DB, builds a model provider,
// and exposes a thin wrapper around `generateText` from the AI SDK.
// Falls back to inline defaults when DB has no row for the slug.

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAzure } from "@ai-sdk/azure";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import type { LanguageModel } from "ai";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

export type ProviderKind =
  | "lovable"
  | "openai"
  | "azure_openai"
  | "google"
  | "anthropic"
  | "openai_compatible";

export interface AITaskFallback {
  systemPrompt: string;
  model?: string;
  providerKind?: ProviderKind;
}

interface ResolvedTask {
  systemPrompt: string;
  model: LanguageModel;
  modelId: string;
  providerKind: ProviderKind;
  temperature?: number;
  maxTokens?: number;
}

function decryptApiKey(ciphertext: Uint8Array | string | null): string | null {
  if (!ciphertext) return null;
  // Decrypted by Postgres-side RPC; here we expect already-decrypted text.
  return typeof ciphertext === "string" ? ciphertext : null;
}

async function loadTask(slug: string) {
  const { data, error } = await supabaseAdmin
    .from("ai_tasks")
    .select(
      "slug, model, system_prompt, temperature, max_tokens, provider:ai_providers(id, kind, base_url, extra_config, is_active, api_key_plain:api_key_encrypted)"
    )
    .eq("slug", slug)
    .maybeSingle();
  if (error) {
    console.warn(`[runAITask] DB error for slug=${slug}:`, error.message);
    return null;
  }
  return data;
}

// Decrypts an api key column via Postgres pgcrypto using the master key.
async function decryptProviderKey(providerId: string): Promise<string | null> {
  const masterKey = process.env.AI_PROVIDERS_ENCRYPTION_KEY;
  if (!masterKey) return null;
  const { data, error } = await supabaseAdmin.rpc("ai_provider_decrypt_key", {
    _provider_id: providerId,
    _master_key: masterKey,
  });
  if (error) {
    console.warn("[runAITask] decrypt error:", error.message);
    return null;
  }
  return (data as string | null) ?? null;
}

function buildModel(
  kind: ProviderKind,
  modelId: string,
  apiKey: string | null,
  baseUrl: string | null,
  extra: Record<string, unknown>,
): LanguageModel {
  switch (kind) {
    case "lovable": {
      const key = apiKey || process.env.LOVABLE_API_KEY;
      if (!key) throw new Error("LOVABLE_API_KEY manquante");
      const gw = createLovableAiGatewayProvider(key);
      return gw(modelId);
    }
    case "openai": {
      if (!apiKey) throw new Error("Clé OpenAI manquante");
      const p = createOpenAI({ apiKey, baseURL: baseUrl || undefined });
      return p(modelId);
    }
    case "azure_openai": {
      if (!apiKey) throw new Error("Clé Azure OpenAI manquante");
      const resourceName = (extra.resource_name as string | undefined) || undefined;
      const apiVersion = (extra.api_version as string | undefined) || undefined;
      const p = createAzure({
        apiKey,
        resourceName,
        apiVersion,
        baseURL: baseUrl || undefined,
      });
      // For Azure, modelId is the deployment name.
      return p(modelId);
    }
    case "google": {
      if (!apiKey) throw new Error("Clé Google AI manquante");
      const p = createGoogleGenerativeAI({ apiKey, baseURL: baseUrl || undefined });
      return p(modelId);
    }
    case "anthropic": {
      if (!apiKey) throw new Error("Clé Anthropic manquante");
      const p = createAnthropic({ apiKey, baseURL: baseUrl || undefined });
      return p(modelId);
    }
    case "openai_compatible": {
      if (!baseUrl) throw new Error("base_url requise pour openai_compatible");
      const p = createOpenAICompatible({
        name: (extra.name as string | undefined) || "custom",
        baseURL: baseUrl,
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
      });
      return p(modelId);
    }
  }
}

export async function resolveAITask(
  slug: string,
  fallback: AITaskFallback,
): Promise<ResolvedTask> {
  const row = await loadTask(slug);
  const providerKind: ProviderKind =
    (row?.provider?.kind as ProviderKind) || fallback.providerKind || "lovable";
  const modelId = row?.model || fallback.model || "google/gemini-3-flash-preview";
  const systemPrompt =
    row?.system_prompt && row.system_prompt.trim().length > 0
      ? row.system_prompt
      : fallback.systemPrompt;

  let apiKey: string | null = null;
  if (row?.provider?.id) {
    apiKey = await decryptProviderKey(row.provider.id as string);
  }
  // Lovable provider: always allow env fallback
  if (!apiKey && providerKind === "lovable") {
    apiKey = process.env.LOVABLE_API_KEY ?? null;
  }

  const model = buildModel(
    providerKind,
    modelId,
    apiKey,
    (row?.provider?.base_url as string | null) ?? null,
    (row?.provider?.extra_config as Record<string, unknown> | undefined) ?? {},
  );

  return {
    systemPrompt,
    model,
    modelId,
    providerKind,
    temperature: (row?.temperature as number | null) ?? undefined,
    maxTokens: (row?.max_tokens as number | null) ?? undefined,
  };
}

export async function runAITask(
  slug: string,
  args: { prompt: string; fallback: AITaskFallback },
) {
  const resolved = await resolveAITask(slug, args.fallback);
  try {
    const result = await generateText({
      model: resolved.model,
      system: resolved.systemPrompt,
      prompt: args.prompt,
      temperature: resolved.temperature,
      // maxTokens supported via providerOptions in newer SDK; omit for compat
    });
    return { text: result.text, modelId: resolved.modelId, providerKind: resolved.providerKind };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("429")) throw new Error("Limite IA atteinte, réessayez dans quelques instants.");
    if (msg.includes("402")) throw new Error("Crédits IA épuisés. Ajoutez des crédits dans les paramètres de l'espace.");
    throw e;
  }
}

// Re-export decrypt helper for admin "test" endpoint usage
export { decryptProviderKey, decryptApiKey };
