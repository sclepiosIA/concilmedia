// Pseudonymisation côté serveur. Tout est dérivé de DATA_INGEST_SALT + orgId.

function getMasterSalt(): string {
  const s = process.env.DATA_INGEST_SALT;
  if (!s || s.length < 16) {
    throw new Error("DATA_INGEST_SALT manquant ou trop court (>=16 caractères requis).");
  }
  return s;
}

async function hmacSha256(key: string, data: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(data));
  return new Uint8Array(sig);
}

function toBase64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Sel propre à une organisation, dérivé du master salt. */
export async function deriveOrgSalt(orgId: string): Promise<string> {
  const bytes = await hmacSha256(getMasterSalt(), `org:${orgId}`);
  return toBase64Url(bytes);
}

/** Hash stable d'un IPP dans le contexte d'une organisation. */
export async function hashIpp(ipp: string, orgSalt: string): Promise<string> {
  const bytes = await hmacSha256(orgSalt, `ipp:${ipp.trim()}`);
  return toBase64Url(bytes).slice(0, 24);
}

/** Décalage déterministe entre -30 et +30 jours, stable par patient + org. */
export async function deriveDateOffsetDays(ipp: string, orgSalt: string): Promise<number> {
  const bytes = await hmacSha256(orgSalt, `offset:${ipp.trim()}`);
  const n = (bytes[0] << 8) | bytes[1];
  return (n % 61) - 30; // [-30, +30]
}

export function offsetDate(iso: string | null | undefined, offsetDays: number): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/** Réduit nom/prénom à des initiales : "Martin", "Jean" → "M.", "J." */
export function redactName(s: string | null | undefined): string {
  if (!s) return "X.";
  const trimmed = s.trim();
  if (!trimmed) return "X.";
  return `${trimmed[0].toUpperCase()}.`;
}
