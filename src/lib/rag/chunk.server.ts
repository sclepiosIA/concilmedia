// Chunker simple : paragraphes puis phrases, avec overlap.
// Server-only (utilisé par ingestCorpus).

export interface ChunkOptions {
  maxChars?: number;
  overlap?: number;
}

export function chunk(text: string, opts: ChunkOptions = {}): string[] {
  const maxChars = opts.maxChars ?? 1200;
  const overlap = opts.overlap ?? 200;
  const clean = (text ?? "").replace(/\r\n/g, "\n").trim();
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];

  // 1) Segmentation paragraphes
  const paragraphs = clean.split(/\n\s*\n+/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  let buf = "";

  const pushBuf = () => {
    if (buf.trim()) out.push(buf.trim());
    buf = "";
  };

  for (const p of paragraphs) {
    if (p.length > maxChars) {
      // Paragraphe long → découpe par phrases
      pushBuf();
      const sentences = p.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý])/);
      for (const s of sentences) {
        if ((buf + " " + s).length > maxChars) {
          pushBuf();
        }
        buf = buf ? buf + " " + s : s;
        if (buf.length >= maxChars) pushBuf();
      }
      pushBuf();
      continue;
    }
    if ((buf + "\n\n" + p).length > maxChars) {
      pushBuf();
    }
    buf = buf ? buf + "\n\n" + p : p;
  }
  pushBuf();

  // 2) Overlap : préfixer chaque chunk (sauf le 1er) avec la fin du précédent
  if (overlap > 0 && out.length > 1) {
    const withOverlap: string[] = [out[0]];
    for (let i = 1; i < out.length; i++) {
      const prev = out[i - 1];
      const tail = prev.slice(Math.max(0, prev.length - overlap));
      withOverlap.push(tail + " … " + out[i]);
    }
    return withOverlap;
  }
  return out;
}

/** Approximation grossière du nombre de tokens (1 token ≈ 4 chars). */
export function estimateTokens(text: string): number {
  return Math.ceil((text ?? "").length / 4);
}
