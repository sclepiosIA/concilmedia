// Score de priorisation patient (0-100) — utilisé pour trier les patients
// en file d'attente de conciliation médicamenteuse.
// Inspiré de computeRiskScore mais calculable côté client à partir
// des données patient (sans dépendre d'un épisode).

import { classifyDci, HIGH_RISK_CLASSES } from "./atcInteractions";

export type PriorityLevel = "faible" | "modere" | "eleve" | "critique";

export interface PriorityInput {
  age: number | null;
  nb_comorbidites: number;
  comorbidites_libelles: string[];
  nb_allergies_severes: number;
  traitements_dci: string[];
}

export interface PriorityResult {
  score: number;
  niveau: PriorityLevel;
  nb_medicaments: number;
  classes_a_risque: string[];
}

function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function computePatientPriority(input: PriorityInput): PriorityResult {
  let score = 0;

  if (input.age != null) {
    if (input.age >= 75) score += 20;
    else if (input.age >= 65) score += 10;
  }

  const n = input.traitements_dci.length;
  if (n >= 10) score += 25;
  else if (n >= 5) score += 15;

  const classes = input.traitements_dci.map(classifyDci);
  const aRisque = Array.from(new Set(classes.filter((c) => HIGH_RISK_CLASSES.includes(c))));
  if (aRisque.length > 0) score += Math.min(aRisque.length * 8, 30);

  if (input.nb_comorbidites >= 3) score += 10;

  const comor = input.comorbidites_libelles.map(normalize);
  if (comor.some((c) => /renal|rein|irc|dfg/.test(c))) score += 10;
  if (comor.some((c) => /hepat|cirrhos|foie/.test(c))) score += 10;

  if (input.nb_allergies_severes > 0) score += 5;

  score = Math.min(100, score);
  const niveau: PriorityLevel =
    score >= 70 ? "critique" : score >= 50 ? "eleve" : score >= 30 ? "modere" : "faible";

  return { score, niveau, nb_medicaments: n, classes_a_risque: aRisque };
}

export const PRIORITY_LABEL: Record<PriorityLevel, string> = {
  faible: "Faible",
  modere: "Modérée",
  eleve: "Élevée",
  critique: "Critique",
};

export const PRIORITY_COLORS: Record<PriorityLevel, string> = {
  faible: "bg-green-100 text-green-800 border-green-200",
  modere: "bg-amber-100 text-amber-800 border-amber-200",
  eleve: "bg-orange-100 text-orange-800 border-orange-200",
  critique: "bg-red-100 text-red-800 border-red-200",
};
