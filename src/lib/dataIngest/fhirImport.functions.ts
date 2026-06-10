import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fhirBundleToCsvRows } from "./fhirToConcilMed.server";

const Input = z.object({
  bundleJson: z.string().min(2).max(5_000_000),
});

function escapeCsv(v: string): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function rowsToCsv(headers: string[], rows: Record<string, string | number>[]): string {
  const head = headers.join(",");
  const body = rows
    .map((r) => headers.map((h) => escapeCsv(String(r[h] ?? ""))).join(","))
    .join("\n");
  return head + "\n" + body + (body ? "\n" : "");
}

export const fhirBundleToCsvTexts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    let parsed: unknown;
    try { parsed = JSON.parse(data.bundleJson); }
    catch { throw new Error("JSON FHIR invalide."); }
    const bundle = parsed as { resourceType?: string; entry?: { resource?: { resourceType?: string } }[] };
    if (bundle?.resourceType !== "Bundle") {
      throw new Error('Ressource racine attendue : "Bundle".');
    }
    const adapted = fhirBundleToCsvRows(bundle);

    const patientsCsv = rowsToCsv(
      ["ipp_local", "date_naissance", "sexe", "poids_kg", "taille_cm"],
      adapted.patients.map((p) => ({
        ipp_local: p.ipp_local,
        date_naissance: p.date_naissance,
        sexe: p.sexe,
        poids_kg: "",
        taille_cm: "",
      })),
    );

    const traitementsCsv = rowsToCsv(
      ["ipp_local", "dci", "dosage", "dosage_unite", "voie_administration", "posologie_texte", "indication"],
      adapted.traitements.map((t) => ({
        ipp_local: t.ipp_local,
        dci: t.dci,
        dosage: t.dosage,
        dosage_unite: t.dosage_unite,
        voie_administration: t.voie_administration,
        posologie_texte: t.posologie_texte,
        indication: t.indication,
      })),
    );

    return {
      patientsCsv,
      traitementsCsv,
      stats: {
        patients: adapted.patients.length,
        traitements: adapted.traitements.length,
        entries: bundle.entry?.length ?? 0,
      },
    };
  });
