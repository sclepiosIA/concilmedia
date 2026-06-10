import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const BUCKET = "ordonnances";

// Map AI payload array keys → ItemDecision category names.
const CATEGORY_TO_PAYLOAD_KEY: Record<string, string> = {
  interactions: "interactions",
  contre_indications: "contre_indications",
  adaptations_posologiques: "adaptations_posologiques",
  doublons_therapeutiques: "doublons_therapeutiques",
  allergies_croisees: "allergies_croisees",
  medicaments_haut_risque: "medicaments_haut_risque",
  divergences_conciliation: "divergences_conciliation",
};

/**
 * Returns a deep-cloned payload with pharmacist overrides applied per item,
 * plus a `_pharmacist_status` and `_pharmacist_comment` per item if a decision exists.
 * Rejected items are filtered out so the comparison doesn't surface them.
 */
function applyPharmacistOverrides(
  payload: Record<string, unknown>,
  decisions: Array<{
    category: string;
    index: number;
    status: "accepted" | "rejected" | "modified";
    comment?: string;
    modification?: string;
    overrides?: Record<string, string | undefined>;
  }>,
): Record<string, unknown> {
  const clone: Record<string, unknown> = JSON.parse(JSON.stringify(payload ?? {}));
  if (!Array.isArray(decisions) || decisions.length === 0) return clone;

  const byCat: Record<string, typeof decisions> = {};
  for (const d of decisions) {
    if (!d || typeof d !== "object") continue;
    (byCat[d.category] ||= []).push(d);
  }

  for (const [cat, list] of Object.entries(byCat)) {
    const key = CATEGORY_TO_PAYLOAD_KEY[cat];
    if (!key) continue;
    const arr = clone[key];
    if (!Array.isArray(arr)) continue;
    // Apply overrides on a per-index basis.
    for (const d of list) {
      const item = arr[d.index] as Record<string, unknown> | undefined;
      if (!item || typeof item !== "object") continue;
      if (d.overrides) {
        for (const [k, v] of Object.entries(d.overrides)) {
          if (v !== undefined && v !== "") item[k] = v;
        }
      }
      item._pharmacist_status = d.status;
      if (d.comment) item._pharmacist_comment = d.comment;
      if (d.modification) item._pharmacist_modification = d.modification;
    }
    // Filter out rejected items.
    clone[key] = arr.filter((_, i) => {
      const d = list.find((x) => x.index === i);
      return !d || d.status !== "rejected";
    });
  }

  return clone;
}


const UploadInput = z.object({
  analysisId: z.string().uuid(),
  patientId: z.string().uuid(),
  episodeId: z.string().uuid().nullable().optional(),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
  base64: z.string().min(1).max(15_000_000), // ~11 Mo binaire
});

export const uploadPharmacistDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UploadInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.mimeType !== "application/pdf") throw new Error("Seuls les PDF sont acceptés.");
    const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    if (bytes.byteLength > 10 * 1024 * 1024) throw new Error("Fichier trop volumineux (max 10 Mo).");

    const safeName = data.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storage_path = `${userId}/pharmacist-validation/${data.patientId}/${data.analysisId}-${Date.now()}-${safeName}`;

    // Supprimer un éventuel précédent
    const { data: existing } = await supabase
      .from("pharmacist_conciliation_documents")
      .select("storage_path")
      .eq("analysis_id", data.analysisId)
      .maybeSingle();
    if (existing?.storage_path) {
      await supabase.storage.from(BUCKET).remove([existing.storage_path]);
    }

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(storage_path, bytes, { contentType: data.mimeType, upsert: true });
    if (upErr) throw new Error(`Upload échoué : ${upErr.message}`);

    const row = {
      analysis_id: data.analysisId,
      patient_id: data.patientId,
      episode_id: data.episodeId ?? null,
      storage_path,
      file_name: data.fileName,
      mime_type: data.mimeType,
      file_size: bytes.byteLength,
      uploaded_by: userId,
      uploaded_at: new Date().toISOString(),
      comparison_payload: null,
      compared_at: null,
    };
    const { data: result, error } = await supabase
      .from("pharmacist_conciliation_documents")
      .upsert(row, { onConflict: "analysis_id" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return result;
  });

const GetInput = z.object({ analysisId: z.string().uuid() });

export const getPharmacistDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => GetInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("pharmacist_conciliation_documents")
      .select("*")
      .eq("analysis_id", data.analysisId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    const { data: signed } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(row.storage_path, 300);
    return { ...row, signedUrl: signed?.signedUrl ?? null };
  });

export const deletePharmacistDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => GetInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row } = await supabase
      .from("pharmacist_conciliation_documents")
      .select("storage_path")
      .eq("analysis_id", data.analysisId)
      .maybeSingle();
    if (row?.storage_path) await supabase.storage.from(BUCKET).remove([row.storage_path]);
    const { error } = await supabase
      .from("pharmacist_conciliation_documents")
      .delete()
      .eq("analysis_id", data.analysisId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type ComparisonPayload = {
  synthese: string;
  concordance_globale: number;
  divergences_pharmacien: Array<{ medicament: string; type: string; severite_pharmacien?: string; action?: string }>;
  matches: Array<{ medicament: string; statut: "concordant" | "ia_seulement" | "pharmacien_seulement" | "divergent"; commentaire?: string }>;
  points_manques_par_ia: string[];
  points_manques_par_pharmacien: string[];
  conclusion: string;
};

export const comparePharmacistVsAI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => GetInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY manquante");

    const { data: doc } = await supabase
      .from("pharmacist_conciliation_documents")
      .select("*")
      .eq("analysis_id", data.analysisId)
      .maybeSingle();
    if (!doc) throw new Error("Aucun document pharmacien uploadé.");

    const { data: analysis } = await supabase
      .from("conciliation_ai_analyses")
      .select("payload")
      .eq("id", data.analysisId)
      .maybeSingle();
    if (!analysis) throw new Error("Analyse IA introuvable.");

    // Merge pharmacist overrides into the AI payload so the comparison reflects
    // the validated/corrected version (not the raw IA output).
    const { data: validationRow } = await supabase
      .from("conciliation_validations")
      .select("item_decisions")
      .eq("analysis_id", data.analysisId)
      .maybeSingle();
    const mergedPayload = applyPharmacistOverrides(
      analysis.payload as Record<string, unknown>,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (validationRow?.item_decisions as any[] | null) ?? [],
    );

    // Télécharger le PDF
    const { data: file, error: dlErr } = await supabase.storage.from(BUCKET).download(doc.storage_path);
    if (dlErr || !file) throw new Error("Impossible de lire le PDF.");
    const buf = new Uint8Array(await file.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    const base64 = btoa(bin);

    const { generateText } = await import("ai");
    const { resolveAITask } = await import("@/lib/ai/runAITask.server");
    const __aiTaskSlug = "pharmacist_doc";
    const __aiDefaultModel = "google/gemini-3-flash-preview";

    const systemPrompt = `Tu es pharmacien clinicien expert en conciliation médicamenteuse.
On te fournit :
1) Le PDF de la conciliation validée par le pharmacien (liste manuelle des divergences entre traitement habituel et prescription hospitalière).
2) Le JSON de l'analyse de conciliation produite par l'IA.

Tâche : comparer les deux sources et produire STRICTEMENT un JSON valide avec cette structure :
{
  "synthese": "2-3 phrases résumant la cohérence globale",
  "concordance_globale": entier 0-100,
  "divergences_pharmacien": [{"medicament":"...","type":"omission|ajout|modification_dose|substitution|...","severite_pharmacien":"...","action":"..."}],
  "matches": [{"medicament":"...","statut":"concordant|ia_seulement|pharmacien_seulement|divergent","commentaire":"..."}],
  "points_manques_par_ia": ["divergences identifiées par le pharmacien mais non détectées par l'IA"],
  "points_manques_par_pharmacien": ["divergences détectées par l'IA mais non listées par le pharmacien"],
  "conclusion": "1-2 phrases — recommandation finale"
}
Réponds UNIQUEMENT avec le JSON, sans markdown.`;
    const { model, systemPrompt: __systemPrompt, callOptions } = await resolveAITask(__aiTaskSlug, { systemPrompt, model: __aiDefaultModel });

    let result;
    try {
      result = await generateText({
        ...callOptions,
        model,
        system: __systemPrompt,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: `Analyse IA (corrigée par le pharmacien si applicable) JSON :\n${JSON.stringify(mergedPayload)}\n\nDocument PDF du pharmacien ci-joint.` },
              { type: "file", data: base64, mediaType: "application/pdf", filename: doc.file_name },
            ],
          },
        ],
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("429")) throw new Error("Limite IA atteinte, réessayez dans quelques instants.");
      if (msg.includes("402")) throw new Error("Crédits IA épuisés.");
      throw e;
    }

    const { parseLlmJson } = await import("@/lib/llm/parseLlmJson");
    let payload: ComparisonPayload;
    try {
      payload = parseLlmJson<ComparisonPayload>(result.text);
    } catch {
      throw new Error("Réponse IA non parsable");
    }

    const { error: updErr } = await supabase
      .from("pharmacist_conciliation_documents")
      .update({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        comparison_payload: payload as any,
        compared_at: new Date().toISOString(),
      })
      .eq("analysis_id", data.analysisId);
    if (updErr) throw new Error(updErr.message);

    return payload;
  });
