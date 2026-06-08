// Deterministic soft accent color from a DCI/med name.
// Used as left border to visually group/distinguish medications.
const PALETTE = [
  "hsl(210 70% 55%)", // blue
  "hsl(160 60% 42%)", // teal
  "hsl(280 55% 60%)", // purple
  "hsl(20 80% 55%)",  // orange
  "hsl(340 65% 58%)", // pink
  "hsl(90 50% 45%)",  // green
  "hsl(45 85% 50%)",  // amber
  "hsl(195 70% 48%)", // cyan
];

export function accentForDci(name: string): string {
  if (!name) return PALETTE[0];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
