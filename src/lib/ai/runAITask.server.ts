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
      const variant = (extra.variant as string | undefined) || undefined;

      // Variante: Azure Foundry — /openai/v1/responses (Responses API).
      if (variant === "azure_foundry_responses") {
        const trimmed = (baseUrl as string).replace(/\/+$/, "");
        // OpenAI Responses API via Azure Foundry. Path: /openai/v1/responses
        // On utilise createOpenAI puis .responses(modelId).
        const p = createOpenAI({
          apiKey,
          baseURL: `${trimmed}/openai/v1`,
          headers: { "api-key": apiKey },
        });
        // .responses() = Responses API (sinon chat.completions par défaut)
        return p.responses(modelId);
      }

      // Azure AI Foundry (services.ai.azure.com) — OpenAI-compatible endpoint legacy
      if (isAzureFoundryUrl(baseUrl)) {
        const trimmed = (baseUrl as string).replace(/\/+$/, "");
        const p = createOpenAICompatible({
          name: "azure-foundry",
          baseURL: `${trimmed}/openai/v1`,
          headers: {
            "api-key": apiKey,
            "Authorization": `Bearer ${apiKey}`,
          },
        });
        return p(modelId);
      }

      // Classic Azure OpenAI (*.openai.azure.com)
      const resourceName = (extra.resource_name as string | undefined) || undefined;
      const p = createAzure({
        apiKey,
        resourceName,
        apiVersion,
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
      const variant = (extra.variant as string | undefined) || undefined;

      // Variante: Azure Foundry — /anthropic/v1/messages
      if (variant === "azure_foundry_anthropic") {
        const trimmed = (baseUrl as string).replace(/\/+$/, "");
        const p = createAnthropic({
          apiKey,
          baseURL: trimmed, // SDK appendra /v1/messages
          headers: { "api-key": apiKey },
        });
        return p(modelId);
      }

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
  verbosity?: "low" | "medium" | "high";
}): Record<string, unknown> {
  const { modelId, providerKind, temperature, maxTokens, reasoningEffort, verbosity = "low" } = opts;
  const isGpt5 = isGpt5Family(modelId, providerKind);
  const out: Record<string, unknown> = {};

  // Temperature: GPT-5.x refuse toute valeur != 1 → on l'omet.
  if (!isGpt5 && typeof temperature === "number") {
    out.temperature = temperature;
  }

  const providerKey =
    providerKind === "lovable"
      ? "lovable"
      : "openai";

  const gpt5Inner: Record<string, unknown> = {};
  if (isGpt5 && reasoningEffort) gpt5Inner.reasoningEffort = reasoningEffort;
  if (isGpt5 && verbosity) gpt5Inner.verbosity = verbosity;

  // Max tokens: AI SDK v5 normalise `maxOutputTokens` pour TOUS les providers
  // (openai, azure, google, anthropic, openai-compatible incl. gateway Lovable).
  // Pour GPT-5 direct (OpenAI ou Azure), il faut max_completion_tokens via providerOptions;
  // sinon on garde maxOutputTokens.
  if (typeof maxTokens === "number") {
    if (isGpt5) {
      // GPT-5 (direct OpenAI/Azure ou via gateway Lovable openai-compatible)
      // refuse `max_tokens` → on doit passer `max_completion_tokens` via providerOptions.
      out.providerOptions = { [providerKey]: { maxCompletionTokens: maxTokens, ...gpt5Inner } };
    } else {
      out.maxOutputTokens = maxTokens;
    }
  } else if (isGpt5 && Object.keys(gpt5Inner).length > 0) {
    out.providerOptions = { [providerKey]: gpt5Inner };
  }


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
    (taskExtra.reasoning_effort as "low" | "medium" | "high" | undefined) || "low";

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

/**
 * Résout une tâche IA en forçant un modèle/provider spécifique (depuis
 * `ai_providers.name` ou la passerelle Lovable). Sert au banc d'essai
 * multi-modèles : on bypass la config DB de la tâche pour réutiliser le même
 * system prompt mais piloter le modèle.
 */
export async function resolveAITaskWithOverride(
  fallback: AITaskFallback,
  override: { providerName: string; modelId: string },
): Promise<ResolvedTask> {
  const systemPrompt = fallback.systemPrompt;

  // Cas "Lovable" → utiliser la passerelle Lovable directement
  if (override.providerName === "__lovable__") {
    const apiKey = process.env.LOVABLE_API_KEY ?? null;
    if (!apiKey) throw new Error("LOVABLE_API_KEY manquante");
    const model = buildModel("lovable", override.modelId, apiKey, null, {});
    const callOptions = buildCallOptions({
      modelId: override.modelId,
      providerKind: "lovable",
    });
    return {
      systemPrompt,
      model,
      modelId: override.modelId,
      providerKind: "lovable",
      callOptions,
    };
  }

  // Sinon: lookup du provider par name
  const { data: provider, error } = await supabaseAdmin
    .from("ai_providers")
    .select("id, kind, base_url, extra_config, is_active")
    .eq("name", override.providerName)
    .maybeSingle();
  if (error) throw new Error(`Provider lookup failed: ${error.message}`);
  if (!provider) throw new Error(`Provider introuvable: ${override.providerName}`);
  if (!provider.is_active) throw new Error(`Provider inactif: ${override.providerName}`);

  const providerKind = provider.kind as ProviderKind;
  let apiKey: string | null = await decryptProviderKey(provider.id as string);
  if (!apiKey && providerKind === "azure_openai") {
    apiKey = process.env.AZURE_OPENAI_API_KEY ?? null;
  }
  if (!apiKey && providerKind === "anthropic") {
    // Azure Foundry — Anthropic réutilise la clé Azure
    const extra = (provider.extra_config as Record<string, unknown> | null) ?? {};
    if (extra.variant === "azure_foundry_anthropic") {
      apiKey = process.env.AZURE_OPENAI_API_KEY ?? null;
    }
  }
  if (!apiKey && providerKind === "lovable") {
    apiKey = process.env.LOVABLE_API_KEY ?? null;
  }

  const model = buildModel(
    providerKind,
    override.modelId,
    apiKey,
    (provider.base_url as string | null) ?? null,
    (provider.extra_config as Record<string, unknown> | null) ?? {},
  );

  const callOptions = buildCallOptions({
    modelId: override.modelId,
    providerKind,
  });

  return {
    systemPrompt,
    model,
    modelId: override.modelId,
    providerKind,
    callOptions,
  };
}

