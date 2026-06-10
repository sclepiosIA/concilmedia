import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const PatientRow = z.object({
  nom: z.string().trim().min(1).max(120),
  prenom: z.string().trim().min(1).max(120),
  date_naissance: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  sexe: z.enum(["M", "F"]).nullable().optional(),
  poids_kg: z.number().positive().max(400).nullable().optional(),
  taille_cm: z.number().positive().max(260).nullable().optional(),
  nir: z.string().trim().max(20).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

const Input = z.object({
  cohortId: z.string().uuid(),
  patients: z.array(PatientRow).min(1).max(2000),
});

export const importPatientsRoster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: cohort, error: cErr } = await supabase
      .from("cohorts")
      .select("id, tag, created_by")
      .eq("id", data.cohortId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!cohort) throw new Error("Cohorte introuvable");
    if ((cohort as { created_by: string }).created_by !== userId) {
      throw new Error("Cohorte non autorisée");
    }

    const rows = data.patients.map((p) => ({
      nom: p.nom,
      prenom: p.prenom,
      date_naissance: p.date_naissance ?? null,
      sexe: p.sexe ?? null,
      poids_kg: p.poids_kg ?? null,
      taille_cm: p.taille_cm ?? null,
      nir: p.nir ?? null,
      notes: p.notes ?? null,
      cohort_id: data.cohortId,
      cohort_tag: (cohort as { tag: string }).tag,
      is_synthetic: false,
      created_by: userId,
    }));

    const { data: inserted, error } = await supabase
      .from("patients")
      .insert(rows as never)
      .select("id");
    if (error) throw new Error(error.message);

    return { inserted: inserted?.length ?? 0 };
  });
