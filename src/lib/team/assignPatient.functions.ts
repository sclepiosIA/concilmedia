import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const WORKFLOW_STATUSES = ["a_faire", "en_cours", "en_attente_validation", "valide", "clos"] as const;
export type WorkflowStatus = typeof WORKFLOW_STATUSES[number];

const AssignInput = z.object({
  patientId: z.string().uuid(),
  toUserId: z.string().uuid().nullable(),
  motif: z.string().max(500).optional(),
});

export const assignPatient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AssignInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: patient, error: pErr } = await supabase
      .from("patients")
      .select("id, organization_id, assigned_to")
      .eq("id", data.patientId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!patient) throw new Error("Patient introuvable");

    // For org-scoped patients, ensure caller belongs to the org
    if (patient.organization_id) {
      const { data: mem, error: mErr } = await supabase
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", patient.organization_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (mErr) throw new Error(mErr.message);
      if (!mem) throw new Error("Accès refusé : membre d'organisation requis.");
    }

    const prevAssignee = patient.assigned_to as string | null;
    if (prevAssignee === data.toUserId) {
      return { ok: true, unchanged: true as const };
    }

    const { error: uErr } = await supabase
      .from("patients")
      .update({ assigned_to: data.toUserId })
      .eq("id", data.patientId);
    if (uErr) throw new Error(uErr.message);

    const { error: tErr } = await supabase.from("conciliation_transfers").insert({
      patient_id: data.patientId,
      organization_id: patient.organization_id,
      from_user_id: prevAssignee,
      to_user_id: data.toUserId,
      motif: data.motif ?? null,
      created_by: userId,
    });
    if (tErr) throw new Error(tErr.message);

    return { ok: true, unchanged: false as const };
  });

const StatusInput = z.object({
  patientId: z.string().uuid(),
  status: z.enum(WORKFLOW_STATUSES),
});

export const setWorkflowStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => StatusInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("patients")
      .update({ workflow_status: data.status })
      .eq("id", data.patientId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export interface TransferRow {
  id: string;
  from_user_id: string | null;
  to_user_id: string | null;
  motif: string | null;
  created_by: string | null;
  created_at: string;
}

export const listTransfers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ patientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<TransferRow[]> => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("conciliation_transfers")
      .select("id, from_user_id, to_user_id, motif, created_by, created_at")
      .eq("patient_id", data.patientId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as TransferRow[];
  });
