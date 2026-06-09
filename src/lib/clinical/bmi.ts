// Calcul IMC + catégorie OMS

export type BmiCategory =
  | "insuffisance"
  | "normal"
  | "surpoids"
  | "obesite_1"
  | "obesite_2"
  | "obesite_3";

export interface BmiResult {
  imc: number;
  category: BmiCategory;
  label: string;
  tone: "green" | "orange" | "red";
}

export function computeBmi(poidsKg?: number | null, tailleCm?: number | null): BmiResult | null {
  if (!poidsKg || !tailleCm || tailleCm <= 0) return null;
  const m = tailleCm / 100;
  const imc = poidsKg / (m * m);
  const rounded = Math.round(imc * 10) / 10;
  if (imc < 18.5) return { imc: rounded, category: "insuffisance", label: "Insuffisance pondérale", tone: "orange" };
  if (imc < 25) return { imc: rounded, category: "normal", label: "Corpulence normale", tone: "green" };
  if (imc < 30) return { imc: rounded, category: "surpoids", label: "Surpoids", tone: "orange" };
  if (imc < 35) return { imc: rounded, category: "obesite_1", label: "Obésité modérée (classe I)", tone: "red" };
  if (imc < 40) return { imc: rounded, category: "obesite_2", label: "Obésité sévère (classe II)", tone: "red" };
  return { imc: rounded, category: "obesite_3", label: "Obésité morbide (classe III)", tone: "red" };
}
