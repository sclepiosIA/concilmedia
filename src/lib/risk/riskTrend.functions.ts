// Piste #11 — Score de risque iatrogène longitudinal.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";

export type RiskNiveau = "faible" | "modere" | "modéré" | "eleve" | "élevé";

export interface RiskTrendPoint {
  episode_id: string;
  date: string; // ISO computed_at OR date_entree fallback
  date_entree: string | null;
  service: string | null;
  motif: string | null;
  score: number;
  niveau: string;
  delta_vs_precedent: number | null;
  niveau_rank: number;
  niveau_rank_delta: number | null;
  variables: Json | null;
}

function rankNiveau(n: string | null | undefined): number {
  const s = (n ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (s.startsWith("elev") || s === "high") return 3;
  if (s.startsWith("moder") || s === "medium") return 2;
  if (s.startsWith("faib") || s === "low") return 1;
  return 0;
}

export const getPatientRiskTrend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ patientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ points: RiskTrendPoint[] }> => {
    const { supabase } = context;
    const { data: episodes, error: e1 } = await supabase
      .from("episodes")
      .select("id, date_entree, service, motif")
      .eq("patient_id", data.patientId);
    if (e1) throw e1;
    const epIds = (episodes ?? []).map((e) => e.id);
    if (epIds.length === 0) return { points: [] };

    const { data: scores, error: e2 } = await supabase
      .from("risk_scores")
      .select("episode_id, score, niveau, variables, computed_at")
      .in("episode_id", epIds)
      .order("computed_at", { ascending: true });
    if (e2) throw e2;

    // Garde le score le plus récent par épisode
    const byEp = new Map<string, { score: number; niveau: string; variables: unknown; computed_at: string }>();
    for (const s of scores ?? []) {
      byEp.set(s.episode_id as string, {
        score: Number(s.score ?? 0),
        niveau: String(s.niveau ?? ""),
        variables: s.variables,
        computed_at: s.computed_at as string,
      });
    }

    const epById = new Map((episodes ?? []).map((e) => [e.id, e] as const));
    const merged: RiskTrendPoint[] = [];
    for (const [epId, s] of byEp.entries()) {
      const ep = epById.get(epId);
      merged.push({
        episode_id: epId,
        date: s.computed_at,
        date_entree: ep?.date_entree ?? null,
        service: ep?.service ?? null,
        motif: ep?.motif ?? null,
        score: s.score,
        niveau: s.niveau,
        delta_vs_precedent: null,
        niveau_rank: rankNiveau(s.niveau),
        niveau_rank_delta: null,
        variables: (s.variables as Record<string, unknown> | null) ?? null,
      });
    }
    merged.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    for (let i = 1; i < merged.length; i++) {
      merged[i].delta_vs_precedent = merged[i].score - merged[i - 1].score;
      merged[i].niveau_rank_delta = merged[i].niveau_rank - merged[i - 1].niveau_rank;
    }
    return { points: merged };
  });

export interface RiskAlertItem {
  patient_id: string;
  episode_id: string;
  date: string;
  service: string | null;
  score: number;
  delta: number;
  niveau: string;
  niveau_rank_delta: number;
  patient_nom: string | null;
  patient_prenom: string | null;
}

export const getRiskAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        patientId: z.string().uuid().optional(),
        periodDays: z.number().int().min(1).max(3650).default(365),
        minDelta: z.number().int().min(1).max(100).default(3),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ alerts: RiskAlertItem[] }> => {
    const { supabase } = context;
    const since = new Date(Date.now() - data.periodDays * 86400000).toISOString();
    let epQ = supabase
      .from("episodes")
      .select("id, patient_id, date_entree, service, patients(nom, prenom)");
    if (data.patientId) epQ = epQ.eq("patient_id", data.patientId);
    const { data: episodes, error: e1 } = await epQ;
    if (e1) throw e1;
    const epIds = (episodes ?? []).map((e) => e.id);
    if (epIds.length === 0) return { alerts: [] };

    const { data: scores, error: e2 } = await supabase
      .from("risk_scores")
      .select("episode_id, score, niveau, computed_at")
      .in("episode_id", epIds)
      .gte("computed_at", since)
      .order("computed_at", { ascending: true });
    if (e2) throw e2;

    // par patient → série
    const epToPat = new Map((episodes ?? []).map((e) => [e.id, e] as const));
    type Row = { ep: (typeof episodes)[number]; score: number; niveau: string; date: string };
    const byPatient = new Map<string, Row[]>();
    for (const s of scores ?? []) {
      const ep = epToPat.get(s.episode_id as string);
      if (!ep) continue;
      const arr = byPatient.get(ep.patient_id) ?? [];
      arr.push({ ep, score: Number(s.score ?? 0), niveau: String(s.niveau ?? ""), date: s.computed_at as string });
      byPatient.set(ep.patient_id, arr);
    }

    const alerts: RiskAlertItem[] = [];
    for (const rows of byPatient.values()) {
      rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      for (let i = 1; i < rows.length; i++) {
        const delta = rows[i].score - rows[i - 1].score;
        const rDelta = rankNiveau(rows[i].niveau) - rankNiveau(rows[i - 1].niveau);
        if (delta >= data.minDelta || rDelta >= 1) {
          const ep = rows[i].ep as unknown as {
            id: string;
            patient_id: string;
            service: string | null;
            patients: { nom: string | null; prenom: string | null } | null;
          };
          alerts.push({
            patient_id: ep.patient_id,
            episode_id: ep.id,
            date: rows[i].date,
            service: ep.service,
            score: rows[i].score,
            delta,
            niveau: rows[i].niveau,
            niveau_rank_delta: rDelta,
            patient_nom: ep.patients?.nom ?? null,
            patient_prenom: ep.patients?.prenom ?? null,
          });
        }
      }
    }
    alerts.sort((a, b) => b.delta - a.delta);
    return { alerts };
  });

export interface PopulationStats {
  patients_total: number;
  patients_with_score: number;
  score_moyen: number;
  distribution: { faible: number; modere: number; eleve: number; autre: number };
  pct_aggrave: number;
  top_services: { service: string; nb: number; score_moyen: number }[];
  top_aggraves: RiskAlertItem[];
}

export const getPopulationRiskStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ periodDays: z.number().int().min(1).max(3650).default(90) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<PopulationStats> => {
    const { supabase } = context;
    const since = new Date(Date.now() - data.periodDays * 86400000).toISOString();
    const { data: episodes } = await supabase
      .from("episodes")
      .select("id, patient_id, service, date_entree, patients(nom, prenom)");
    const eps = episodes ?? [];
    const epIds = eps.map((e) => e.id);
    if (epIds.length === 0) {
      return {
        patients_total: 0,
        patients_with_score: 0,
        score_moyen: 0,
        distribution: { faible: 0, modere: 0, eleve: 0, autre: 0 },
        pct_aggrave: 0,
        top_services: [],
        top_aggraves: [],
      };
    }
    const { data: scores } = await supabase
      .from("risk_scores")
      .select("episode_id, score, niveau, computed_at")
      .in("episode_id", epIds)
      .gte("computed_at", since)
      .order("computed_at", { ascending: true });

    // Dernier score par patient + série pour détecter aggravation
    const epToPat = new Map(eps.map((e) => [e.id, e] as const));
    const seriesByPat = new Map<string, { score: number; niveau: string; date: string; service: string | null }[]>();
    for (const s of scores ?? []) {
      const ep = epToPat.get(s.episode_id as string);
      if (!ep) continue;
      const arr = seriesByPat.get(ep.patient_id) ?? [];
      arr.push({
        score: Number(s.score ?? 0),
        niveau: String(s.niveau ?? ""),
        date: s.computed_at as string,
        service: ep.service ?? null,
      });
      seriesByPat.set(ep.patient_id, arr);
    }

    const dist = { faible: 0, modere: 0, eleve: 0, autre: 0 };
    let sumLast = 0;
    let aggraves = 0;
    const svcAgg = new Map<string, { sum: number; n: number }>();
    for (const [, arr] of seriesByPat) {
      arr.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const last = arr[arr.length - 1];
      sumLast += last.score;
      const r = rankNiveau(last.niveau);
      if (r === 1) dist.faible++;
      else if (r === 2) dist.modere++;
      else if (r === 3) dist.eleve++;
      else dist.autre++;
      if (arr.length >= 2) {
        const prev = arr[arr.length - 2];
        if (last.score - prev.score >= 3 || rankNiveau(last.niveau) - rankNiveau(prev.niveau) >= 1) aggraves++;
      }
      const svc = last.service ?? "—";
      const cur = svcAgg.get(svc) ?? { sum: 0, n: 0 };
      cur.sum += last.score;
      cur.n += 1;
      svcAgg.set(svc, cur);
    }

    const patientsWithScore = seriesByPat.size;
    const top_services = Array.from(svcAgg.entries())
      .map(([service, v]) => ({ service, nb: v.n, score_moyen: Math.round((v.sum / v.n) * 10) / 10 }))
      .sort((a, b) => b.score_moyen - a.score_moyen)
      .slice(0, 8);

    const { alerts } = await getRiskAlerts({
      data: { periodDays: data.periodDays, minDelta: 3 },
    });
    const top_aggraves = alerts.slice(0, 10);

    const patientsTotal = new Set(eps.map((e) => e.patient_id)).size;
    return {
      patients_total: patientsTotal,
      patients_with_score: patientsWithScore,
      score_moyen: patientsWithScore ? Math.round((sumLast / patientsWithScore) * 10) / 10 : 0,
      distribution: dist,
      pct_aggrave: patientsWithScore ? Math.round((aggraves / patientsWithScore) * 100) : 0,
      top_services,
      top_aggraves,
    };
  });
