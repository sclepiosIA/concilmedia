/**
 * Normalisation médicaments (version datathon, sans BDPM complète).
 *
 * - `normDci` : retire accents/dosages, mappe ~50 princeps→DCI les plus fréquents.
 * - `parseDose` : convertit dose+unité vers mg (g→×1000, µg→÷1000).
 *
 * Limitations : table de synonymes manuelle, pas exhaustive. À remplacer par
 * BDPM (15 000 CIS) pour la prod.
 */

const SYNONYMES: Record<string, string> = {
  // Antalgiques
  doliprane: "paracetamol", dafalgan: "paracetamol", efferalgan: "paracetamol",
  acetaminophene: "paracetamol",
  // Antiagrégants / anticoagulants
  kardegic: "aspirine", aspegic: "aspirine", plavix: "clopidogrel",
  previscan: "fluindione", sintrom: "acenocoumarol", coumadine: "warfarine",
  lovenox: "enoxaparine", innohep: "tinzaparine",
  eliquis: "apixaban", xarelto: "rivaroxaban", pradaxa: "dabigatran", lixiana: "edoxaban",
  // Diurétiques / cardio
  lasilix: "furosemide", aldactone: "spironolactone", esidrex: "hydrochlorothiazide",
  fludex: "indapamide",
  // Bêtabloquants
  cardensiel: "bisoprolol", detensiel: "bisoprolol", soprol: "bisoprolol",
  temerit: "nebivolol", kredex: "carvedilol", lopressor: "metoprolol",
  // IEC/ARA2
  triatec: "ramipril", coversyl: "perindopril", lopril: "captopril",
  cozaar: "losartan", tareg: "valsartan", atacand: "candesartan",
  // Statines
  tahor: "atorvastatine", crestor: "rosuvastatine", elisor: "pravastatine",
  // IPP
  mopral: "omeprazole", inipomp: "pantoprazole", inexium: "esomeprazole",
  // Diabète
  glucophage: "metformine", diamicron: "gliclazide", januvia: "sitagliptine",
  jardiance: "empagliflozine", forxiga: "dapagliflozine", trulicity: "dulaglutide",
  // Thyroïde
  levothyrox: "levothyroxine", lthyroxine: "levothyroxine", euthyrox: "levothyroxine",
  // Psy
  lexomil: "bromazepam", xanax: "alprazolam", temesta: "lorazepam",
  stilnox: "zolpidem", imovane: "zopiclone",
  deroxat: "paroxetine", zoloft: "sertraline", prozac: "fluoxetine",
  effexor: "venlafaxine", cymbalta: "duloxetine",
  // Opioïdes
  skenan: "morphine", oxycontin: "oxycodone", durogesic: "fentanyl",
  topalgic: "tramadol", contramal: "tramadol",
  // Cortico / asthme
  ventoline: "salbutamol", seretide: "salmeterol", symbicort: "formoterol",
};

export function normDci(input: string | null | undefined): string {
  if (!input) return "";
  let n = input.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  // Retirer dosages (200mg, 1 g, 100 ui, 5ml, etc.)
  n = n.replace(/\b\d+(?:[.,]\d+)?\s?(mg|g|ug|µg|mcg|ui|ml)\b/g, "");
  // Garder lettres + espaces
  n = n.replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  // Mapper princeps → DCI : on tente le mot le plus long du libellé
  for (const word of n.split(" ")) {
    if (word.length >= 4 && SYNONYMES[word]) return SYNONYMES[word];
  }
  return n;
}

export interface ParsedDose {
  /** Valeur convertie en milligrammes (ou unité d'origine si UI/mL). */
  mg: number;
  /** Unité d'origine telle qu'écrite. */
  unite: string;
}

export function parseDose(input: string | null | undefined): ParsedDose | null {
  if (!input) return null;
  const m = String(input).match(/(\d+(?:[.,]\d+)?)\s*(mg|g|ug|µg|mcg|ui|ml)?/i);
  if (!m) return null;
  let v = parseFloat(m[1].replace(",", "."));
  if (Number.isNaN(v)) return null;
  const u = (m[2] || "mg").toLowerCase();
  if (u === "g") v *= 1000;
  else if (u === "ug" || u === "µg" || u === "mcg") v /= 1000;
  return { mg: v, unite: u };
}

/**
 * Vrai si deux libellés désignent le même médicament (après normalisation).
 * Garde une longueur minimale de 4 pour éviter les collisions sur des fragments.
 */
export function sameMedicament(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normDci(a);
  const nb = normDci(b);
  if (na.length < 4 || nb.length < 4) return false;
  return na === nb;
}

/** Vrai si les doses diffèrent (après conversion en mg). */
export function dosesDifferent(a: string | null | undefined, b: string | null | undefined): boolean {
  const pa = parseDose(a);
  const pb = parseDose(b);
  if (!pa || !pb) return false; // pas d'info → ne pas signaler
  return pa.mg !== pb.mg;
}
