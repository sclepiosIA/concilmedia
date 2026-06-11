// Piste #15 — Exécute un dataset d'évaluation sur un ou plusieurs modèles.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { scoreDniSet, aggregate } from "@/lib/eval/metrics";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

const DNI_SYSTEM = `Tu es un assistant pharmaceutique. À partir des prescriptions fournies (entrée vs sortie), identifie les divergences non intentionnelles (DNI). Réponds en JSON strict de la forme : {"dnis":[{"medicament":"NOM","type_divergence":"omission|ajout|modification_dose|modification_freq|duplication"}]}. Pas de texte hors JSON.`;

function tryParseJson(text: string): { dnis: { medicament: string; type_divergence: string }[] } {
  // Cherche un objet JSON dans le texte
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < 0) return { dnis: [] };
  try {
    const obj = JSON.parse(raw.slice(start, end + 1));
    if (Array.isArray(obj?.dnis)) return obj;
  } catch {
    /* ignore */
  }
  return { dnis: [] };
}

export const runEvaluation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        datasetId: z.string().uuid(),
        models: z
          .array(
            z.object({
              providerName: z.string().min(1),
              modelId: z.string().min(1),
              providerId: z.string().uuid().nullable().optional(),
            }),
          )
          .min(1)
          .max(5),
        maxItems: z.number().int().min(1).max(50).default(20),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { resolveAITaskWithOverride } = await import("@/lib/ai/runAITask.server");

    // Charge dataset + items
    const { data: ds, error: dsErr } = await supabaseAdmin
      .from("eval_datasets")
      .select("id, slug, task_slug")
      .eq("id", data.datasetId)
      .maybeSingle();
    if (dsErr) throw new Error(dsErr.message);
    if (!ds) throw new Error("Dataset introuvable");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: items } = await (supabaseAdmin
      .from("eval_dataset_items") as any)
      .select("id, input, expected, weight")
      .eq("dataset_id", data.datasetId)
      .limit(data.maxItems);

    const dsItems = (items ?? []) as Array<{
      id: string;
      input: Record<string, unknown>;
      expected: { dnis?: { medicament: string; type_divergence: string }[] };
      weight: number;
    }>;

    if (dsItems.length === 0) throw new Error("Dataset vide");

    const runIds: string[] = [];

    for (const m of data.models) {
      // Crée un run
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: run, error: runErr } = await (supabaseAdmin.from("eval_runs") as any)
        .insert({
          dataset_id: data.datasetId,
          task_slug: ds.task_slug,
          provider_id: m.providerId ?? null,
          model: m.modelId,
          status: "running",
          n_items: dsItems.length,
          triggered_by: userId,
        })
        .select("id")
        .single();
      if (runErr || !run) {
        console.error("[eval] create run failed", runErr);
        continue;
      }
      const runId = run.id as string;
      runIds.push(runId);

      let resolved;
      try {
        resolved = await resolveAITaskWithOverride(
          { systemPrompt: DNI_SYSTEM, model: m.modelId, providerKind: "lovable" },
          { providerName: m.providerName, modelId: m.modelId },
        );
      } catch (e: unknown) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabaseAdmin.from("eval_runs") as any)
          .update({
            status: "failed",
            finished_at: new Date().toISOString(),
            metrics: { error: e instanceof Error ? e.message : String(e) },
          })
          .eq("id", runId);
        continue;
      }

      const f1s: number[] = [];
      const lats: number[] = [];
      let nOk = 0;
      let nFail = 0;
      let totalTokens = 0;

      for (const it of dsItems) {
        const t0 = Date.now();
        try {
          const prompt = JSON.stringify(it.input);
          const result = await generateText({
            ...resolved.callOptions,
            model: resolved.model,
            system: resolved.systemPrompt,
            prompt,
          });
          const latency = Date.now() - t0;
          const parsed = tryParseJson(result.text);
          const expected = it.expected.dnis ?? [];
          const metric = scoreDniSet(expected, parsed.dnis);
          f1s.push(metric.score);
          lats.push(latency);
          const tIn = result.usage?.inputTokens ?? 0;
          const tOut = result.usage?.outputTokens ?? 0;
          totalTokens += tIn + tOut;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabaseAdmin.from("eval_run_items") as any).insert({
            run_id: runId,
            dataset_item_id: it.id,
            output: parsed as unknown as Record<string, unknown>,
            score: metric as unknown as Record<string, unknown>,
            latency_ms: latency,
            tokens_in: tIn,
            tokens_out: tOut,
          });
          nOk += 1;
        } catch (e: unknown) {
          nFail += 1;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabaseAdmin.from("eval_run_items") as any).insert({
            run_id: runId,
            dataset_item_id: it.id,
            error: e instanceof Error ? e.message : String(e),
            latency_ms: Date.now() - t0,
          });
        }
      }

      const f1Agg = aggregate(f1s);
      const latAgg = aggregate(lats);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabaseAdmin.from("eval_runs") as any)
        .update({
          status: nFail === dsItems.length ? "failed" : "succeeded",
          finished_at: new Date().toISOString(),
          n_ok: nOk,
          n_fail: nFail,
          total_tokens: totalTokens,
          metrics: {
            f1_mean: f1Agg.mean,
            f1_p50: f1Agg.p50,
            latency_p50_ms: latAgg.p50,
            latency_p95_ms: latAgg.p95,
          },
        })
        .eq("id", runId);

      await supabase.rpc("append_audit_log", {
        _action: "eval_run_execute",
        _entity_type: "eval_run",
        _entity_id: runId,
        _payload: {
          task_slug: ds.task_slug,
          model: m.modelId,
          n_items: dsItems.length,
          f1_mean: f1Agg.mean,
        },
      });
    }

    return { runIds, count: runIds.length };
  });

export const listRuns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        taskSlug: z.string().optional(),
        model: z.string().optional(),
        datasetId: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(200).default(50),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    let q = supabase
      .from("eval_runs")
      .select(
        "id, dataset_id, task_slug, model, status, started_at, finished_at, n_items, n_ok, n_fail, metrics, total_tokens, cost_eur",
      )
      .order("started_at", { ascending: false })
      .limit(data.limit);
    if (data.taskSlug) q = q.eq("task_slug", data.taskSlug);
    if (data.model) q = q.eq("model", data.model);
    if (data.datasetId) q = q.eq("dataset_id", data.datasetId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getRunDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ runId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data: run, error } = await supabase
      .from("eval_runs")
      .select("*")
      .eq("id", data.runId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: items } = await (supabase.from("eval_run_items") as any)
      .select("id, dataset_item_id, output, score, latency_ms, tokens_in, tokens_out, error")
      .eq("run_id", data.runId)
      .order("created_at", { ascending: true })
      .limit(200);
    return { run, items: items ?? [] };
  });

export const compareToBaseline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ runId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data: run } = await supabase
      .from("eval_runs")
      .select("id, dataset_id, task_slug, model, metrics, started_at")
      .eq("id", data.runId)
      .maybeSingle();
    if (!run) throw new Error("Run introuvable");
    // Baseline = run précédent même dataset+task, autre run
    const { data: baseline } = await supabase
      .from("eval_runs")
      .select("id, model, metrics, started_at")
      .eq("dataset_id", run.dataset_id)
      .eq("task_slug", run.task_slug)
      .neq("id", run.id)
      .eq("status", "succeeded")
      .lt("started_at", run.started_at)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!baseline) return { run, baseline: null, regression: false };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m1 = (run.metrics ?? {}) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m0 = (baseline.metrics ?? {}) as any;
    const dF1 = (m1.f1_mean ?? 0) - (m0.f1_mean ?? 0);
    const dP95 = (m1.latency_p95_ms ?? 0) - (m0.latency_p95_ms ?? 0);
    const regression = dF1 < -0.05 || dP95 > (m0.latency_p95_ms ?? 0) * 0.3;
    if (regression) {
      await supabase.rpc("append_audit_log", {
        _action: "eval_regression_detected",
        _entity_type: "eval_run",
        _entity_id: data.runId,
        _payload: { delta_f1: dF1, delta_p95_ms: dP95, baseline_run: baseline.id },
      });
    }
    return { run, baseline, regression, delta: { f1: dF1, p95_ms: dP95 } };
  });
