// Score de complexité patient + profil clinique IA + recommandations
// Pure utilitaire client — pas d'appel réseau.

export interface ComorbidityOption {
  key: string;
  label: string;
  weight: number;
  aliases?: string[];
}

export const COMORBIDITY_OPTIONS: ComorbidityOption[] = [
  { key: "HTA", label: "HTA", weight: 1, aliases: ["hypertension"] },
  { key: "DT2", label: "Diabète type 2", weight: 2, aliases: ["diabete", "dt2", "diabète"] },
  { key: "IRC", label: "Insuffisance rénale chronique", weight: 3, aliases: ["insuffisance renale", "irc"] },
  { key: "OBESITE", label: "Obésité", weight: 1, aliases: ["obesite", "imc>30"] },
  { key: "FA", label: "Fibrillation auriculaire", weight: 3, aliases: ["fibrillation", "acfa", "fa"] },
  { key: "IC", label: "Insuffisance cardiaque", weight: 3, aliases: ["insuffisance cardiaque", "ic"] },
  { key: "DYSLIP", label: "Dyslipidémie", weight: 0, aliases: ["dyslipidemie", "cholesterol"] },
  { key: "CORO", label: "Coronaropathie", weight: 2, aliases: ["coronaropathie", "infarctus", "syndrome coronarien"] },
  { key: "AVC", label: "AVC / AIT", weight: 2, aliases: ["avc", "ait", "accident vasculaire"] },
  { key: "BPCO", label: "BPCO", weight: 0, aliases: ["bpco", "bronchopneumopathie"] },
  { key: "CANCER", label: "Cancer", weight: 0, aliases: ["cancer", "neoplasie", "tumeur"] },
  { key: "ALLERGIE_MED", label: "Allergie médicamenteuse", weight: 0, aliases: ["allergie"] },
  { key: "AUTRE", label: "Autre", weight: 0 },
];

export type ComplexityLevel = "faible" | "modere" | "eleve";

export const COMPLEXITY_LABEL: Record<ComplexityLevel, string> = {
  faible: "Faible",
  modere: "Modéré",
  eleve: "Élevé",
};

export interface ComplexityResult {
  score: number;
  niveau: ComplexityLevel;
  detail: { label: string; weight: number }[];
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function matchOption(label: string): ComorbidityOption | null {
  const n = normalize(label);
  for (const opt of COMORBIDITY_OPTIONS) {
    const candidates = [opt.label, ...(opt.aliases ?? [])].map(normalize);
    if (candidates.some((c) => n.includes(c) || c.includes(n))) return opt;
  }
  return null;
}

export function computeComplexity(labels: string[]): ComplexityResult {
  const matched = new Map<string, number>();
  for (const raw of labels) {
    if (!raw) continue;
    const opt = matchOption(raw);
    if (opt && opt.weight > 0 && !matched.has(opt.label)) {
      matched.set(opt.label, opt.weight);
    }
  }
  const score = Array.from(matched.values()).reduce((a, b) => a + b, 0);
  const niveau: ComplexityLevel = score >= 7 ? "eleve" : score >= 4 ? "modere" : "faible";
  return {
    score,
    niveau,
    detail: Array.from(matched, ([label, weight]) => ({ label, weight })),
  };
}

export interface ClinicalProfile {
  profile: string;
  vigilance: string[];
}

export function generateClinicalProfile(labels: string[]): ClinicalProfile {
  const set = labels.map(normalize);
  const has = (kw: string) => set.some((s) => s.includes(kw));

  const vigilance: string[] = [];
  if (has("hta") || has("hypertension") || has("coronar") || has("infarctus") || has("avc") || has("ait") || has("fibrillation") || has("insuffisance cardiaque")) {
    vigilance.push("Risque cardiovasculaire élevé");
  }
  if (has("diabete") || has("obesite") || has("dyslipid")) {
    vigilance.push("Risque métabolique élevé");
  }
  if (has("insuffisance renale")) {
    vigilance.push("Nécessité de vérifier les adaptations posologiques rénales");
  }
  if (has("diabete")) {
    vigilance.push("Vigilance sur les traitements antidiabétiques (risque d'hypoglycémie)");
  }
  if (has("fibrillation") || has("avc") || has("ait")) {
    vigilance.push("Vigilance anticoagulation (CHA₂DS₂-VASc, équilibre INR / DOAC)");
  }
  if (has("bpco")) {
    vigilance.push("Éviter les bêtabloquants non cardio-sélectifs, surveiller les inhalés");
  }
  if (has("allergie")) {
    vigilance.push("⚠ Allergie médicamenteuse documentée — vérifier toute nouvelle prescription");
  }

  const profile = labels.length
    ? `Patient présentant : ${labels.join(", ")}.`
    : "Aucune comorbidité renseignée.";

  return { profile, vigilance };
}

// Classification de la gravité d'une divergence en fonction de la classe ATC
const CRITICAL_CLASSES = new Set(["anticoagulant", "insuline", "antiepileptique"]);
const MODERATE_CLASSES = new Set([
  "antiagregant",
  "antidiabetique",
  "iec_ara2",
  "betabloquant",
  "antiarythmique",
  "diuretique",
  "levothyroxine",
  "antipsychotique",
  "antidepresseur",
  "opioide",
]);

export type Gravite = "mineur" | "modere" | "majeur" | "critique";

export function classifyDivergenceGravite(dciClass: string, type: string): Gravite {
  if (type === "aucune") return "mineur";
  if (CRITICAL_CLASSES.has(dciClass)) return "critique";
  if (MODERATE_CLASSES.has(dciClass)) return "modere";
  return "mineur";
}

export const GRAVITE_LABEL: Record<Gravite, string> = {
  mineur: "Mineure",
  modere: "Modérée",
  majeur: "Majeure",
  critique: "Critique",
};

export const GRAVITE_COLOR: Record<Gravite, string> = {
  mineur: "bg-slate-100 text-slate-700 border-slate-200",
  modere: "bg-amber-100 text-amber-800 border-amber-200",
  majeur: "bg-orange-100 text-orange-800 border-orange-200",
  critique: "bg-red-100 text-red-800 border-red-200",
};

export interface DivergenceInfo {
  dci: string;
  classe?: string;
  type?: string;
}

export function generateRecommendations(opts: {
  comorbidities: string[];
  divergences: DivergenceInfo[];
}): string[] {
  const recs: string[] = [];
  const set = opts.comorbidities.map(normalize);
  const has = (k: string) => set.some((s) => s.includes(k));

  if (has("insuffisance renale")) {
    recs.push("Vérifier l'adaptation posologique des médicaments éliminés par voie rénale (DFG).");
  }
  if (has("diabete")) {
    recs.push("Vérifier la cohérence du traitement antidiabétique (couverture, hypoglycémie).");
  }
  if (has("fibrillation") || has("avc") || has("ait")) {
    recs.push("Vérifier la couverture anticoagulante (indication, dose, fonction rénale).");
  }
  if (has("insuffisance cardiaque")) {
    recs.push("Réévaluer le traitement de l'insuffisance cardiaque (IEC/ARA II, bêtabloquant, diurétique).");
  }
  if (has("bpco")) {
    recs.push("Vérifier la couverture bronchodilatatrice et l'absence de bêtabloquant non sélectif.");
  }

  for (const d of opts.divergences) {
    if (d.type && d.type !== "omission") continue;
    if (d.classe === "anticoagulant") {
      recs.push(`Divergence critique : anticoagulant absent (${d.dci}). Validation médicale urgente recommandée.`);
    } else if (d.classe === "insuline") {
      recs.push(`Divergence critique : insuline absente (${d.dci}). Validation médicale urgente.`);
    } else if (d.classe === "antiepileptique") {
      recs.push(`Divergence critique : antiépileptique absent (${d.dci}). Risque de récidive convulsive.`);
    } else if (d.classe === "iec_ara2" || d.classe === "betabloquant" || d.classe === "diuretique") {
      recs.push(`Divergence modérée : antihypertenseur absent (${d.dci}). À confirmer avec le prescripteur.`);
    }
  }
  return Array.from(new Set(recs));
}
