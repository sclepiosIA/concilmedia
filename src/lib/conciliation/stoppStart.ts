// Sélection des critères STOPP/START (gériatrie ≥ 65 ans) — version simplifiée pour prototype
import type { AtcClassKey } from "./atcInteractions";

export interface StoppRule {
  id: string;
  label: string;
  appliesClass: AtcClassKey;
  // déclencheur supplémentaire optionnel
  minAge?: number;
  comorbiditeKeywords?: string[];
  gravite: "modere" | "majeur" | "critique";
}

export const STOPP_RULES: StoppRule[] = [
  { id: "STOPP-A1", label: "Benzodiazépines à demi-vie longue chez ≥ 65 ans (chutes)", appliesClass: "benzodiazepine", minAge: 65, gravite: "majeur" },
  { id: "STOPP-B1", label: "AINS chez patient avec insuffisance rénale", appliesClass: "ains", comorbiditeKeywords: ["renal", "rein", "ckd", "ir chronique", "dfg"], gravite: "majeur" },
  { id: "STOPP-B2", label: "AINS chez patient anticoagulé", appliesClass: "ains", gravite: "majeur" },
  { id: "STOPP-C1", label: "Bêtabloquant non sélectif chez asthmatique", appliesClass: "betabloquant", comorbiditeKeywords: ["asthme", "bpco"], gravite: "majeur" },
  { id: "STOPP-D1", label: "Opioïde au long cours sans laxatif chez ≥ 65 ans", appliesClass: "opioide", minAge: 65, gravite: "modere" },
  { id: "STOPP-E1", label: "IPP au long cours sans indication claire (> 8 semaines)", appliesClass: "ipp", gravite: "modere" },
  { id: "STOPP-F1", label: "Antipsychotique chez patient dément (sur-mortalité)", appliesClass: "antipsychotique", comorbiditeKeywords: ["alzheimer", "dement", "trouble cognitif"], gravite: "critique" },
];

export function evaluateStoppForDci(
  dci: string,
  classe: AtcClassKey,
  age: number | null,
  comorbidites: string[],
  coTraitements: AtcClassKey[],
): StoppRule[] {
  const triggered: StoppRule[] = [];
  const comoLc = comorbidites.map((c) => c.toLowerCase());
  for (const rule of STOPP_RULES) {
    if (rule.appliesClass !== classe) continue;
    if (rule.minAge && (age ?? 0) < rule.minAge) continue;
    if (rule.comorbiditeKeywords && !rule.comorbiditeKeywords.some((k) => comoLc.some((c) => c.includes(k)))) continue;
    // règle B2 : AINS + anticoagulant
    if (rule.id === "STOPP-B2" && !coTraitements.includes("anticoagulant")) continue;
    triggered.push(rule);
  }
  return triggered;
}
