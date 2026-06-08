import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({ cohortTag: z.string().optional() });

export interface EvaluationMetrics {
  episodes_evalues: number;
  total_truth_dnis: number;
  detected_dnis: number;
  true_positives: number;
  false_positives: number;
  false_negatives: number;
  precision: number;
  recall: number;
  f1: number;
  par_type: Record<string, { tp: number; fp: number; fn: number }>;
}

function norm(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().trim().replace(/\s+/g, " ");
}

export const evaluatePrecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }): Promise<EvaluationMetrics> => {
    const { supabase } = context;

    const patientsQ = supabase.from("patients").select("id").eq("is_synthetic", true);
    if (data.cohortTag) patientsQ.eq("cohort_tag", data.cohortTag);
    const { data: patients } = await patientsQ;
    const patientIds = (patients ?? []).map((p) => p.id);
    if (patientIds.length === 0) {
      return {
        episodes_evalues: 0, total_truth_dnis: 0, detected_dnis: 0,
        true_positives: 0, false_positives: 0, false_negatives: 0,
        precision: 0, recall: 0, f1: 0, par_type: {},
      };
    }

    const { data: episodes } = await supabase.from("episodes").select("id").in("patient_id", patientIds);
    const episodeIds = (episodes ?? []).map((e) => e.id);
    if (episodeIds.length === 0) {
      return {
        episodes_evalues: 0, total_truth_dnis: 0, detected_dnis: 0,
        true_positives: 0, false_positives: 0, false_negatives: 0,
        precision: 0, recall: 0, f1: 0, par_type: {},
      };
    }

    const [{ data: truth }, { data: detected }] = await Promise.all([
      supabase.from("ground_truth_dnis").select("*").in("episode_id", episodeIds),
      supabase.from("conciliation_medicaments").select("*").in("episode_id", episodeIds).neq("type_divergence", "aucune"),
    ]);

    const truthRows = truth ?? [];
    const detRows = detected ?? [];

    let tp = 0, fp = 0;
    const matchedTruth = new Set<string>();
    const parType: Record<string, { tp: number; fp: number; fn: number }> = {};
    const bump = (t: string, k: "tp" | "fp" | "fn") => {
      parType[t] ??= { tp: 0, fp: 0, fn: 0 };
      parType[t][k]++;
    };

    for (const d of detRows) {
      const dom = (d.medication_domicile ?? {}) as { dci?: string };
      const dci = norm(dom.dci);
      const type = d.type_divergence ?? "";
      const m = truthRows.find(
        (t) =>
          !matchedTruth.has(t.id) &&
          t.episode_id === d.episode_id &&
          t.type_divergence === type &&
          (norm(t.medicament) === dci ||
            norm(t.medicament).includes(dci) ||
            dci.includes(norm(t.medicament))),
      );
      if (m) { tp++; matchedTruth.add(m.id); bump(type, "tp"); }
      else { fp++; bump(type, "fp"); }
    }
    let fn = 0;
    for (const t of truthRows) {
      if (!matchedTruth.has(t.id)) { fn++; bump(t.type_divergence, "fn"); }
    }

    const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
    const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

    return {
      episodes_evalues: episodeIds.length,
      total_truth_dnis: truthRows.length,
      detected_dnis: detRows.length,
      true_positives: tp,
      false_positives: fp,
      false_negatives: fn,
      precision,
      recall,
      f1,
      par_type: parType,
    };
  });
