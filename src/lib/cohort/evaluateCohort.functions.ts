import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { predictLayer2Sync, predictLayer4Sync } from "@/lib/ai/mlConcilmed.server";

const Input = z.object({
  cohortId: z.string().uuid(),
  runTag: z.string().min(1).max(120).optional(),
  modelLabel: z.string().min(1).max(120).optional(),
});

type AIDivergence = {
  medication_domicile?: { dci?: string | null } | null;
  dci?: string | null;
  medicament?: string | null;
  type?: string | null;
  type_divergence?: string | null;
  severite?: string | null;
};

const SEVERITY_RANK = { mineure: 1, moderee: 2, majeure: 3, critique: 4 } as const;

function norm(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "");
}

function f1(tp: number, fp: number, fn: number) {
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  const f1v = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1: f1v };
}

interface PerPatient {
  patient_id: string;
  patient_name: string;
  ia_divergences: number;
  pharma_divergences: number;
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
  ia_triage_complexe: boolean | null;
  pharma_triage_complexe: boolean | null;
  ml_triage_complexe: boolean | null;
  ml_triage_score: number | null;
}

export const evaluateCohort = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: patients } = await supabase
      .from("patients")
      .select("id, nom, prenom, date_naissance, sexe, poids_kg, taille_cm")
      .eq("cohort_id", data.cohortId);
    const patientIds = (patients ?? []).map((p) => p.id);
    if (patientIds.length === 0) {
      throw new Error("Aucun patient dans cette cohorte. Importez des fichiers d'abord.");
    }


    // Lecture des divergences IA depuis le payload stocké dans conciliation_ai_analyses,
    // filtré sur le run_tag + model_label si fournis. On garde la plus récente analyse par patient.
    let aiQuery = supabase
      .from("conciliation_ai_analyses")
      .select("patient_id, payload, run_tag, model_label, created_at, model")
      .in("patient_id", patientIds)
      .order("created_at", { ascending: false });
    if (data.runTag) aiQuery = aiQuery.eq("run_tag", data.runTag);
    if (data.modelLabel) aiQuery = aiQuery.eq("model_label", data.modelLabel);
    const { data: aiAnalyses } = await aiQuery;

    const [{ data: gold }, { data: episodes }, { data: comorb }, { data: bio }] = await Promise.all([
      supabase.from("pharmacist_gold_standards").select("*").eq("cohort_id", data.cohortId),
      supabase.from("episodes").select("id, patient_id, motif, service, date_entree").in("patient_id", patientIds),
      supabase.from("comorbidites").select("patient_id, libelle, statut").in("patient_id", patientIds),
      supabase.from("biologie_resultats").select("patient_id, parametre, valeur, date_prelevement").in("patient_id", patientIds),
    ]);

    type GoldRow = NonNullable<typeof gold>[number];
    const goldByPatient = new Map<string, GoldRow>();
    for (const g of gold ?? []) goldByPatient.set((g as { patient_id: string }).patient_id, g);

    // Plus récente analyse IA par patient (déjà triée desc)
    const divsByPatient = new Map<string, AIDivergence[]>();
    for (const a of aiAnalyses ?? []) {
      const pid = (a as { patient_id: string }).patient_id;
      if (divsByPatient.has(pid)) continue;
      const pl = (a as { payload: unknown }).payload as { divergences_conciliation?: AIDivergence[] } | null;
      const arr = Array.isArray(pl?.divergences_conciliation) ? pl!.divergences_conciliation! : [];
      divsByPatient.set(pid, arr);
    }

    const comorbByPatient = new Map<string, number>();
    const flagsByPatient = new Map<string, { ir: boolean; ih: boolean }>();
    for (const c of comorb ?? []) {
      const pid = (c as { patient_id: string }).patient_id;
      comorbByPatient.set(pid, (comorbByPatient.get(pid) ?? 0) + 1);
      const lib = ((c as { libelle: string }).libelle ?? "").toLowerCase();
      const cur = flagsByPatient.get(pid) ?? { ir: false, ih: false };
      if (/insuff.*r[ée]nale|dfg|n[ée]phropathie/i.test(lib)) cur.ir = true;
      if (/insuff.*h[ée]patique|cirrhose|h[ée]patopathie/i.test(lib)) cur.ih = true;
      flagsByPatient.set(pid, cur);
    }

    const creatinineByPatient = new Map<string, number>();
    const kaliemieByPatient = new Map<string, number>();
    const hba1cByPatient = new Map<string, number>();
    for (const b of bio ?? []) {
      const pid = (b as { patient_id: string }).patient_id;
      const param = ((b as { parametre: string }).parametre ?? "").toLowerCase();
      const val = (b as { valeur: number | null }).valeur;
      if (val == null) continue;
      if (param.includes("creat") && !creatinineByPatient.has(pid)) creatinineByPatient.set(pid, val);
      if (param.includes("kali") && !kaliemieByPatient.has(pid)) kaliemieByPatient.set(pid, val);
      if (param.includes("hba1c") && !hba1cByPatient.has(pid)) hba1cByPatient.set(pid, val);
    }

    type EpRow = NonNullable<typeof episodes>[number];
    const epByPatient = new Map<string, EpRow>();
    for (const e of episodes ?? []) epByPatient.set((e as { patient_id: string }).patient_id, e);

    // Per-patient evaluation
    const perPatient: PerPatient[] = [];
    const TRIAGE_THRESHOLD_DIVS = 3; // IA: patient "complexe" si >=3 divergences détectées
    const totals = { tp: 0, fp: 0, fn: 0 };
    const byType: Record<string, { tp: number; fp: number; fn: number }> = {};
    const bumpType = (t: string, k: "tp" | "fp" | "fn") => {
      byType[t] ??= { tp: 0, fp: 0, fn: 0 };
      byType[t][k]++;
    };

    // Triage confusion matrices (vs pharma gold)
    const triageIA = { tp: 0, fp: 0, fn: 0, tn: 0 };
    const triageML = { tp: 0, fp: 0, fn: 0, tn: 0 };
    // Severity (LLM vs ML) accuracy on TP items
    let sevPairs = 0;
    let sevLLMcorrect = 0;
    let sevMLcorrect = 0;

    for (const p of patients ?? []) {
      const pid = p.id;
      const g = goldByPatient.get(pid);
      const goldExtracted = (g?.extracted_json ?? null) as null | { divergences: { medicament: string; type: string; severite?: string | null }[]; triage_complexe?: boolean };
      const goldDivs = goldExtracted?.divergences ?? [];
      const iaDivs = divsByPatient.get(pid) ?? [];

      // Matching IA vs Pharma per patient
      let tp = 0, fp = 0;
      const matchedGold = new Set<number>();
      for (const d of iaDivs) {
        // Payload IA: peut contenir `medication_domicile.dci` (analyse complète),
        // ou `medicament`/`dci` à plat selon le prompt. On essaye tout.
        const iaName = norm(
          d.medication_domicile?.dci ?? d.dci ?? d.medicament ?? null,
        );
        const iaType = (d.type_divergence ?? d.type ?? "autre").toString();
        const idx = goldDivs.findIndex((gd, i) => {
          if (matchedGold.has(i)) return false;
          const gn = norm(gd.medicament);
          const typeOk = !iaType || !gd.type || iaType === gd.type || iaType.includes(gd.type) || gd.type.includes(iaType);
          return typeOk && (gn === iaName || gn.includes(iaName) || iaName.includes(gn));
        });
        if (idx >= 0) {
          tp++; matchedGold.add(idx); bumpType(iaType, "tp");
          const goldSev = goldDivs[idx].severite;
          const iaSev = d.severite ?? null;
          if (goldSev && iaSev) {
            sevPairs++;
            if (norm(goldSev) === norm(iaSev)) sevLLMcorrect++;
            // ML severity
            const ml = predictLayer4Sync({ norm_name: iaName, age: null });
            const mlSev = ml.is_severe === 1 ? "majeure" : "mineure";
            const goldHigh = (SEVERITY_RANK[goldSev as keyof typeof SEVERITY_RANK] ?? 0) >= 3;
            const mlHigh = mlSev === "majeure";
            if (goldHigh === mlHigh) sevMLcorrect++;
          }
        } else {
          fp++; bumpType(iaType, "fp");
        }
      }
      let fn = 0;
      goldDivs.forEach((gd, i) => {
        if (!matchedGold.has(i)) { fn++; bumpType(gd.type || "autre", "fn"); }
      });

      totals.tp += tp; totals.fp += fp; totals.fn += fn;
      const m = f1(tp, fp, fn);

      // Triage
      const iaTriage = iaDivs.length >= TRIAGE_THRESHOLD_DIVS;
      const pharmaTriage = goldExtracted?.triage_complexe ?? null;
      const ep = epByPatient.get(pid);
      const motif = ((ep as { motif?: string } | undefined)?.motif ?? "").toLowerCase();
      const viaUrg = /urg/.test(motif);
      const flags = flagsByPatient.get(pid) ?? { ir: false, ih: false };
      const age = p.date_naissance ? Math.floor((Date.now() - new Date(p.date_naissance).getTime()) / 31557600000) : null;
      const ml = predictLayer2Sync({
        age,
        sex: p.sexe,
        nb_comorbidites: comorbByPatient.get(pid) ?? 0,
        has_insuffisance_renale: flags.ir,
        has_insuffisance_hepatique: flags.ih,
        nb_meds_hosp: iaDivs.length,
        via_urgences: viaUrg,
        duree_sejour: null,
        creatinine: creatinineByPatient.get(pid) ?? null,
        kaliemie: kaliemieByPatient.get(pid) ?? null,
        hba1c: hba1cByPatient.get(pid) ?? null,
      });
      const mlTriage = ml.label === 1;

      if (pharmaTriage !== null) {
        if (iaTriage && pharmaTriage) triageIA.tp++;
        else if (iaTriage && !pharmaTriage) triageIA.fp++;
        else if (!iaTriage && pharmaTriage) triageIA.fn++;
        else triageIA.tn++;
        if (mlTriage && pharmaTriage) triageML.tp++;
        else if (mlTriage && !pharmaTriage) triageML.fp++;
        else if (!mlTriage && pharmaTriage) triageML.fn++;
        else triageML.tn++;
      }

      perPatient.push({
        patient_id: pid,
        patient_name: `${p.nom ?? ""} ${p.prenom ?? ""}`.trim() || "?",
        ia_divergences: iaDivs.length,
        pharma_divergences: goldDivs.length,
        tp, fp, fn,
        precision: m.precision, recall: m.recall, f1: m.f1,
        ia_triage_complexe: iaTriage,
        pharma_triage_complexe: pharmaTriage,
        ml_triage_complexe: mlTriage,
        ml_triage_score: ml.score,
      });
    }

    const metricsIA = {
      patients: perPatient.length,
      patients_with_gold: perPatient.filter((p) => p.pharma_divergences > 0 || p.pharma_triage_complexe !== null).length,
      ...f1(totals.tp, totals.fp, totals.fn),
      tp: totals.tp, fp: totals.fp, fn: totals.fn,
      par_type: byType,
      triage_ia: { ...triageIA, ...f1(triageIA.tp, triageIA.fp, triageIA.fn) },
      severity_llm_accuracy: sevPairs === 0 ? null : sevLLMcorrect / sevPairs,
      severity_pairs: sevPairs,
    };

    const metricsML = {
      triage_ml: { ...triageML, ...f1(triageML.tp, triageML.fp, triageML.fn) },
      severity_ml_accuracy: sevPairs === 0 ? null : sevMLcorrect / sevPairs,
    };

    // Persist
    const { error: insErr } = await supabase
      .from("cohort_evaluations")
      .insert({
        cohort_id: data.cohortId,
        metrics_ia: metricsIA as never,
        metrics_ml: metricsML as never,
        per_patient: perPatient as never,
        computed_by: userId,
      } as never);
    if (insErr) console.warn("evaluateCohort persist failed:", insErr.message);

    return { metricsIA, metricsML, perPatient };
  });

export type EvaluateCohortResult = Awaited<ReturnType<typeof evaluateCohort>>;
