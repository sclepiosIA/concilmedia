// Piste #15 — Server functions pour gérer les datasets d'évaluation.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

export const listDatasets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data, error } = await supabase
      .from("eval_datasets")
      .select("id, slug, task_slug, description, item_count, created_at, updated_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getDataset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data: ds, error } = await supabase
      .from("eval_datasets")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const { data: items, error: e2 } = await supabase
      .from("eval_dataset_items")
      .select("id, ref_type, ref_id, input, expected, weight")
      .eq("dataset_id", data.id)
      .limit(500);
    if (e2) throw new Error(e2.message);
    return { dataset: ds, items: items ?? [] };
  });

/**
 * Construit (ou rafraîchit) un dataset DNI à partir de `ground_truth_dnis`.
 * Un item = un épisode. input = liste meds (entrée vs sortie). expected = DNI attendus.
 */
export const buildDniDataset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ limit: z.number().int().min(1).max(500).default(100) }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Upsert dataset
    const slug = "dni-ground-truth";
    const { data: existing } = await supabaseAdmin
      .from("eval_datasets")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    let datasetId: string;
    if (existing) {
      datasetId = existing.id as string;
    } else {
      const { data: ins, error } = await supabaseAdmin
        .from("eval_datasets")
        .insert({
          slug,
          task_slug: "reconciliation_analysis",
          description: "Dataset DNI dérivé de ground_truth_dnis (1 item = 1 épisode).",
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      datasetId = ins.id as string;
    }

    // 2. Récupère ground truth groupé par épisode
    const { data: gt, error: gtErr } = await supabaseAdmin
      .from("ground_truth_dnis")
      .select("episode_id, medicament, type_divergence")
      .limit(data.limit * 10);
    if (gtErr) throw new Error(gtErr.message);

    const byEpisode = new Map<string, { medicament: string; type_divergence: string }[]>();
    for (const row of gt ?? []) {
      const eid = (row as { episode_id: string }).episode_id;
      const arr = byEpisode.get(eid) ?? [];
      arr.push({
        medicament: (row as { medicament: string }).medicament,
        type_divergence: (row as { type_divergence: string }).type_divergence,
      });
      byEpisode.set(eid, arr);
    }

    const episodeIds = Array.from(byEpisode.keys()).slice(0, data.limit);
    if (episodeIds.length === 0) {
      return { datasetId, inserted: 0, message: "Aucune vérité terrain DNI disponible." };
    }

    // 3. Pour chaque épisode, fetch meds (entrée + sortie) pour bâtir input
    const { data: meds, error: medErr } = await supabaseAdmin
      .from("conciliation_medicaments")
      .select("episode_id, phase, medication_domicile, medication_hospitalisation")
      .in("episode_id", episodeIds);
    if (medErr) throw new Error(medErr.message);

    const medsByEpisode = new Map<string, unknown[]>();
    for (const m of meds ?? []) {
      const eid = (m as { episode_id: string }).episode_id;
      const arr = medsByEpisode.get(eid) ?? [];
      arr.push(m);
      medsByEpisode.set(eid, arr);
    }

    let inserted = 0;
    for (const eid of episodeIds) {
      const expected = byEpisode.get(eid) ?? [];
      const input = {
        episode_id: eid,
        prescriptions: medsByEpisode.get(eid) ?? [],
      };
      const { error: upErr } = await supabaseAdmin
        .from("eval_dataset_items")
        .upsert(
          {
            dataset_id: datasetId,
            ref_type: "ground_truth_dni",
            ref_id: eid,
            input: input as unknown as Record<string, unknown>,
            expected: { dnis: expected } as unknown as Record<string, unknown>,
            weight: 1.0,
          },
          { onConflict: "dataset_id,ref_type,ref_id" },
        );
      if (!upErr) inserted += 1;
    }

    // 4. Met à jour le compteur
    const { count } = await supabaseAdmin
      .from("eval_dataset_items")
      .select("id", { count: "exact", head: true })
      .eq("dataset_id", datasetId);
    await supabaseAdmin
      .from("eval_datasets")
      .update({ item_count: count ?? 0 })
      .eq("id", datasetId);

    // 5. Audit
    await supabase.rpc("append_audit_log", {
      _action: "eval_dataset_build",
      _entity_type: "eval_dataset",
      _entity_id: datasetId,
      _payload: { slug, inserted, total: count ?? 0 },
    });

    return { datasetId, inserted, total: count ?? 0 };
  });
