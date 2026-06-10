// Catalogue des modèles LLM utilisables pour la conciliation cohorte.
// Le `providerName` doit correspondre à un row `ai_providers.name` côté DB,
// ou être "lovable" pour utiliser la passerelle Lovable AI sans provider DB.

export interface AvailableModel {
  /** Identifiant unique pour la sélection */
  key: string;
  /** Libellé affiché à l'utilisateur */
  label: string;
  /** Nom exact du provider en base (ai_providers.name) — ou "__lovable__" */
  providerName: string;
  /** modelId à passer au SDK (ex: "google/gemini-3-flash-preview", "claude-opus-4-8", "gpt-5.4") */
  modelId: string;
  /** Court descriptif optionnel */
  hint?: string;
}

export const LOVABLE_PROVIDER_KEY = "__lovable__";

export const AVAILABLE_MODELS: AvailableModel[] = [
  {
    key: "lovable-gemini-3-flash",
    label: "Gemini 3 Flash (Lovable)",
    providerName: LOVABLE_PROVIDER_KEY,
    modelId: "google/gemini-3-flash-preview",
    hint: "Par défaut — rapide, multimodal",
  },
  {
    key: "lovable-gpt-5",
    label: "GPT-5 (Lovable)",
    providerName: LOVABLE_PROVIDER_KEY,
    modelId: "openai/gpt-5",
    hint: "Modèle généraliste fort",
  },
  {
    key: "azure-foundry-claude-opus-4-8",
    label: "Claude Opus 4.8 (Azure Foundry)",
    providerName: "Azure Foundry — Anthropic",
    modelId: "claude-opus-4-8",
    hint: "Endpoint Anthropic interne",
  },
  {
    key: "azure-foundry-gpt-5-4",
    label: "GPT-5.4 (Azure Foundry)",
    providerName: "Azure Foundry — OpenAI Responses",
    modelId: "gpt-5.4",
    hint: "Endpoint OpenAI Responses interne",
  },
  {
    key: "azure-foundry-gpt-5-nano",
    label: "GPT-5 Nano (Azure Foundry)",
    providerName: "Azure Foundry — OpenAI Responses",
    modelId: "gpt-5-nano",
    hint: "Endpoint OpenAI Responses interne — économique",
  },
];

export function findModelByKey(key: string): AvailableModel | undefined {
  return AVAILABLE_MODELS.find((m) => m.key === key);
}
