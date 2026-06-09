import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  computePatientTriage,
  type Gravite,
  type NiveauRisque,
  type TriageResult,
} from "@/lib/conciliation/triageScale";

const RISK_ORDER: NiveauRisque[] = ["faible", "modere", "eleve", "critique"];
const worseRisk = (a: NiveauRisque | null, b: NiveauRisque | null): NiveauRisque | null => {
  if (!a) return b;
  if (!b) return a;
  return RISK_ORDER.indexOf(a) >= RISK_ORDER.indexOf(b) ? a : b;
};

export function usePatientsTriage(patientIds: string[]) {
  // Clé stable : on ignore l'ordre du tableau et on évite de regénérer la clé
  // si la liste ne change pas réellement.
  const key = [...patientIds].sort().join(",");
  return useQuery({
    queryKey: ["patients-triage", key],
    enabled: patientIds.length > 0,
    // Le triage est purement dérivé — pas besoin de rafraîchir souvent.
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    placeholderData: keepPreviousData,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async (): Promise<Record<string, TriageResult>> => {
      const [episodesRes, divsRes, validationsRes, analysesRes, risksRes] = await Promise.all([
        supabase
          .from("episodes")
          .select("id, patient_id, statut")
          .in("patient_id", patientIds),
        supabase
          .from("conciliation_medicaments")
          .select("patient_id, gravite, statut, intention")
          .in("patient_id", patientIds),
        supabase
          .from("conciliation_validations")
          .select("patient_id")
          .in("patient_id", patientIds),
        supabase
          .from("conciliation_ai_analyses")
          .select("patient_id, created_at")
          .in("patient_id", patientIds),
        supabase
          .from("risk_scores")
          .select("episode_id, niveau, computed_at")
          .order("computed_at", { ascending: false }),
      ]);

      const episodes = episodesRes.data ?? [];
      const divs = divsRes.data ?? [];
      const validations = validationsRes.data ?? [];
      const analyses = analysesRes.data ?? [];
      const risks = risksRes.data ?? [];

      // épisode → patient + actif?
      const episodeToPatient = new Map<string, string>();
      const activeByPatient = new Map<string, boolean>();
      for (const e of episodes) {
        episodeToPatient.set(e.id, e.patient_id);
        if (e.statut === "ouvert") activeByPatient.set(e.patient_id, true);
      }

      // pire niveau de risque par patient (1 score le plus récent par épisode déjà via order)
      const latestRiskByEpisode = new Map<string, NiveauRisque>();
      for (const r of risks) {
        if (!latestRiskByEpisode.has(r.episode_id)) {
          latestRiskByEpisode.set(r.episode_id, r.niveau as NiveauRisque);
        }
      }
      const worstRiskByPatient = new Map<string, NiveauRisque | null>();
      for (const [epId, niveau] of latestRiskByEpisode) {
        const pid = episodeToPatient.get(epId);
        if (!pid) continue;
        worstRiskByPatient.set(pid, worseRisk(worstRiskByPatient.get(pid) ?? null, niveau));
      }

      // divergences non résolues par patient
      const divAgg = new Map<string, { byGravity: Record<Gravite, number>; nonIntentionnelles: number }>();
      for (const d of divs) {
        if (d.statut === "resolu" || d.statut === "non_applicable") continue;
        const agg = divAgg.get(d.patient_id) ?? {
          byGravity: { mineur: 0, modere: 0, majeur: 0, critique: 0 },
          nonIntentionnelles: 0,
        };
        if (d.gravite && (["mineur","modere","majeur","critique"] as Gravite[]).includes(d.gravite as Gravite)) {
          agg.byGravity[d.gravite as Gravite] += 1;
        }
        if (d.intention === "non_intentionnel") agg.nonIntentionnelles += 1;
        divAgg.set(d.patient_id, agg);
      }

      // validations par patient
      const validatedPatients = new Set(validations.map((v) => v.patient_id));

      // analyse la plus ancienne sans validation (par patient)
      const oldestAnalysisByPatient = new Map<string, number>();
      for (const a of analyses) {
        if (validatedPatients.has(a.patient_id)) continue;
        const t = new Date(a.created_at).getTime();
        const cur = oldestAnalysisByPatient.get(a.patient_id);
        if (cur == null || t < cur) oldestAnalysisByPatient.set(a.patient_id, t);
      }

      const result: Record<string, TriageResult> = {};
      for (const pid of patientIds) {
        const divInfo = divAgg.get(pid);
        result[pid] = computePatientTriage({
          hasActiveEpisode: activeByPatient.get(pid) ?? false,
          hasValidation: validatedPatients.has(pid),
          worstRisk: worstRiskByPatient.get(pid) ?? null,
          divergencesByGravity: divInfo?.byGravity ?? { mineur: 0, modere: 0, majeur: 0, critique: 0 },
          nbDivergencesNonIntentionnelles: divInfo?.nonIntentionnelles ?? 0,
          oldestPendingAnalysisAt: oldestAnalysisByPatient.get(pid) ?? null,
        });
      }
      return result;
    },
  });
}
