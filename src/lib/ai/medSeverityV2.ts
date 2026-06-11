// V2 medication severity lookup, calibrated on lots 1/2/divergences/4 from the
// "livrable_concilmed" deliverable (ConcilMed_Etage2_Etage4.ipynb).
// Per normalized medicine name, share of omissions classified gravité 3.
import data from "./medSeverityV2.data.json";

type MedRow = [count: number, severity: number];
type Artifact = {
  version: string;
  base_severity_rate: number;
  min_count: number;
  meds: Record<string, MedRow>;
};

const ARTIFACT = data as unknown as Artifact;

// Same normalization as the V2 notebook (norm_name).
const UNIT = /(mg\/kg\/j|mg\/kg|mcg\/kg|mg\/j|g\/j|mcg|µg|ug|mg|g|ml|ui|u\/ml|%|‰)/gi;
const DOSE = new RegExp(String.raw`(\d+(?:[.,]\d+)?)\s*` + UNIT.source, "gi");
const DROP = new Set([
  "ns","iv","sc","po","inh","im","ivl","iv/sc","ivsc","lp",
  "nebulise","cp","gel","gelule","comprime","sol",
]);

export function normMedName(text: string | null | undefined): string {
  if (!text) return "";
  let s = String(text).replace(/^\s*rp\s*\d*\s*[.\-:]?\s*/i, "");
  s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  s = s.replace(DOSE, " ").replace(/\d+(?:[.,]\d+)?/g, " ").replace(/[^\w\s/]/g, " ");
  return s
    .split(/\s+/)
    .map((t) => t.replace(/^\/|\/$/g, ""))
    .filter((t) => t && !DROP.has(t))
    .join(" ")
    .trim();
}

export type MedSeverityHit = {
  matched: string;
  severity: number;
  count: number;
};

export function lookupMedSeverity(name: string): MedSeverityHit | null {
  const nn = normMedName(name);
  if (!nn) return null;
  const hit = ARTIFACT.meds[nn];
  if (hit) return { matched: nn, severity: hit[1], count: hit[0] };
  // Token fallback: try each whitespace-separated token (handles "insuline asparte" ↔ "insuline").
  for (const tok of nn.split(" ")) {
    const t = ARTIFACT.meds[tok];
    if (t) return { matched: tok, severity: t[1], count: t[0] };
  }
  // Substring fallback for ATC-style prefixes (insuline glargine vs insuline glargine ml).
  for (const key of Object.keys(ARTIFACT.meds)) {
    if (nn.startsWith(key) || key.startsWith(nn)) {
      const t = ARTIFACT.meds[key];
      return { matched: key, severity: t[1], count: t[0] };
    }
  }
  return null;
}

export const MED_SEVERITY_VERSION = ARTIFACT.version;
export const MED_SEVERITY_BASE_RATE = ARTIFACT.base_severity_rate;
