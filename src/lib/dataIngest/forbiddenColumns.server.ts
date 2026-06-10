// Garde-fous RGPD : refuse les CSV qui contiennent des colonnes ou valeurs identifiantes.

const FORBIDDEN_COLUMN_PATTERNS: RegExp[] = [
  /^nir$/i, /numero_securite_sociale/i, /num_secu/i, /^ins$/i, /matricule_ins/i,
  /^email$/i, /^e[-_]?mail$/i,
  /^tel(ephone)?$/i, /^mobile$/i, /^portable$/i,
  /^adresse$/i, /^addr$/i, /^cp$/i, /^code_postal$/i, /^ville$/i,
  /nom_complet/i, /full_?name/i,
  /^iban$/i, /^bic$/i, /carte_vitale/i,
];

const NIR_REGEX = /\b[12]\s?\d{2}\s?\d{2}\s?\d{2}\s?\d{3}\s?\d{3}\s?\d{2}\b/;
const EMAIL_REGEX = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE_REGEX = /\b(?:\+?33|0)\s?[1-9](?:[\s.-]?\d{2}){4}\b/;

export interface ForbiddenCheckResult {
  ok: boolean;
  forbiddenColumns: string[];
  sampleLeaks: { column: string; kind: "nir" | "email" | "phone"; sample: string }[];
}

export function checkForbidden(
  headers: string[],
  rows: Record<string, string>[],
  sampleSize = 50,
): ForbiddenCheckResult {
  const forbiddenColumns = headers.filter((h) => FORBIDDEN_COLUMN_PATTERNS.some((re) => re.test(h)));
  const leaks: ForbiddenCheckResult["sampleLeaks"] = [];
  const sample = rows.slice(0, sampleSize);
  for (const h of headers) {
    let hits = 0;
    for (const row of sample) {
      const v = row[h] ?? "";
      if (!v) continue;
      if (NIR_REGEX.test(v)) { leaks.push({ column: h, kind: "nir", sample: mask(v) }); hits++; }
      else if (EMAIL_REGEX.test(v)) { leaks.push({ column: h, kind: "email", sample: mask(v) }); hits++; }
      else if (PHONE_REGEX.test(v)) { leaks.push({ column: h, kind: "phone", sample: mask(v) }); hits++; }
      if (hits >= 3) break;
    }
  }
  return {
    ok: forbiddenColumns.length === 0 && leaks.length === 0,
    forbiddenColumns,
    sampleLeaks: leaks,
  };
}

function mask(v: string): string {
  if (v.length <= 4) return "***";
  return `${v.slice(0, 2)}***${v.slice(-2)}`;
}
