// Piste #10 v2 — Audit DMP + consentement patient.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listDmpAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ patientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("dmp_access_audit")
      .select("id, action, resource, motif, details, created_at, user_id")
      .eq("patient_id", data.patientId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { entries: rows ?? [] };
  });

export const setDmpConsent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ patientId: z.string().uuid(), consentement: z.boolean(), motif: z.string().max(500).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("patients")
      .update({
        consentement_dmp: data.consentement,
        consentement_dmp_date: data.consentement ? new Date().toISOString() : null,
        consentement_dmp_recueilli_par: data.consentement ? userId : null,
      })
      .eq("id", data.patientId);
    if (error) throw new Error(error.message);
    await supabase.from("dmp_access_audit").insert({
      patient_id: data.patientId,
      user_id: userId,
      action: data.consentement ? "consentement_recueilli" : "consentement_retire",
      motif: data.motif ?? null,
    });
    return { ok: true };
  });

export const getDmpConsent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ patientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: pat, error } = await supabase
      .from("patients")
      .select("consentement_dmp, consentement_dmp_date, consentement_dmp_recueilli_par")
      .eq("id", data.patientId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      consentement: pat?.consentement_dmp ?? false,
      date: pat?.consentement_dmp_date ?? null,
      recueilli_par: pat?.consentement_dmp_recueilli_par ?? null,
    };
  });
