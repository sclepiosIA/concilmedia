import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const STEPS = [
  "open_patient", "open_episode", "recueil_atcd", "recueil_traitements",
  "comparaison", "analyse_ia", "validation", "cloture",
] as const;

const LogInput = z.object({
  step: z.enum(STEPS),
  kind: z.enum(["enter", "exit", "heartbeat", "action"]),
  episodeId: z.string().uuid().optional(),
  patientId: z.string().uuid().optional(),
  durationMs: z.number().int().min(0).max(8 * 60 * 60 * 1000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const logConciliationEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => LogInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let organization_id: string | null = null;
    if (data.patientId) {
      const { data: pat } = await supabase
        .from("patients").select("organization_id").eq("id", data.patientId).maybeSingle();
      organization_id = pat?.organization_id ?? null;
    } else if (data.episodeId) {
      const { data: ep } = await supabase
        .from("episodes").select("patient_id").eq("id", data.episodeId).maybeSingle();
      if (ep?.patient_id) {
        const { data: pat } = await supabase
          .from("patients").select("organization_id").eq("id", ep.patient_id).maybeSingle();
        organization_id = pat?.organization_id ?? null;
      }
    }
    const { error } = await supabase.from("conciliation_events").insert({
      user_id: userId,
      step: data.step,
      kind: data.kind,
      episode_id: data.episodeId ?? null,
      patient_id: data.patientId ?? null,
      organization_id,
      duration_ms: data.durationMs ?? null,
      metadata: (data.metadata ?? {}) as Record<string, unknown>,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const MetricsInput = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  organizationId: z.string().uuid().optional(),
});

interface ByStep { step: string; count: number; p10: number; p50: number; p90: number; total_ms: number }
interface ByUser { user_id: string; episodes: number; total_ms: number; median_ms: number }
interface VolumeDay { day: string; episodes: number; validations: number }
interface IaImpact { with_ia: { count: number; median_ms: number }; without_ia: { count: number; median_ms: number } }

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.floor((p / 100) * s.length)));
  return s[idx];
}

export const getConciliationMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => MetricsInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const from = data.from ?? new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const to = data.to ?? new Date().toISOString();

    let q = supabase
      .from("conciliation_events")
      .select("step, kind, duration_ms, user_id, episode_id, occurred_at, metadata, organization_id")
      .gte("occurred_at", from).lte("occurred_at", to)
      .limit(50000);
    if (data.organizationId) q = q.eq("organization_id", data.organizationId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const events = rows ?? [];

    // Par étape : on calcule sur les events 'exit' avec duration_ms
    const durByStep = new Map<string, number[]>();
    for (const e of events) {
      if (e.kind !== "exit" && e.kind !== "action") continue;
      const d = e.duration_ms;
      if (!d || d <= 0) continue;
      const arr = durByStep.get(e.step) ?? [];
      arr.push(d);
      durByStep.set(e.step, arr);
    }
    const byStep: ByStep[] = Array.from(durByStep.entries()).map(([step, arr]) => ({
      step, count: arr.length,
      p10: percentile(arr, 10), p50: percentile(arr, 50), p90: percentile(arr, 90),
      total_ms: arr.reduce((s, v) => s + v, 0),
    })).sort((a, b) => a.step.localeCompare(b.step));

    // Par user : somme des durations
    const durByUser = new Map<string, { episodes: Set<string>; arr: number[] }>();
    for (const e of events) {
      if (e.kind !== "exit" && e.kind !== "action") continue;
      const cur = durByUser.get(e.user_id) ?? { episodes: new Set<string>(), arr: [] };
      if (e.episode_id) cur.episodes.add(e.episode_id);
      if (e.duration_ms && e.duration_ms > 0) cur.arr.push(e.duration_ms);
      durByUser.set(e.user_id, cur);
    }
    const byUser: ByUser[] = Array.from(durByUser.entries()).map(([user_id, v]) => ({
      user_id, episodes: v.episodes.size,
      total_ms: v.arr.reduce((s, n) => s + n, 0),
      median_ms: percentile(v.arr, 50),
    })).sort((a, b) => b.total_ms - a.total_ms);

    // Volume par jour
    const volMap = new Map<string, { episodes: Set<string>; validations: number }>();
    for (const e of events) {
      const day = e.occurred_at.slice(0, 10);
      const cur = volMap.get(day) ?? { episodes: new Set<string>(), validations: 0 };
      if (e.episode_id) cur.episodes.add(e.episode_id);
      if (e.step === "validation" && e.kind === "action") cur.validations++;
      volMap.set(day, cur);
    }
    const volumeByDay: VolumeDay[] = Array.from(volMap.entries()).map(([day, v]) => ({
      day, episodes: v.episodes.size, validations: v.validations,
    })).sort((a, b) => a.day.localeCompare(b.day));

    // IA impact : épisodes avec au moins un event analyse_ia vs sans
    const epHasIa = new Set<string>();
    const epDur = new Map<string, number>();
    for (const e of events) {
      if (!e.episode_id) continue;
      if (e.step === "analyse_ia") epHasIa.add(e.episode_id);
      if ((e.kind === "exit" || e.kind === "action") && e.duration_ms) {
        epDur.set(e.episode_id, (epDur.get(e.episode_id) ?? 0) + e.duration_ms);
      }
    }
    const withArr: number[] = [], withoutArr: number[] = [];
    for (const [ep, d] of epDur) (epHasIa.has(ep) ? withArr : withoutArr).push(d);
    const iaImpact: IaImpact = {
      with_ia: { count: withArr.length, median_ms: percentile(withArr, 50) },
      without_ia: { count: withoutArr.length, median_ms: percentile(withoutArr, 50) },
    };

    return { from, to, byStep, byUser, volumeByDay, iaImpact, totalEvents: events.length };
  });
