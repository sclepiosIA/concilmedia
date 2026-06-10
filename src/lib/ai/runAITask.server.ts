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

export interface ResolvedTask {
  systemPrompt: string;
  model: LanguageModel;
  modelId: string;
  providerKind: ProviderKind;
  temperature?: number;
  maxTokens?: number;
  reasoningEffort?: "low" | "medium" | "high";
  /**
   * Ready-to-spread options to pass to `generateText({...callOptions, model, ...})`.
   * Adapts to model family: GPT-5.x omits temperature and routes max tokens through
   * providerOptions (max_completion_tokens + reasoning_effort).
   */
  callOptions: Record<string, unknown>;
}

function decryptApiKey(ciphertext: Uint8Array | string | null): string | null {
  if (!ciphertext) return null;
  return typeof ciphertext === "string" ? ciphertext : null;
}

async function loadTask(slug: string) {
  const { data, error } = await supabaseAdmin
    .from("ai_tasks")
    .select(
      "slug, model, system_prompt, temperature, max_tokens, extra_config, provider:ai_providers(id, kind, base_url, extra_config, is_active)"
    )
    .eq("slug", slug)
    .maybeSingle();
  if (error) {
    console.warn(`[runAITask] DB error for slug=${slug}:`, error.message);
    return null;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return data as any;
}

async function decryptProviderKey(providerId: string): Promise<string | null> {
  const masterKey = process.env.AI_PROVIDERS_ENCRYPTION_KEY;
  if (!masterKey) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabaseAdmin.rpc as any)("ai_provider_decrypt_key", {
    _provider_id: providerId,
    _master_key: masterKey,
  });
  if (error) {
    console.warn("[runAITask] decrypt error:", error.message);
    return null;
  }
  return (data as string | null) ?? null;
}

/**
 * Detect GPT-5 family (OpenAI direct, via Lovable gateway `openai/gpt-5*`,
 * or as an Azure deployment name containing `gpt-5`).
 */
export function isGpt5Family(modelId: string, _providerKind: ProviderKind): boolean {
  const id = modelId.toLowerCase();
  return /(^|\/)gpt-5(\.|-|$)/.test(id) || id.includes("gpt-5");
}

function isAzureFoundryUrl(baseUrl: string | null | undefined): boolean {
  if (!baseUrl) return false;
  return /services\.ai\.azure\.com/i.test(baseUrl);
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
      const apiVersion = (extra.api_version as string | undefined) || "2024-10-21";

      // Azure AI Foundry (services.ai.azure.com) — use OpenAI-compatible endpoint
      // shape: <baseUrl>/openai/deployments/<deployment>/chat/completions?api-version=...
      if (isAzureFoundryUrl(baseUrl)) {
        const trimmed = (baseUrl as string).replace(/\/+$/, "");
        const p = createOpenAICompatible({
          name: "azure-foundry",
          baseURL: `${trimmed}/openai/v1`,
          headers: {
            "api-key": apiKey,
            "Authorization": `Bearer ${apiKey}`,
          },
          queryParams: { "api-version": apiVersion },
        });
        return p(modelId);
      }

      // Classic Azure OpenAI (*.openai.azure.com)
      const resourceName = (extra.resource_name as string | undefined) || undefined;
      const p = createAzure({
        apiKey,
        resourceName,
        apiVersion,
        // Only pass baseURL if no resourceName, to avoid double-config.
        baseURL: !resourceName && baseUrl ? baseUrl : undefined,
      });
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

/**
 * Build per-call options tailored to the model family / provider.
 * Spread the returned object into your `generateText({...})` call.
 */
export function buildCallOptions(opts: {
  modelId: string;
  providerKind: ProviderKind;
  temperature?: number;
  maxTokens?: number;
  reasoningEffort?: "low" | "medium" | "high";
}): Record<string, unknown> {
  const { modelId, providerKind, temperature, maxTokens, reasoningEffort } = opts;

  if (isGpt5Family(modelId, providerKind)) {
    // GPT-5.x: no temperature, use max_completion_tokens via providerOptions,
    // optional reasoning_effort.
    const providerKey =
      providerKind === "azure_openai" ? "azure" : "openai";
    const inner: Record<string, unknown> = {};
    if (typeof maxTokens === "number") inner.maxCompletionTokens = maxTokens;
    if (reasoningEffort) inner.reasoningEffort = reasoningEffort;
    return Object.keys(inner).length > 0
      ? { providerOptions: { [providerKey]: inner } }
      : {};
  }

  // Default: Gemini / Claude / GPT-4o-family / openai-compatible
  const out: Record<string, unknown> = {};
  if (typeof temperature === "number") out.temperature = temperature;
  if (typeof maxTokens === "number") out.maxOutputTokens = maxTokens;
  return out;
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
  if (!apiKey && providerKind === "lovable") {
    apiKey = process.env.LOVABLE_API_KEY ?? null;
  }
  // Azure: fallback to AZURE_OPENAI_API_KEY env if no encrypted key stored.
  if (!apiKey && providerKind === "azure_openai") {
    apiKey = process.env.AZURE_OPENAI_API_KEY ?? null;
  }

  const model = buildModel(
    providerKind,
    modelId,
    apiKey,
    (row?.provider?.base_url as string | null) ?? null,
    (row?.provider?.extra_config as Record<string, unknown> | undefined) ?? {},
  );

  const temperature = (row?.temperature as number | null) ?? undefined;
  const maxTokens = (row?.max_tokens as number | null) ?? undefined;
  const taskExtra = (row?.extra_config as Record<string, unknown> | undefined) ?? {};
  const reasoningEffort =
    (taskExtra.reasoning_effort as "low" | "medium" | "high" | undefined) || undefined;

  const callOptions = buildCallOptions({
    modelId,
    providerKind,
    temperature,
    maxTokens,
    reasoningEffort,
  });

  return {
    systemPrompt,
    model,
    modelId,
    providerKind,
    temperature,
    maxTokens,
    reasoningEffort,
    callOptions,
  };
}

export async function runAITask(
  slug: string,
  args: { prompt: string; fallback: AITaskFallback },
) {
  const resolved = await resolveAITask(slug, args.fallback);
  try {
    const result = await generateText({
      ...resolved.callOptions,
      model: resolved.model,
      system: resolved.systemPrompt,
      prompt: args.prompt,
    });
    return { text: result.text, modelId: resolved.modelId, providerKind: resolved.providerKind };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("429")) throw new Error("Limite IA atteinte, réessayez dans quelques instants.");
    if (msg.includes("402")) throw new Error("Crédits IA épuisés. Ajoutez des crédits dans les paramètres de l'espace.");
    throw e;
  }
}

export { decryptProviderKey, decryptApiKey };
