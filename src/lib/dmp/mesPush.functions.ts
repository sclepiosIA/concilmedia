// Piste #10 v2 — Push simulé vers Mon Espace Santé + audit.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash } from "crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DOC_TYPES = ["lettre_liaison", "bcm", "plan_pharmaceutique"] as const;

export const pushDocumentToMes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        patientId: z.string().uuid(),
        episodeId: z.string().uuid().optional().nullable(),
        documentType: z.enum(DOC_TYPES),
        documentId: z.string().uuid().optional().nullable(),
        payloadSummary: z.record(z.string(), z.unknown()).optional().default({}),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: pat } = await supabase
      .from("patients")
      .select("id, consentement_dmp")
      .eq("id", data.patientId)
      .maybeSingle();
    if (!pat) throw new Error("Patient introuvable.");
    if (!pat.consentement_dmp) throw new Error("Consentement DMP requis avant tout push MES.");

    // Simulation de l'ACK MES
    const ack = `MES-SIM-${Date.now().toString(36).toUpperCase()}`;
    const hash = createHash("sha256")
      .update(JSON.stringify({ ...data, ack, t: Date.now() }))
      .digest("hex")
      .slice(0, 32);

    const { data: row, error } = await supabase
      .from("mes_pushes")
      .insert({
        patient_id: data.patientId,
        episode_id: data.episodeId ?? null,
        document_type: data.documentType,
        document_id: data.documentId ?? null,
        status: "simulated",
        ack_id: ack,
        payload_hash: hash,
        payload_summary: data.payloadSummary as unknown as any,
        pushed_by: userId,
      })
      .select("id, pushed_at, ack_id, status")
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("dmp_access_audit").insert({
      patient_id: data.patientId,
      user_id: userId,
      action: "push_mes",
      resource: data.documentType,
      details: { document_id: data.documentId, ack, episode_id: data.episodeId } as unknown as any,
    });
    return row;
  });

export const listMesPushes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ patientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("mes_pushes")
      .select("id, document_type, document_id, status, ack_id, pushed_at, payload_summary, episode_id")
      .eq("patient_id", data.patientId)
      .order("pushed_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return { pushes: rows ?? [] };
  });
