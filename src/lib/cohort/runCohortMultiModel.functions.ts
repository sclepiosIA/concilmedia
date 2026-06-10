import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ModelSpec = z.object({
  providerName: z.string().min(1),
  modelId: z.string().min(1),
  label: z.string().min(1).max(120),
});

const Input = z.object({
  patientId: z.string().uuid(),
  runTag: z.string().min(1).max(120),
  model: ModelSpec,
});

/**
 * Exécute UNE conciliation patient avec UN modèle spécifique sous un runTag.
 * Le composant UI orchestre la boucle (patients × modèles) pour suivre la progression.
 */
export const runOnePatientOneModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const { analyzePatientConciliationComplete } = await import(
      "@/lib/conciliation/analyzePatientConciliationComplete.functions"
    );
    const started = Date.now();
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (analyzePatientConciliationComplete as any)({
        data: {
          patientId: data.patientId,
          modelOverride: {
            providerName: data.model.providerName,
            modelId: data.model.modelId,
          },
          runTag: data.runTag,
          modelLabel: data.model.label,
        },
      });
      return {
        ok: true,
        patientId: data.patientId,
        modelLabel: data.model.label,
        durationMs: Date.now() - started,
      };
    } catch (e) {
      return {
        ok: false,
        patientId: data.patientId,
        modelLabel: data.model.label,
        durationMs: Date.now() - started,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  });

/**
 * Liste les (run_tag, model_label) distincts présents pour les patients d'une cohorte.
 * Utilisé par l'UI résultats pour proposer un sélecteur des runs disponibles.
 */
export const listCohortRuns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cohortId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: patients } = await supabase
      .from("patients")
      .select("id")
      .eq("cohort_id", data.cohortId);
    const ids = (patients ?? []).map((p) => p.id);
    if (ids.length === 0) return { runs: [] as Array<{ runTag: string | null; modelLabel: string | null; count: number }> };

    const { data: rows } = await supabase
      .from("conciliation_ai_analyses")
      .select("run_tag, model_label, patient_id")
      .in("patient_id", ids);

    const map = new Map<string, { runTag: string | null; modelLabel: string | null; count: number }>();
    for (const r of rows ?? []) {
      const key = `${r.run_tag ?? ""}|${r.model_label ?? ""}`;
      const cur = map.get(key) ?? { runTag: r.run_tag, modelLabel: r.model_label, count: 0 };
      cur.count++;
      map.set(key, cur);
    }
    return { runs: Array.from(map.values()).sort((a, b) => (b.count - a.count)) };
  });
