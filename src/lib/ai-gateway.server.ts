import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const LOVABLE_AIG_RUN_ID_HEADER = "X-Lovable-AIG-Run-ID";

export function createLovableAiGatewayProvider(lovableApiKey: string, initialRunId?: string) {
  let runId = initialRunId?.trim() || undefined;
  let resolveRunId: (value: string | undefined) => void = () => {};
  let runIdResolved = false;
  const runIdReady = new Promise<string | undefined>((resolve) => {
    resolveRunId = resolve;
  });
  const publishRunId = (value?: string) => {
    const next = value?.trim() || undefined;
    if (!runId && next) runId = next;
    if (!runIdResolved) {
      runIdResolved = true;
      resolveRunId(runId);
    }
  };
  if (runId) publishRunId(runId);

  const provider = createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: {
      "Lovable-API-Key": lovableApiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
    fetch: async (input, init) => {
      const headers = new Headers(init?.headers);
      if (runId && !headers.has(LOVABLE_AIG_RUN_ID_HEADER)) {
        headers.set(LOVABLE_AIG_RUN_ID_HEADER, runId);
      }
      // Default reasoning effort: low (applies to /chat/completions JSON bodies).
      // Per-call override possible by setting reasoning_effort explicitly.
      let body = init?.body;
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const ct = headers.get("content-type") ?? "";
      if (
        body &&
        typeof body === "string" &&
        ct.includes("application/json") &&
        url.includes("/chat/completions")
      ) {
        try {
          const parsed = JSON.parse(body) as Record<string, unknown>;
          if (parsed && typeof parsed === "object" && parsed.reasoning_effort === undefined) {
            parsed.reasoning_effort = "low";
            body = JSON.stringify(parsed);
          }
        } catch {
          // leave body unchanged
        }
      }
      try {
        const response = await fetch(input, { ...init, headers, body });
        publishRunId(response.headers.get(LOVABLE_AIG_RUN_ID_HEADER) ?? undefined);
        return response;
      } catch (err) {
        publishRunId(undefined);
        throw err;
      }
    },
  });
  return Object.assign(provider, {
    getRunId: () => runId,
    waitForRunId: () => (runId ? Promise.resolve(runId) : runIdReady),
  });
}
