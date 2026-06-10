import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({
  cohortId: z.string().uuid(),
  externalPatientRef: z.string().min(1).max(64),
  kind: z.enum(["ordonnance_ville", "bilan_bio"]),
  subtype: z.string().max(20).nullable().optional(),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(3).max(100),
  fileBase64: z.string().min(10),
});

export const importCohortPdfBundle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: patient, error: pErr } = await supabase
      .from("patients")
      .select("id, created_by")
      .eq("cohort_id", data.cohortId)
      .eq("external_ref", data.externalPatientRef)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!patient) throw new Error(`Patient ${data.externalPatientRef} introuvable dans la cohorte`);
    if ((patient as { created_by: string }).created_by !== userId) throw new Error("Patient non autorisé");
    const patientId = (patient as { id: string }).id;

    const bin = Uint8Array.from(atob(data.fileBase64), (c) => c.charCodeAt(0));
    const hashBuf = await crypto.subtle.digest("SHA-256", bin);
    const hashHex = Array.from(new Uint8Array(hashBuf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const safeName = data.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
    const storagePath = `${userId}/${patientId}/${data.kind}_${hashHex.slice(0, 16)}_${safeName}`;

    const { error: upErr } = await supabase.storage
      .from("ordonnances")
      .upload(storagePath, bin, { contentType: data.mimeType, upsert: true });
    if (upErr) throw new Error(`Upload échoué: ${upErr.message}`);

    const docType = data.kind === "bilan_bio" ? "biologie" : "ordonnance_ville";
    const specialty = data.kind === "ordonnance_ville" && data.subtype
      ? { mg: "Médecin généraliste", ca: "Cardiologue", en: "Endocrinologue", ne: "Néphrologue" }[data.subtype] ?? data.subtype
      : null;

    const { data: doc, error: insErr } = await supabase
      .from("documents_sources")
      .insert({
        patient_id: patientId,
        storage_path: storagePath,
        file_name: data.fileName,
        mime_type: data.mimeType,
        file_size: bin.byteLength,
        hash_sha256: hashHex,
        document_type: docType,
        prescriber_specialty: specialty,
        uploaded_by: userId,
      } as never)
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);

    return { ok: true, documentId: (doc as { id: string }).id, patientId };
  });
