// Moteur déterministe de comparaison prescription hospitalière vs traitement domicile.
// Statuts : "vert" | "jaune" | "orange" | "rouge" | "gris" | "en_cours"
// - vert  : strictement identique au domicile
// - jaune : variation logique attendue (forme IV/PO, même classe)
// - orange: divergence sans motif détecté (à arbitrer par IA)
// - rouge : hors-AMM (dose journalière > seuil)
// - gris  : pas de domicile connu — IA fera l'évaluation

export type MatchStatus = "vert" | "jaune" | "orange" | "rouge" | "gris" | "en_cours";

export type MatchResult = {
  status: MatchStatus;
  reason: string;
  matchedDomicileId?: string;
  needsAI: boolean;
};

export type HospPrescription = {
  id?: string;
  medicament: string;
  nom_commercial?: string | null;
  dosage?: string | null;
  dosage_unite?: string | null;
  voie_administration?: string | null;
  posologie_matin?: string | null;
  posologie_midi?: string | null;
  posologie_soir?: string | null;
  posologie_coucher?: string | null;
  posologie?: string | null;
};

export type DomicileTraitement = {
  id: string;
  dci?: string | null;
  nom_commercial?: string | null;
  dosage?: string | null;
  dosage_unite?: string | null;
  voie_administration?: string | null;
  posologie_matin?: string | null;
  posologie_midi?: string | null;
  posologie_soir?: string | null;
  posologie_coucher?: string | null;
  posologie_texte?: string | null;
};

// Seuils dose journalière max (mg) — AMM courante adulte.
const MAX_DAILY_DOSE_MG: Record<string, number> = {
  paracetamol: 4000,
  ibuprofene: 1200,
  ibuprofen: 1200,
  aspirine: 4000,
  acetylsalicylique: 4000,
  tramadol: 400,
  morphine: 200,
  codeine: 240,
  diclofenac: 150,
  naproxene: 1000,
  warfarine: 15,
  apixaban: 10,
  rivaroxaban: 20,
  amoxicilline: 6000,
};

const ROUTES_PO = ["po", "per os", "orale", "voie orale", "oral"];
const ROUTES_IV = ["iv", "intraveineuse", "i.v.", "perfusion"];

function norm(s: string | null | undefined): string {
  return (s ?? "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function dciKey(p: { medicament?: string; dci?: string | null; nom_commercial?: string | null }): string {
  const raw = norm(p.dci ?? p.medicament ?? p.nom_commercial ?? "");
  // garde le premier mot significatif
  return raw.split(" ")[0];
}

function parseNumber(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = s.toString().replace(",", ".").match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}

function posologieKey(p: HospPrescription | DomicileTraitement): string {
  const m = (p.posologie_matin ?? "").toString().trim() || "0";
  const mi = (p.posologie_midi ?? "").toString().trim() || "0";
  const s = (p.posologie_soir ?? "").toString().trim() || "0";
  const c = (p.posologie_coucher ?? "").toString().trim() || "0";
  return `${m}|${mi}|${s}|${c}`;
}

function sumDaily(p: HospPrescription): number {
  const parts = [p.posologie_matin, p.posologie_midi, p.posologie_soir, p.posologie_coucher];
  let total = 0;
  for (const part of parts) {
    const n = parseNumber(part);
    if (n) total += n;
  }
  return total;
}

function routeFamily(r: string | null | undefined): "po" | "iv" | "other" | null {
  const n = norm(r);
  if (!n) return null;
  if (ROUTES_PO.some((x) => n.includes(x))) return "po";
  if (ROUTES_IV.some((x) => n.includes(x))) return "iv";
  return "other";
}

export function matchPrescription(
  hosp: HospPrescription,
  domicile: DomicileTraitement[],
): MatchResult {
  // 1) Vérif rouge : surdosage AMM (indépendant du domicile)
  const dci = dciKey({ medicament: hosp.medicament, nom_commercial: hosp.nom_commercial });
  const unitNorm = norm(hosp.dosage_unite);
  const dose = parseNumber(hosp.dosage);
  const max = MAX_DAILY_DOSE_MG[dci];
  if (max && dose && (unitNorm === "mg" || unitNorm === "")) {
    const nbPrises = sumDaily(hosp);
    if (nbPrises > 0) {
      const total = dose * nbPrises;
      if (total > max) {
        return {
          status: "rouge",
          reason: `Dose journalière ${total} mg > seuil AMM ${max} mg pour ${dci}`,
          needsAI: false,
        };
      }
    }
  }

  // 2) Recherche correspondance domicile
  if (!domicile || domicile.length === 0) {
    return {
      status: "gris",
      reason: "Aucun traitement domicile renseigné — analyse IA recommandée",
      needsAI: true,
    };
  }

  const match = domicile.find((d) => dciKey(d) && dciKey(d) === dci);

  if (!match) {
    return {
      status: "orange",
      reason: `${hosp.medicament} absent du traitement domicile`,
      needsAI: true,
    };
  }

  // 3) Vérification stricte → vert
  const sameDose =
    norm(hosp.dosage) === norm(match.dosage) &&
    norm(hosp.dosage_unite) === norm(match.dosage_unite);
  const samePoso = posologieKey(hosp) === posologieKey(match);
  const sameRoute = routeFamily(hosp.voie_administration) === routeFamily(match.voie_administration);

  if (sameDose && samePoso && sameRoute) {
    return {
      status: "vert",
      reason: "Identique à l'ordonnance initiale",
      matchedDomicileId: match.id,
      needsAI: false,
    };
  }

  // 4) Switch de voie connu (IV ↔ PO) → jaune (souvent voulu en hospit)
  const rh = routeFamily(hosp.voie_administration);
  const rd = routeFamily(match.voie_administration);
  if (rh && rd && rh !== rd && ((rh === "iv" && rd === "po") || (rh === "po" && rd === "iv"))) {
    return {
      status: "jaune",
      reason: `Changement de voie (${rd?.toUpperCase()} → ${rh?.toUpperCase()}) — fréquent en hospitalisation`,
      matchedDomicileId: match.id,
      needsAI: true,
    };
  }

  // 5) Divergence dose/posologie → orange (IA arbitrera)
  const reasons: string[] = [];
  if (!sameDose) reasons.push(`dose ${match.dosage ?? "?"}${match.dosage_unite ?? ""} → ${hosp.dosage ?? "?"}${hosp.dosage_unite ?? ""}`);
  if (!samePoso) reasons.push(`posologie ${posologieKey(match)} → ${posologieKey(hosp)}`);

  return {
    status: "orange",
    reason: reasons.join(" · ") || "Divergence par rapport au domicile",
    matchedDomicileId: match.id,
    needsAI: true,
  };
}

export const STATUS_META: Record<MatchStatus, { label: string; bg: string; border: string; text: string; dot: string }> = {
  vert: {
    label: "Conforme à l'ordonnance initiale",
    bg: "bg-green-50 dark:bg-green-950/30",
    border: "border-l-4 border-l-green-500",
    text: "text-green-700 dark:text-green-300",
    dot: "bg-green-500",
  },
  jaune: {
    label: "Adaptation logique",
    bg: "bg-yellow-50 dark:bg-yellow-950/30",
    border: "border-l-4 border-l-yellow-500",
    text: "text-yellow-700 dark:text-yellow-300",
    dot: "bg-yellow-500",
  },
  orange: {
    label: "Divergence probablement non souhaitée",
    bg: "bg-orange-50 dark:bg-orange-950/30",
    border: "border-l-4 border-l-orange-500",
    text: "text-orange-700 dark:text-orange-300",
    dot: "bg-orange-500",
  },
  rouge: {
    label: "Erreur ou hors-AMM",
    bg: "bg-red-50 dark:bg-red-950/30",
    border: "border-l-4 border-l-red-500",
    text: "text-red-700 dark:text-red-300",
    dot: "bg-red-500",
  },
  gris: {
    label: "Non évalué",
    bg: "",
    border: "border-l-4 border-l-muted",
    text: "text-muted-foreground",
    dot: "bg-muted-foreground",
  },
  en_cours: {
    label: "Analyse en cours…",
    bg: "bg-muted/20",
    border: "border-l-4 border-l-muted",
    text: "text-muted-foreground",
    dot: "bg-muted-foreground",
  },
};
