// Petit parseur CSV RFC 4180 (séparateur , ou ;) — pas de dépendance externe.
// Renvoie { headers, rows } avec rows = Record<string,string>.

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
  delimiter: string;
}

function detectDelimiter(firstLine: string): string {
  const commas = (firstLine.match(/,/g) ?? []).length;
  const semis = (firstLine.match(/;/g) ?? []).length;
  return semis > commas ? ";" : ",";
}

export function parseCsv(text: string): ParsedCsv {
  // Enlever BOM
  const clean = text.replace(/^\uFEFF/, "");
  const firstNl = clean.indexOf("\n");
  const firstLine = (firstNl === -1 ? clean : clean.slice(0, firstNl)).replace(/\r$/, "");
  const delimiter = detectDelimiter(firstLine);

  const records: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;
  while (i < clean.length) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === delimiter) { row.push(field); field = ""; i++; continue; }
    if (c === "\n" || c === "\r") {
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") records.push(row);
      row = [];
      if (c === "\r" && clean[i + 1] === "\n") i++;
      i++; continue;
    }
    field += c; i++;
  }
  if (field !== "" || row.length > 0) { row.push(field); records.push(row); }

  if (records.length === 0) return { headers: [], rows: [], delimiter };
  const headers = records[0].map((h) => h.trim().toLowerCase());
  const rows = records.slice(1).map((r) => {
    const o: Record<string, string> = {};
    headers.forEach((h, idx) => { o[h] = (r[idx] ?? "").trim(); });
    return o;
  });
  return { headers, rows, delimiter };
}

export async function sha256Hex(text: string): Promise<string> {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
