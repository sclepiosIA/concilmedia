import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { predictLayer4Sync } from "@/lib/ai/mlConcilmed.server";

const Input = z.object({
  episodeId: z.string().uuid(),
  patientId: z.string().uuid(),
  items: z
    .array(
      z.object({
        traitement_id: z.string().uuid(),
        dci: z.string().min(1).max(255),
        atc_class: z.string().max(32).nullable().optional(),
      }),
    )
    .max(200),
});

export type OmissionSeverity = {
  traitement_id: string;
  severity_score: number;
  is_severe: number;
  level: "high" | "moderate" | "low";
};

export const scoreOmissionsSeverity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [{ data: patient }, { data: episode }, { count: nbMedsHosp }] = await Promise.all([
      supabase.from("patients").select("date_naissance").eq("id", data.patientId).maybeSingle(),
      supabase.from("episodes").select("service,date_admission,date_sortie").eq("id", data.episodeId).maybeSingle(),
      supabase
        .from("prescriptions_hospitalieres")
        .select("id", { count: "exact", head: true })
        .eq("episode_id", data.episodeId)
        .eq("actif", true),
    ]);

    const age = patient?.date_naissance
      ? Math.floor((Date.now() - new Date(patient.date_naissance).getTime()) / (365.25 * 86400 * 1000))
      : null;
    const dureeSejour =
      episode?.date_admission
        ? Math.max(
            0,
            Math.floor(
              ((episode.date_sortie ? new Date(episode.date_sortie).getTime() : Date.now()) -
                new Date(episode.date_admission).getTime()) /
                86400000,
            ),
          )
        : null;

    const results: OmissionSeverity[] = data.items.map((it) => {
      const r = predictLayer4Sync({
        norm_name: it.dci,
        atc_class: it.atc_class ?? null,
        age,
        nb_meds_hosp: nbMedsHosp ?? 0,
        duree_sejour: dureeSejour,
        service: episode?.service ?? null,
      });
      const level: OmissionSeverity["level"] =
        r.severity_score >= 0.7 ? "high" : r.severity_score >= 0.4 ? "moderate" : "low";
      return {
        traitement_id: it.traitement_id,
        severity_score: r.severity_score,
        is_severe: r.is_severe,
        level,
      };
    });

    return { results };
  });
