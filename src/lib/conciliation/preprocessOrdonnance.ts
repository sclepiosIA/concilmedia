// Client-safe : pré-traite un fichier image avant upload OCR.
// - Auto-rotation EXIF gérée par le navigateur (image.decode + canvas)
// - Downscale max 2000 px côté long
// - Réencodage JPEG qualité 0.9
// PDF : passthrough.

export interface PreprocessResult {
  file: File;
  originalSize: number;
  finalSize: number;
  resized: boolean;
}

const MAX_SIDE = 2000;

export async function preprocessOrdonnance(file: File): Promise<PreprocessResult> {
  const originalSize = file.size;
  if (!file.type.startsWith("image/")) {
    return { file, originalSize, finalSize: originalSize, resized: false };
  }

  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();

    const longSide = Math.max(img.naturalWidth, img.naturalHeight);
    if (longSide <= MAX_SIDE && file.type === "image/jpeg") {
      return { file, originalSize, finalSize: originalSize, resized: false };
    }
    const scale = longSide > MAX_SIDE ? MAX_SIDE / longSide : 1;
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { file, originalSize, finalSize: originalSize, resized: false };
    ctx.drawImage(img, 0, 0, w, h);

    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) return { file, originalSize, finalSize: originalSize, resized: false };

    const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    const out = new File([blob], newName, { type: "image/jpeg" });
    return { file: out, originalSize, finalSize: out.size, resized: scale < 1 };
  } finally {
    URL.revokeObjectURL(url);
  }
}
