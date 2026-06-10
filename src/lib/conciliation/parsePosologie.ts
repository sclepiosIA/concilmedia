// Fallback parser: extract structured matin/midi/soir/coucher dose values
// from a free-text posologie when the LLM didn't fill them.

export interface PosologieSlots {
  matin?: string | null;
  midi?: string | null;
  soir?: string | null;
  coucher?: string | null;
}

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Match a quantity: integer, decimal (0.5 / 0,5), fraction (1/2), or range (0.5-1, 8-12)
const QTY = "(\\d+(?:[.,]\\d+)?(?:\\s*\\/\\s*\\d+)?(?:\\s*[-à]\\s*\\d+(?:[.,]\\d+)?)?)";

function cleanQty(q: string): string {
  return q.replace(/\s+/g, "").replace(",", ".").replace(/à/gi, "-");
}

const SLOT_PATTERNS: Array<{ slot: keyof PosologieSlots; re: RegExp }> = [
  { slot: "matin", re: new RegExp(`${QTY}[^.,;\\n]{0,40}?\\b(?:matin|petit[- ]?dejeuner|au lever)\\b`, "i") },
  { slot: "midi", re: new RegExp(`${QTY}[^.,;\\n]{0,40}?\\b(?:midi|repas de midi|dejeuner du midi|dejeuner)\\b`, "i") },
  { slot: "soir", re: new RegExp(`${QTY}[^.,;\\n]{0,40}?\\b(?:soir|diner|souper)\\b`, "i") },
  { slot: "coucher", re: new RegExp(`${QTY}[^.,;\\n]{0,40}?\\b(?:coucher|avant de dormir|au lit|nuit)\\b`, "i") },
  // reverse order: "le matin: 1 cp"
  { slot: "matin", re: new RegExp(`\\b(?:matin|petit[- ]?dejeuner|au lever)\\b[^.,;\\n]{0,20}?${QTY}`, "i") },
  { slot: "midi", re: new RegExp(`\\b(?:midi|dejeuner)\\b[^.,;\\n]{0,20}?${QTY}`, "i") },
  { slot: "soir", re: new RegExp(`\\b(?:soir|diner|souper)\\b[^.,;\\n]{0,20}?${QTY}`, "i") },
  { slot: "coucher", re: new RegExp(`\\b(?:coucher|avant de dormir|au lit|nuit)\\b[^.,;\\n]{0,20}?${QTY}`, "i") },
];

/** Parse posology free-text into structured slots. Returns null fields when unknown. */
export function parsePosologieText(text: string | null | undefined): PosologieSlots {
  const out: PosologieSlots = {};
  if (!text) return out;
  const s = normalize(text);

  for (const { slot, re } of SLOT_PATTERNS) {
    if (out[slot]) continue;
    const m = s.match(re);
    if (m && m[1]) out[slot] = cleanQty(m[1]);
  }

  if (!out.matin && !out.midi && !out.soir && !out.coucher) {
    const hasWeekMonth = /semaine|mois|hebdo|/.test(s) === false ? false : /(semaine|mois|hebdo)/.test(s);

    // Determine frequency per day
    let perDay: number | null = null;

    // "Nx/j", "N fois/j", "N fois par jour" — support ranges "1-3x/j" → take lower bound
    const freqMatch = s.match(/\b(\d+)(?:\s*[-à]\s*(\d+))?\s*(?:x|fois)\s*(?:\/|par)\s*j(?:our)?\b/);
    if (freqMatch) {
      perDay = parseInt(freqMatch[1], 10); // lower bound to stay safe
    }

    // Interval "/Nh" or "toutes les N heures" → 24/N
    if (perDay === null) {
      const intervalMatch = s.match(/(?:\/|toutes?\s+les?\s+)(\d+)\s*h(?:eures?)?\b/);
      if (intervalMatch) {
        const h = parseInt(intervalMatch[1], 10);
        if (h > 0 && h <= 24) perDay = Math.max(1, Math.round(24 / h));
      }
    }

    // Single dose per day: "1 cp/j", "1 inj SC/j", "1x/j"
    if (perDay === null) {
      if (/\b1\s*(?:x|fois|inj(?:ection)?|cp|comprime|gelule|dose|ampoule|sachet)\b[^\n]{0,30}?\/?\s*j(?:our)?\b/.test(s) && !hasWeekMonth) {
        perDay = 1;
      }
    }

    if (perDay !== null && !hasWeekMonth) {
      switch (perDay) {
        case 1: out.matin = "1"; break;
        case 2: out.matin = "1"; out.soir = "1"; break;
        case 3: out.matin = "1"; out.midi = "1"; out.soir = "1"; break;
        case 4: out.matin = "1"; out.midi = "1"; out.soir = "1"; out.coucher = "1"; break;
        default:
          if (perDay >= 5) {
            out.matin = "1"; out.midi = "1"; out.soir = "1"; out.coucher = "1";
          }
      }
    }
  }
  return out;
}

/** Merge LLM slots with parsed fallback — only fill empty slots, never override. */
export function fillMissingPosologieSlots<T extends {
  posologie_matin?: string | null;
  posologie_midi?: string | null;
  posologie_soir?: string | null;
  posologie_coucher?: string | null;
  posologie_texte?: string | null;
}>(t: T): T {
  const isEmpty = (v?: string | null) => !v || !v.toString().trim();
  if (
    !isEmpty(t.posologie_matin) ||
    !isEmpty(t.posologie_midi) ||
    !isEmpty(t.posologie_soir) ||
    !isEmpty(t.posologie_coucher)
  ) {
    return t; // LLM already filled at least one — trust it
  }
  const parsed = parsePosologieText(t.posologie_texte);
  return {
    ...t,
    posologie_matin: t.posologie_matin ?? parsed.matin ?? null,
    posologie_midi: t.posologie_midi ?? parsed.midi ?? null,
    posologie_soir: t.posologie_soir ?? parsed.soir ?? null,
    posologie_coucher: t.posologie_coucher ?? parsed.coucher ?? null,
  };
}
