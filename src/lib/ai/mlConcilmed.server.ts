// Server-only client for the ML ConcilMed FastAPI microservice.
// Reads ML_CONCILMED_BASE_URL + ML_CONCILMED_API_KEY at call time (Worker env).

export type Layer2Input = {
  age?: number | null;
  sex?: string | null;
  nb_comorbidites?: number;
  has_insuffisance_renale?: boolean;
  has_insuffisance_hepatique?: boolean;
  nb_meds_hosp?: number;
  via_urgences?: boolean;
  duree_sejour?: number | null;
  service?: string | null;
  creatinine?: number | null;
  glucose?: number | null;
  hba1c?: number | null;
  kaliemie?: number | null;
  pa_sys?: number | null;
  pa_dia?: number | null;
  crp?: number | null;
};

export type Layer2Output = {
  score: number;
  label: number;
  model_version: string;
  model_kind: string;
};

export type Layer4Input = {
  norm_name: string;
  atc_class?: string | null;
  age?: number | null;
  nb_meds_hosp?: number;
  duree_sejour?: number | null;
  service?: string | null;
};

export type Layer4Output = {
  severity_score: number;
  is_severe: number;
  model_version: string;
};

function getConfig() {
  const baseUrl = process.env.ML_CONCILMED_BASE_URL;
  const apiKey = process.env.ML_CONCILMED_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error(
      "Microservice ML non configuré (ML_CONCILMED_BASE_URL / ML_CONCILMED_API_KEY manquants)",
    );
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}

async function callMl<TIn, TOut>(path: string, body: TIn): Promise<TOut> {
  const { baseUrl, apiKey } = getConfig();
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ML ${path} ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as TOut;
}

export const predictLayer2 = (input: Layer2Input) =>
  callMl<Layer2Input, Layer2Output>("/predict/layer2", input);

export const predictLayer4 = (input: Layer4Input) =>
  callMl<Layer4Input, Layer4Output>("/predict/layer4", input);

export const predictLayer4Batch = (items: Layer4Input[]) =>
  callMl<{ items: Layer4Input[] }, { results: Layer4Output[] }>(
    "/predict/layer4/batch",
    { items },
  );

export async function mlIsConfigured(): Promise<boolean> {
  try {
    getConfig();
    return true;
  } catch {
    return false;
  }
}

// Reads an ai_task execution_mode (llm | ml | both). Returns 'llm' if missing.
export async function getTaskExecutionMode(
  slug: string,
): Promise<"llm" | "ml" | "both"> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("ai_tasks")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .select("execution_mode" as any)
    .eq("slug", slug)
    .maybeSingle();
  const mode = (data as { execution_mode?: string } | null)?.execution_mode;
  if (mode === "ml" || mode === "both") return mode;
  return "llm";
}
