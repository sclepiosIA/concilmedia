// Piste #15 — Métriques pures pour le banc d'essai LLM.
// Helpers déterministes testables, aucun appel externe.

export interface MetricResult {
  score: number; // 0..1
  breakdown: Record<string, number>;
  notes?: string[];
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

interface DniItem {
  medicament: string;
  type_divergence?: string;
}

function dniKey(d: DniItem): string {
  return `${normalize(d.medicament)}::${normalize(d.type_divergence ?? "")}`;
}

/**
 * Score un ensemble de DNI. Compare l'output (liste DNI) à expected via
 * précision / rappel / F1 sur la clé `medicament+type_divergence` normalisée.
 */
export function scoreDniSet(
  expected: DniItem[],
  output: DniItem[],
): MetricResult {
  const exp = new Set(expected.map(dniKey));
  const out = new Set(output.map(dniKey));
  let tp = 0;
  for (const k of out) if (exp.has(k)) tp += 1;
  const fp = out.size - tp;
  const fn = exp.size - tp;
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return {
    score: f1,
    breakdown: { precision, recall, f1, tp, fp, fn, expected: exp.size, output: out.size },
  };
}

/**
 * BMO: compare deux listes de médicaments (nom + posologie + voie) par F1
 * sur la clé normalisée nom+voie, avec pénalité posologique.
 */
interface BmoItem {
  medicament: string;
  posologie?: string;
  voie?: string;
}

export function scoreBmo(expected: BmoItem[], output: BmoItem[]): MetricResult {
  const keyOf = (b: BmoItem) => `${normalize(b.medicament)}::${normalize(b.voie ?? "")}`;
  const expMap = new Map(expected.map((b) => [keyOf(b), b]));
  const outMap = new Map(output.map((b) => [keyOf(b), b]));
  let tp = 0;
  let posoMatch = 0;
  for (const [k, b] of outMap) {
    const e = expMap.get(k);
    if (e) {
      tp += 1;
      if (normalize(e.posologie ?? "") === normalize(b.posologie ?? "")) posoMatch += 1;
    }
  }
  const fp = outMap.size - tp;
  const fn = expMap.size - tp;
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  const posoRate = tp === 0 ? 0 : posoMatch / tp;
  // Score combiné : 70% F1 liste + 30% exactitude posologique sur matchs.
  const score = 0.7 * f1 + 0.3 * posoRate;
  return {
    score,
    breakdown: { precision, recall, f1, posology_rate: posoRate, tp, fp, fn },
  };
}

/**
 * Score lettre de liaison : couverture de tokens-clés via LCS simplifié.
 */
export function scoreLetter(expectedText: string, outputText: string): MetricResult {
  const expTokens = normalize(expectedText).split(" ").filter(Boolean);
  const outTokens = normalize(outputText).split(" ").filter(Boolean);
  if (expTokens.length === 0) return { score: 1, breakdown: { lcs: 0, len_expected: 0 } };
  // LCS DP — borné à 1000 tokens chacun pour rester < 10ms.
  const a = expTokens.slice(0, 1000);
  const b = outTokens.slice(0, 1000);
  const m = a.length;
  const n = b.length;
  const dp = new Uint16Array((m + 1) * (n + 1));
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const idx = i * (n + 1) + j;
      dp[idx] =
        a[i - 1] === b[j - 1]
          ? dp[(i - 1) * (n + 1) + (j - 1)] + 1
          : Math.max(dp[(i - 1) * (n + 1) + j], dp[i * (n + 1) + (j - 1)]);
    }
  }
  const lcs = dp[m * (n + 1) + n];
  const precision = n === 0 ? 0 : lcs / n;
  const recall = m === 0 ? 0 : lcs / m;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { score: f1, breakdown: { lcs, precision, recall, f1, len_expected: m, len_output: n } };
}

export function aggregate(metrics: number[]): { mean: number; p50: number; p95: number } {
  if (metrics.length === 0) return { mean: 0, p50: 0, p95: 0 };
  const sorted = [...metrics].sort((a, b) => a - b);
  const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return { mean, p50: at(0.5), p95: at(0.95) };
}
