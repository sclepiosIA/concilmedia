import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

interface MedLine {
  dci?: string | null;
  dosage?: string | null;
  dosage_unite?: string | null;
  posologie_texte?: string | null;
}

function buildBundle(opts: {
  validationId: string;
  patientPseudo: string;
  meds: MedLine[];
  validatedAt: string;
  pharmacien: string | null;
}) {
  const subjectRef = { reference: `Patient/${opts.patientPseudo}` };
  const statements = opts.meds
    .filter((m) => !!m.dci)
    .map((m, i) => ({
      fullUrl: `urn:uuid:ms-${opts.validationId}-${i}`,
      resource: {
        resourceType: "MedicationStatement",
        status: "active",
        subject: subjectRef,
        effectiveDateTime: opts.validatedAt,
        medicationCodeableConcept: {
          text: [m.dci, m.dosage, m.dosage_unite].filter(Boolean).join(" "),
        },
        dosage: m.posologie_texte ? [{ text: m.posologie_texte }] : undefined,
      },
      request: { method: "POST", url: "MedicationStatement" },
    }));

  const documentRef = {
    fullUrl: `urn:uuid:doc-${opts.validationId}`,
    resource: {
      resourceType: "DocumentReference",
      status: "current",
      type: {
        coding: [{ system: "http://loinc.org", code: "56445-0", display: "Medication summary Document" }],
      },
      subject: subjectRef,
      date: opts.validatedAt,
      author: opts.pharmacien ? [{ display: opts.pharmacien }] : undefined,
      description: `Conciliation médicamenteuse validée — ${opts.meds.length} ligne(s)`,
      content: [{
        attachment: {
          contentType: "application/json",
          title: "Conciliation ConcilMed",
        },
      }],
    },
    request: { method: "POST", url: "DocumentReference" },
  };

  return {
    resourceType: "Bundle",
    type: "transaction",
    entry: [...statements, documentRef],
  };
}

export const exportConciliationFhir = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ validationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: v, error: vErr } = await context.supabase
      .from("conciliation_validations")
      .select("id, validated_at, pharmacien_nom, patient_id")
      .eq("id", data.validationId)
      .maybeSingle();
    if (vErr) throw new Error(vErr.message);
    if (!v) throw new Error("Validation introuvable.");

    const { data: pat, error: pErr } = await context.supabase
      .from("patients")
      .select("external_pseudo, id")
      .eq("id", v.patient_id)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    const pseudo = pat?.external_pseudo ?? v.patient_id;

    const { data: meds, error: mErr } = await context.supabase
      .from("traitements_habituels")
      .select("dci, dosage, dosage_unite, posologie_texte")
      .eq("patient_id", v.patient_id)
      .eq("actif", true);
    if (mErr) throw new Error(mErr.message);

    const bundle = buildBundle({
      validationId: v.id,
      patientPseudo: pseudo,
      meds: meds ?? [],
      validatedAt: v.validated_at,
      pharmacien: v.pharmacien_nom,
    });

    return { bundle, stats: { medications: (meds ?? []).length } };
  });
