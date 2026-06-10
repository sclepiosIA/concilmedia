import { z } from "zod";

export const PatientCsvSchema = z.object({
  ipp_local: z.string().min(1).max(64),
  date_naissance: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format attendu : YYYY-MM-DD"),
  sexe: z.enum(["M", "F", "m", "f"]).transform((v) => v.toUpperCase()),
  poids_kg: z.string().optional().transform((v) => (v ? Number(v) : null)),
  taille_cm: z.string().optional().transform((v) => (v ? Number(v) : null)),
});

export const TraitementCsvSchema = z.object({
  ipp_local: z.string().min(1).max(64),
  dci: z.string().min(1).max(200),
  dosage: z.string().max(50).optional().default(""),
  dosage_unite: z.string().max(20).optional().default(""),
  voie_administration: z.string().max(50).optional().default(""),
  posologie_texte: z.string().max(200).optional().default(""),
  indication: z.string().max(200).optional().default(""),
});

export type PatientCsvRow = z.infer<typeof PatientCsvSchema>;
export type TraitementCsvRow = z.infer<typeof TraitementCsvSchema>;

export const PATIENT_CSV_EXAMPLE = `ipp_local,date_naissance,sexe,poids_kg,taille_cm
P001,1948-03-12,F,62,160
P002,1955-09-21,M,78,172
`;

export const TRAITEMENT_CSV_EXAMPLE = `ipp_local,dci,dosage,dosage_unite,voie_administration,posologie_texte,indication
P001,Amlodipine,5,mg,orale,1 cp matin,HTA
P001,Metformine,1000,mg,orale,1 cp matin et soir,Diabète type 2
P002,Apixaban,5,mg,orale,1 cp matin et soir,FA non valvulaire
`;
