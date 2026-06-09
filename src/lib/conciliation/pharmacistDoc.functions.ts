import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const BUCKET = "ordonnances";

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

    // Télécharger le PDF
    const { data: file, error: dlErr } = await supabase.storage.from(BUCKET).download(doc.storage_path);
    if (dlErr || !file) throw new Error("Impossible de lire le PDF.");
    const buf = new Uint8Array(await file.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    const base64 = btoa(bin);

    const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
    const { generateText } = await import("ai");
    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-3-flash-preview");

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

    let result;
    try {
      result = await generateText({
        model,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: `Analyse IA (JSON) :\n${JSON.stringify(analysis.payload)}\n\nDocument PDF du pharmacien ci-joint.` },
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

    const raw = result.text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
    let payload: ComparisonPayload;
    try {
      payload = JSON.parse(raw);
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
