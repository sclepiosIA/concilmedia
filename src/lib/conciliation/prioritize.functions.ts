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
    const [comorb, traits, hosp] = await Promise.all([
      supabase.from("comorbidites").select("*").eq("patient_id", patientId).eq("statut", "actif"),
      supabase.from("traitements_habituels").select("*").eq("patient_id", patientId).eq("actif", true),
      supabase.from("prescriptions_hospitalieres").select("id").eq("episode_id", data.episodeId),
    ]);

    const p = episode.patients;
    const age = p?.date_naissance
      ? Math.floor((Date.now() - new Date(p.date_naissance).getTime()) / 31557600000)
      : null;

    const comoList = (comorb.data ?? []).map((c) => (c.libelle ?? "").toLowerCase());
    const hasRenale = comoList.some((c) => /renal|rein|ckd|insuffisance r[ée]nale|dfg/.test(c));
    const hasHepat = comoList.some((c) => /h[ée]pat|cirrhos|foie/.test(c));

    const dcis = (traits.data ?? []).map((t) => t.dci || t.nom_commercial || "").filter(Boolean);

    // 1) Always compute the rule-based / LLM-aligned score
    const result = computeRiskScore({
      age,
      via_urgences: !!(episode as { via_urgences?: boolean }).via_urgences,
      nb_comorbidites: (comorb.data ?? []).length,
      has_insuffisance_renale: hasRenale,
      has_insuffisance_hepatique: hasHepat,
      traitements_dci: dcis,
    });

    // 2) Resolve execution mode for the ML twin task
    const { getTaskExecutionMode, predictLayer2, mlIsConfigured } = await import(
      "@/lib/ai/mlConcilmed.server"
    );
    const mode = await getTaskExecutionMode("ml_prioritize_patient");
    const wantsMl = (mode === "ml" || mode === "both") && (await mlIsConfigured());

    // 3) Try ML in parallel (best-effort)
    let mlOut: { score: number; label: number; model_version: string; model_kind: string } | null = null;
    let mlError: string | null = null;
    if (wantsMl) {
      try {
        mlOut = await predictLayer2({
          age,
          sex: (p as { sexe?: string } | null)?.sexe ?? null,
          nb_comorbidites: (comorb.data ?? []).length,
          has_insuffisance_renale: hasRenale,
          has_insuffisance_hepatique: hasHepat,
          nb_meds_hosp: hosp.data?.length ?? 0,
          via_urgences: !!(episode as { via_urgences?: boolean }).via_urgences,
          duree_sejour: (episode as { duree_sejour?: number }).duree_sejour ?? null,
          service: (episode as { service?: string }).service ?? null,
        });
      } catch (e) {
        mlError = e instanceof Error ? e.message : "Erreur ML inconnue";
        console.warn("[prioritize] ML call failed:", mlError);
      }
    }

    // 4) Persist score(s) per execution_mode
    const rows: Array<Record<string, unknown>> = [];
    if (mode === "llm" || mode === "both" || !mlOut) {
      rows.push({
        episode_id: data.episodeId,
        score: result.score,
        niveau: result.niveau,
        source: "llm",
        variables: {
          breakdown: result.breakdown,
          nb_medicaments: result.nb_medicaments,
          classes_a_risque: result.classes_a_risque,
          age,
        },
      });
    }
    if (mlOut) {
      const niveau = mlOut.score >= 0.66 ? "élevé" : mlOut.score >= 0.33 ? "moyen" : "faible";
      rows.push({
        episode_id: data.episodeId,
        score: Math.round(mlOut.score * 100),
        niveau,
        source: "ml",
        variables: {
          ml_score: mlOut.score,
          ml_label: mlOut.label,
          model_version: mlOut.model_version,
          model_kind: mlOut.model_kind,
        },
      });
    }
    if (rows.length) {
      const { error } = await supabase.from("risk_scores").insert(rows as never);
      if (error) throw new Error(error.message);
    }

    return {
      ...result,
      mode,
      ml: mlOut,
      ml_error: mlError,
    };
  });
