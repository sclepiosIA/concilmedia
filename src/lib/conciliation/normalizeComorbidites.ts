// Utilities to normalize and deduplicate comorbidity labels.
// Handles French abbreviations, accents, severity/status qualifiers,
// and prefers the most informative label among near-duplicates.

const ABBREV_MAP: Record<string, string> = {
  hta: "hypertension arterielle",
  htap: "hypertension arterielle pulmonaire",
  irc: "insuffisance renale chronique",
  ira: "insuffisance renale aigue",
  ic: "insuffisance cardiaque",
  icc: "insuffisance cardiaque chronique",
  bpco: "bronchopneumopathie chronique obstructive",
  avc: "accident vasculaire cerebral",
  ait: "accident ischemique transitoire",
  idm: "infarctus du myocarde",
  sca: "syndrome coronarien aigu",
  fa: "fibrillation auriculaire",
  acfa: "fibrillation auriculaire",
  aomi: "arteriopathie obliterante des membres inferieurs",
  saos: "syndrome apnees obstructives du sommeil",
  sas: "syndrome apnees du sommeil",
  mrc: "maladie renale chronique",
  dt1: "diabete de type 1",
  dt2: "diabete de type 2",
  dnid: "diabete de type 2",
  dlp: "dyslipidemie",
  rgo: "reflux gastro oesophagien",
  meici: "maladie inflammatoire chronique intestinale",
  ald: "affection longue duree",
};

// Words/qualifiers that don't change the underlying pathology — strip when
// building the canonical key but keep when choosing the "best" label.
const QUALIFIERS = [
  "severe", "severes", "grave", "graves",
  "modere", "moderee", "moderes", "moderees",
  "leger", "legere", "legers", "legeres",
  "chronique", "chroniques", "aigu", "aigue", "aigus", "aigues",
  "desequilibre", "desequilibree", "desequilibres", "desequilibrees",
  "equilibre", "equilibree",
  "non", "controle", "controlee", "compense", "compensee", "decompense", "decompensee",
  "essentiel", "essentielle", "essentiels", "essentielles",
  "stade", "terminal", "terminale",
  "actif", "active", "evolutif", "evolutive",
  "connu", "connue", "ancien", "ancienne", "recent", "recente",
  "primitif", "primitive", "secondaire",
];

const STAGE_RE = /\bstade\s*[ivx0-9]+\b/g;
const ROMAN_TAIL_RE = /\b[ivx]+\b/g;
const PUNCT_RE = /[\s,;:./()\-_'"]+/g;

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function expandAbbrev(s: string): string {
  return s
    .split(" ")
    .map((tok) => ABBREV_MAP[tok] ?? tok)
    .join(" ");
}

/** Canonical key for deduplication — collapses qualifiers, accents, abbreviations. */
export function canonicalComorbKey(label: string): string {
  if (!label) return "";
  let s = stripAccents(label).toLowerCase();
  s = s.replace(STAGE_RE, " ");
  s = s.replace(PUNCT_RE, " ").replace(/\s+/g, " ").trim();
  s = expandAbbrev(s);
  // remove qualifier words
  const qSet = new Set(QUALIFIERS);
  s = s
    .split(" ")
    .filter((w) => w && !qSet.has(w))
    .join(" ");
  s = s.replace(ROMAN_TAIL_RE, "").replace(/\s+/g, " ").trim();
  return s;
}

/** Score a label — higher = more informative (keep). */
function scoreLabel(label: string): number {
  const len = label.trim().length;
  const lower = stripAccents(label).toLowerCase();
  let score = len;
  // bonus for severity/stage/etiology info
  if (/severe|grave|stade|terminal|desequilibr|decompens|non\s*control/i.test(lower)) score += 20;
  if (/type\s*[12]|sylvien|ischemique|hemorragique|obstructive|restrictive/i.test(lower)) score += 10;
  // penalty for pure abbreviation (<= 5 chars, all upper in original)
  if (label.trim().length <= 5 && label === label.toUpperCase()) score -= 30;
  return score;
}

export interface ComorbLike {
  libelle: string;
  code_cim10?: string | null;
  statut?: string | null;
}

/** Dedupe a fresh list — keep best label per canonical key. */
export function dedupeComorbidites<T extends ComorbLike>(list: T[]): T[] {
  const best = new Map<string, T>();
  for (const item of list) {
    const lib = (item?.libelle ?? "").trim();
    if (!lib) continue;
    const key = canonicalComorbKey(lib);
    if (!key) continue;
    const existing = best.get(key);
    if (!existing) {
      best.set(key, item);
      continue;
    }
    // prefer richer label, but merge cim10 if missing
    const winner = scoreLabel(lib) > scoreLabel(existing.libelle) ? item : existing;
    const loser = winner === existing ? item : existing;
    const merged: T = {
      ...winner,
      code_cim10: winner.code_cim10 ?? loser.code_cim10 ?? null,
    };
    best.set(key, merged);
  }
  return Array.from(best.values());
}

/** Filter `incoming` against `existingLabels` already stored for the patient. */
export function filterNewComorbidites<T extends ComorbLike>(
  incoming: T[],
  existingLabels: string[],
): T[] {
  const existingKeys = new Set(existingLabels.map(canonicalComorbKey).filter(Boolean));
  const deduped = dedupeComorbidites(incoming);
  return deduped.filter((c) => !existingKeys.has(canonicalComorbKey(c.libelle)));
}
