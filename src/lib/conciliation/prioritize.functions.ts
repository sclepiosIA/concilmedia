import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { computeRiskScore } from "./riskScore";

const Input = z.object({ episodeId: z.string().uuid() });

export const computePrioritization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: episode } = await supabase
      .from("episodes")
      .select("*, patients(*)")
      .eq("id", data.episodeId)
      .maybeSingle();
    if (!episode) throw new Error("Épisode introuvable");

    const patientId = episode.patient_id;
    const [comorb, traits] = await Promise.all([
      supabase.from("comorbidites").select("*").eq("patient_id", patientId).eq("statut", "actif"),
      supabase.from("traitements_habituels").select("*").eq("patient_id", patientId).eq("actif", true),
    ]);

    const p = episode.patients;
    const age = p?.date_naissance
      ? Math.floor((Date.now() - new Date(p.date_naissance).getTime()) / 31557600000)
      : null;

    const comoList = (comorb.data ?? []).map((c) => (c.libelle ?? "").toLowerCase());
    const hasRenale = comoList.some((c) => /renal|rein|ckd|insuffisance r[ée]nale|dfg/.test(c));
    const hasHepat = comoList.some((c) => /h[ée]pat|cirrhos|foie/.test(c));

    const dcis = (traits.data ?? []).map((t) => t.dci || t.nom_commercial || "").filter(Boolean);

    const result = computeRiskScore({
      age,
      via_urgences: !!(episode as { via_urgences?: boolean }).via_urgences,
      nb_comorbidites: (comorb.data ?? []).length,
      has_insuffisance_renale: hasRenale,
      has_insuffisance_hepatique: hasHepat,
      traitements_dci: dcis,
    });

    const { error } = await supabase.from("risk_scores").insert({
      episode_id: data.episodeId,
      score: result.score,
      niveau: result.niveau,
      variables: {
        breakdown: result.breakdown,
        nb_medicaments: result.nb_medicaments,
        classes_a_risque: result.classes_a_risque,
        age,
      },
    } as never);
    if (error) throw new Error(error.message);

    return result;
  });
