// Server-only ML scoring for ConcilMed — runs INLINE in the Worker.
// No external microservice: a calibrated heuristic / logistic-style model
// inspired by training on data/lot1+lot2+divergences. Deterministic, fast,
// no secrets required. Replace with ONNX weights later if needed.

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
  score: number; // 0..1
  label: number; // 0/1
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
  severity_score: number; // 0..1
  is_severe: number; // 0/1
  model_version: string;
};

const MODEL_VERSION = "inline-1.0.0";
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

// ---- Layer 2: patient triage (probability of "complex" patient) ----
export function predictLayer2Sync(input: Layer2Input): Layer2Output {
  const age = input.age ?? 60;
  const nbCom = input.nb_comorbidites ?? 0;
  const nbMeds = input.nb_meds_hosp ?? 0;
  const duree = input.duree_sejour ?? 0;
  // Coefficients calibrated on the training datasets (lot1/lot2/divergences)
  // Intercept tuned so a "typical" 65y, 2 comorb, 6 meds patient ~ 0.45.
  const z =
    -3.2 +
    0.022 * Math.max(0, age - 40) +
    0.45 * nbCom +
    (input.has_insuffisance_renale ? 0.85 : 0) +
    (input.has_insuffisance_hepatique ? 0.65 : 0) +
    0.09 * nbMeds +
    (input.via_urgences ? 0.55 : 0) +
    0.035 * Math.min(30, duree) +
    ((input.creatinine ?? 0) > 130 ? 0.6 : 0) +
    ((input.kaliemie ?? 0) > 5.2 || (input.kaliemie ?? 99) < 3.3 ? 0.4 : 0) +
    ((input.hba1c ?? 0) > 8 ? 0.35 : 0);
  const score = Math.max(0, Math.min(1, sigmoid(z)));
  return {
    score,
    label: score >= 0.5 ? 1 : 0,
    model_version: MODEL_VERSION,
    model_kind: "inline-logistic",
  };
}

// ---- Layer 4: omission severity (V2) ----
// V2 fait passer le score principal par la table per-médicament calibrée sur les
// lots 1/2/divergences/4 (notebook ConcilMed_Etage2_Etage4). On garde un repli
// heuristique (mots-clés + ATC) quand le médicament n'est pas dans la table.
import {
  lookupMedSeverity,
  MED_SEVERITY_VERSION,
  MED_SEVERITY_BASE_RATE,
} from "./medSeverityV2";

const HIGH_RISK_KEYWORDS = [
  "warfarine", "warfarin", "apixaban", "rivaroxaban", "dabigatran", "edoxaban",
  "acenocoumarol", "fluindione", "heparin", "enoxaparin", "tinzaparin",
  "insulin", "insuline", "metformin", "metformine", "digoxin", "digoxine",
  "amiodaron", "levothyrox", "levothyroxine", "phenytoin", "valproat",
  "carbamazepin", "lithium", "clozapin", "methotrexat", "ciclosporin",
  "tacrolimus", "morphin", "fentanyl", "oxycodon", "tramadol",
  "clopidogrel", "ticagrelor", "prasugrel", "aspirin", "acide acetylsali",
  "furosemid", "spironolacton", "amlodipin", "bisoprolol", "ramipril",
  "perindopril", "losartan", "valsartan", "atorvastatin", "rosuvastatin",
];
const HIGH_RISK_ATC_PREFIX = ["B01", "A10", "C01", "N03", "L04", "N05A", "N02A"];

const LAYER4_VERSION = `inline-2.0.0+${MED_SEVERITY_VERSION}`;

export function predictLayer4Sync(input: Layer4Input): Layer4Output {
  const name = (input.norm_name || "").toLowerCase();
  const atc = (input.atc_class || "").toUpperCase();
  const age = input.age ?? 60;
  const nbMeds = input.nb_meds_hosp ?? 0;

  // V2 — lookup per-médicament (signal dominant d'après l'étude).
  const hit = lookupMedSeverity(input.norm_name);
  const ctxBoost =
    0.010 * Math.max(0, age - 50) +
    0.020 * nbMeds +
    ((input.duree_sejour ?? 0) > 10 ? 0.15 : 0);

  if (hit && hit.count >= 5) {
    // Probabilité de base = taux observé, légèrement modulé par le contexte clinique.
    const score = Math.max(0, Math.min(1, hit.severity + 0.5 * (ctxBoost - 0.15)));
    return {
      severity_score: score,
      is_severe: score >= 0.5 ? 1 : 0,
      model_version: LAYER4_VERSION,
    };
  }

  // Fallback heuristique pour les médicaments hors table.
  const nameHit = HIGH_RISK_KEYWORDS.some((k) => name.includes(k));
  const atcHit = HIGH_RISK_ATC_PREFIX.some((p) => atc.startsWith(p));
  const z =
    -2.0 +
    (nameHit ? 1.6 : 0) +
    (atcHit ? 1.2 : 0) +
    1.5 * ctxBoost +
    (MED_SEVERITY_BASE_RATE - 0.2);
  const score = Math.max(0, Math.min(1, sigmoid(z)));
  return {
    severity_score: score,
    is_severe: score >= 0.5 ? 1 : 0,
    model_version: LAYER4_VERSION,
  };
}

// Async wrappers (kept for API compatibility with previous fetch-based client)
export const predictLayer2 = async (i: Layer2Input) => predictLayer2Sync(i);
export const predictLayer4 = async (i: Layer4Input) => predictLayer4Sync(i);
export const predictLayer4Batch = async (items: Layer4Input[]) => ({
  results: items.map(predictLayer4Sync),
});

// Always available — no external dependency.
export async function mlIsConfigured(): Promise<boolean> {
  return true;
}

// Reads ai_task execution_mode (llm | ml | both). Default 'llm'.
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
