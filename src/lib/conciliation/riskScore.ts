// Score de priorisation de la conciliation médicamenteuse d'entrée
// Règles pondérées inspirées du modèle CHU Reims (Vallecillo et al., 2025)

import { classifyDci, HIGH_RISK_CLASSES, type AtcClassKey } from "./atcInteractions";

export interface RiskInput {
  age: number | null;
  via_urgences: boolean;
  nb_comorbidites: number;
  has_insuffisance_renale: boolean;
  has_insuffisance_hepatique: boolean;
  traitements_dci: string[];
}

export interface RiskBreakdown {
  variable: string;
  contribution: number;
  detail?: string;
}

export interface RiskResult {
  score: number;
  niveau: "faible" | "modere" | "eleve" | "critique";
  breakdown: RiskBreakdown[];
  nb_medicaments: number;
  classes_a_risque: AtcClassKey[];
}

export function computeRiskScore(input: RiskInput): RiskResult {
  const breakdown: RiskBreakdown[] = [];
  let score = 0;

  // Âge
  if (input.age != null) {
    if (input.age >= 75) {
      score += 20;
      breakdown.push({ variable: "Âge ≥ 75 ans", contribution: 20, detail: `${input.age} ans` });
    } else if (input.age >= 65) {
      score += 10;
      breakdown.push({ variable: "Âge 65-74 ans", contribution: 10, detail: `${input.age} ans` });
    }
  }

  // Polypharmacie
  const n = input.traitements_dci.length;
  if (n >= 10) {
    score += 25;
    breakdown.push({ variable: "Polypharmacie sévère (≥10)", contribution: 25, detail: `${n} médicaments` });
  } else if (n >= 5) {
    score += 15;
    breakdown.push({ variable: "Polypharmacie (≥5)", contribution: 15, detail: `${n} médicaments` });
  }

  // Classes à risque
  const classes = input.traitements_dci.map(classifyDci);
  const aRisque = Array.from(new Set(classes.filter((c) => HIGH_RISK_CLASSES.includes(c))));
  if (aRisque.length > 0) {
    const pts = Math.min(aRisque.length * 8, 30);
    score += pts;
    breakdown.push({
      variable: "Classes à marge étroite",
      contribution: pts,
      detail: aRisque.join(", "),
    });
  }

  // Comorbidités
  if (input.nb_comorbidites >= 3) {
    score += 10;
    breakdown.push({ variable: "≥ 3 comorbidités", contribution: 10, detail: `${input.nb_comorbidites}` });
  }
  if (input.has_insuffisance_renale) {
    score += 10;
    breakdown.push({ variable: "Insuffisance rénale", contribution: 10 });
  }
  if (input.has_insuffisance_hepatique) {
    score += 10;
    breakdown.push({ variable: "Insuffisance hépatique", contribution: 10 });
  }

  // Admission via urgences
  if (input.via_urgences) {
    score += 15;
    breakdown.push({ variable: "Admission via urgences", contribution: 15 });
  }

  score = Math.min(100, score);
  const niveau: RiskResult["niveau"] = score >= 70 ? "critique" : score >= 50 ? "eleve" : score >= 30 ? "modere" : "faible";

  return { score, niveau, breakdown, nb_medicaments: n, classes_a_risque: aRisque };
}

export const NIVEAU_LABEL: Record<RiskResult["niveau"], string> = {
  faible: "Faible",
  modere: "Modéré",
  eleve: "Élevé",
  critique: "Critique",
};
