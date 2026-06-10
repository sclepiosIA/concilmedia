import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const CreateInput = z.object({
  tag: z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9_\-]+$/, "tag: lettres, chiffres, _ et -"),
  label: z.string().trim().max(200).optional().nullable(),
});

export const createCohort = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("cohorts")
      .select("*")
      .eq("created_by", userId)
      .eq("tag", data.tag)
      .maybeSingle();
    if (existing) return existing;
    const { data: row, error } = await supabase
      .from("cohorts")
      .insert({ tag: data.tag, label: data.label ?? null, created_by: userId } as never)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listCohorts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("cohorts")
      .select("*")
      .order("created_at", { ascending: false });
    return { cohorts: data ?? [] };
  });

const CohortIdInput = z.object({ cohortId: z.string().uuid() });

export const getCohortPatients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CohortIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: cohort } = await supabase.from("cohorts").select("*").eq("id", data.cohortId).maybeSingle();
    if (!cohort) throw new Error("Cohorte introuvable");

    const { data: patients } = await supabase
      .from("patients")
      .select("id, nom, prenom, date_naissance, sexe")
      .eq("cohort_id", data.cohortId)
      .order("created_at", { ascending: true });

    const patientIds = (patients ?? []).map((p) => p.id);
    if (patientIds.length === 0) {
      return { cohort, patients: [], episodes: [], gold: [], divergencesByEp: {} as Record<string, number> };
    }

    const [{ data: episodes }, { data: gold }, { data: divs }] = await Promise.all([
      supabase.from("episodes").select("id, patient_id, motif, service, created_at").in("patient_id", patientIds),
      supabase.from("pharmacist_gold_standards").select("id, patient_id, episode_id, file_name, nb_divergences, triage_complexe").in("patient_id", patientIds),
      supabase.from("conciliation_medicaments").select("episode_id, type_divergence").in("patient_id", patientIds).neq("type_divergence", "aucune"),
    ]);

    const divergencesByEp: Record<string, number> = {};
    for (const d of divs ?? []) {
      const k = (d as { episode_id: string }).episode_id;
      divergencesByEp[k] = (divergencesByEp[k] ?? 0) + 1;
    }

    return {
      cohort,
      patients: patients ?? [],
      episodes: episodes ?? [],
      gold: gold ?? [],
      divergencesByEp,
    };
  });
