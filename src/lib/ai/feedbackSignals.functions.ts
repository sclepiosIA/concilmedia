import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// ─── Types ──────────────────────────────────────────────────────────────────
type Decision = "accepted" | "rejected" | "modified";

type Category =
  | "interactions"
  | "contre_indications"
  | "adaptations_posologiques"
  | "doublons_therapeutiques"
  | "allergies_croisees"
  | "medicaments_haut_risque"
  | "divergences_conciliation"
  | "alertes_regles";

// ─── recordFeedbackSignals (appelé depuis saveConciliationValidation) ──────
const RecordInput = z.object({
  validationId: z.string().uuid(),
  analysisId: z.string().uuid(),
  patientId: z.string().uuid(),
});

export const recordFeedbackSignals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RecordInput.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Charger l'analyse + la validation
    const [{ data: analysis }, { data: validation }] = await Promise.all([
      supabaseAdmin
        .from("conciliation_ai_analyses")
        .select("id, payload, model")
        .eq("id", data.analysisId)
        .maybeSingle(),
      supabaseAdmin
        .from("conciliation_validations")
        .select("id, item_decisions")
        .eq("id", data.validationId)
        .maybeSingle(),
    ]);
    if (!analysis || !validation) return { ok: false, inserted: 0 };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = (analysis.payload as any) ?? {};
    const decisions =
      (validation.item_decisions as Array<{
        category: Category;
        index: number;
        status: Decision;
        comment?: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        overrides?: Record<string, any>;
      }> | null) ?? [];

    // Purger les signaux précédents (re-validation)
    await supabaseAdmin
      .from("ai_feedback_signals")
      .delete()
      .eq("validation_id", data.validationId);

    const rows = decisions.map((d) => {
      const items = (payload[d.category] as unknown[]) ?? [];
      const llmItem = (items[d.index] as Record<string, unknown> | undefined) ?? null;
      const overrides = d.overrides ?? {};
      const hadOverride = Object.keys(overrides).length > 0;
      const severityOriginal =
        (llmItem?.severite as string | undefined) ??
        (llmItem?.severity as string | undefined) ??
        null;
      const severityCorrected = (overrides.severite as string | undefined) ?? null;
      const humanItem = hadOverride ? { ...(llmItem ?? {}), ...overrides } : llmItem;

      return {
        analysis_id: data.analysisId,
        validation_id: data.validationId,
        patient_id: data.patientId,
        model: (analysis.model as string | null) ?? null,
        task_slug: "analyze",
        category: d.category,
        item_index: d.index,
        decision: d.status,
        severity_original: severityOriginal,
        severity_corrected: severityCorrected,
        had_override: hadOverride,
        comment: d.comment ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        llm_payload: (llmItem ?? null) as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        human_payload: (humanItem ?? null) as any,
        pharmacien_id: userId,
      };

    });

    if (rows.length === 0) return { ok: true, inserted: 0 };
    const { error } = await supabaseAdmin.from("ai_feedback_signals").insert(rows);
    if (error) {
      console.warn("[recordFeedbackSignals] insert failed:", error.message);
      return { ok: false, inserted: 0, error: error.message };
    }
    return { ok: true, inserted: rows.length };
  });

// ─── getFeedbackMetrics ─────────────────────────────────────────────────────
export const getFeedbackMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("ai_feedback_signals")
      .select("model, category, decision, llm_payload, comment, created_at")
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    const total = rows.length;
    const counts = { accepted: 0, rejected: 0, modified: 0 } as Record<Decision, number>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const byModel: Record<string, Record<Decision, number>> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const byCategory: Record<string, Record<Decision, number>> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rejectedPatterns = new Map<string, { count: number; sample: any; comments: string[] }>();

    for (const r of rows) {
      const d = r.decision as Decision;
      counts[d] = (counts[d] ?? 0) + 1;
      const m = (r.model as string) || "(inconnu)";
      const c = (r.category as string) || "(autre)";
      byModel[m] ??= { accepted: 0, rejected: 0, modified: 0 };
      byCategory[c] ??= { accepted: 0, rejected: 0, modified: 0 };
      byModel[m][d] = (byModel[m][d] ?? 0) + 1;
      byCategory[c][d] = (byCategory[c][d] ?? 0) + 1;

      if (d === "rejected" && r.llm_payload) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = r.llm_payload as any;
        const key = [
          c,
          p?.medicament || p?.medicament_ville || (Array.isArray(p?.medicaments) ? p.medicaments.join("+") : "") || p?.dci_1 || "",
          p?.dci_2 || "",
        ].filter(Boolean).join(" · ");
        const slot = rejectedPatterns.get(key) ?? { count: 0, sample: p, comments: [] };
        slot.count += 1;
        if (r.comment) slot.comments.push(String(r.comment).slice(0, 200));
        rejectedPatterns.set(key, slot);
      }
    }

    const topRejected = Array.from(rejectedPatterns.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 20)
      .map(([key, v]) => ({ pattern: key, count: v.count, sample: v.sample, comments: v.comments.slice(0, 3) }));

    return { total, counts, byModel, byCategory, topRejected };
  });

// ─── exportFeedbackDataset (JSONL) ──────────────────────────────────────────
export const exportFeedbackDataset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("ai_feedback_signals")
      .select("model, task_slug, category, decision, llm_payload, human_payload, comment, created_at")
      .order("created_at", { ascending: false })
      .limit(20000);
    if (error) throw new Error(error.message);

    const lines = (data ?? []).map((r) =>
      JSON.stringify({
        model: r.model,
        task: r.task_slug,
        category: r.category,
        decision: r.decision,
        llm_output: r.llm_payload,
        human_correction: r.human_payload,
        pharmacist_comment: r.comment,
        ts: r.created_at,
      }),
    );
    return { jsonl: lines.join("\n"), count: lines.length };
  });

// ─── getFeedbackExemplars (utilisé par runAITask) ───────────────────────────
// Retourne les patterns les plus rejetés/modifiés pour few-shot dynamique.
export async function getFeedbackExemplars(
  taskSlug: string,
  limit = 5,
): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("ai_feedback_signals")
    .select("category, decision, llm_payload, human_payload, comment")
    .eq("task_slug", taskSlug)
    .in("decision", ["rejected", "modified"])
    .order("created_at", { ascending: false })
    .limit(200);
  if (error || !data || data.length === 0) return null;

  // Regrouper par signature pour dédupliquer
  const seen = new Map<string, { count: number; row: typeof data[number] }>();
  for (const r of data) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = r.llm_payload as any;
    const sig = JSON.stringify([
      r.category,
      r.decision,
      p?.medicament || p?.medicament_ville || (Array.isArray(p?.medicaments) ? p.medicaments.join("+") : "") || p?.dci_1,
    ]);
    const slot = seen.get(sig) ?? { count: 0, row: r };
    slot.count += 1;
    seen.set(sig, slot);
  }
  const top = Array.from(seen.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
  if (top.length === 0) return null;

  const blocks = top.map((t, i) => {
    const verdict = t.row.decision === "rejected" ? "❌ ÉVITE ce type d'alerte" : "✏️ AJUSTE comme suit";
    return [
      `Exemple ${i + 1} (${t.row.category}, observé ${t.count}× en feedback pharmacien) — ${verdict} :`,
      `  Alerte LLM : ${JSON.stringify(t.row.llm_payload).slice(0, 400)}`,
      t.row.human_payload && t.row.decision === "modified"
        ? `  Correction pharmacien : ${JSON.stringify(t.row.human_payload).slice(0, 400)}`
        : "",
      t.row.comment ? `  Commentaire : ${String(t.row.comment).slice(0, 200)}` : "",
    ].filter(Boolean).join("\n");
  });
  return [
    "",
    "── Feedback pharmacien (corrections récurrentes à respecter) ──",
    ...blocks,
    "── Fin feedback ──",
    "",
  ].join("\n");
}
