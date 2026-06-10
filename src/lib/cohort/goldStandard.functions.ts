import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const UploadInput = z.object({
  patientId: z.string().uuid(),
  episodeId: z.string().uuid().optional().nullable(),
  cohortId: z.string().uuid().optional().nullable(),
  fileBase64: z.string().min(10),
  mimeType: z.string().min(3).max(100),
  fileName: z.string().min(1).max(255),
});

const DivergenceSchema = z.object({
  medicament: z.string(),
  type: z.enum(["omission", "ajout", "modification", "substitution", "autre"]).default("autre"),
  severite: z.enum(["mineure", "moderee", "majeure", "critique"]).optional().nullable(),
  commentaire: z.string().optional().nullable(),
});

const ExtractedSchema = z.object({
  patient: z
    .object({
      nom: z.string().optional().nullable(),
      prenom: z.string().optional().nullable(),
      date_naissance: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
  triage_complexe: z.boolean().optional().nullable(),
  divergences: z.array(DivergenceSchema).default([]),
});

export type GoldStandardExtracted = z.infer<typeof ExtractedSchema>;

export const uploadPharmacistGoldStandard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UploadInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY manquante");

    // 1) Upload file to storage
    const bin = Uint8Array.from(atob(data.fileBase64), (c) => c.charCodeAt(0));
    const hashBuf = await crypto.subtle.digest("SHA-256", bin);
    const hashHex = Array.from(new Uint8Array(hashBuf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const safeName = data.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
    const storagePath = `${userId}/${data.patientId}/gold_${hashHex.slice(0, 16)}_${safeName}`;
    const { error: upErr } = await supabase.storage
      .from("ordonnances")
      .upload(storagePath, bin, { contentType: data.mimeType, upsert: true });
    if (upErr) throw new Error(`Upload échoué: ${upErr.message}`);

    // 2) Extract gold standard JSON via LLM
    const { generateText } = await import("ai");
    const { resolveAITask } = await import("@/lib/ai/runAITask.server");
    const systemPrompt = `Tu es un assistant pharmacien expert. Analyse ce document de conciliation médicamenteuse rédigé par un pharmacien hospitalier (référence "gold standard").
Réponds STRICTEMENT en JSON valide selon ce schéma :
{
  "patient": { "nom":"...", "prenom":"...", "date_naissance":"YYYY-MM-DD" },
  "triage_complexe": true | false,
  "divergences": [
    {
      "medicament": "DCI ou nom commercial",
      "type": "omission" | "ajout" | "modification" | "substitution" | "autre",
      "severite": "mineure" | "moderee" | "majeure" | "critique",
      "commentaire": "explication courte"
    }
  ]
}
RÈGLES :
- "triage_complexe" = true si le pharmacien considère le patient comme complexe (polymédication, IR, sujet âgé, anticoagulants…), sinon false.
- "omission" = traitement habituel non represcrit à l'hôpital.
- "ajout" = médicament prescrit à l'hôpital mais absent en ville.
- "modification" = dose / fréquence / voie modifiée.
- "substitution" = remplacement par un équivalent.
- N'invente jamais. Renvoie [] si pas de divergence.
- Réponds UNIQUEMENT le JSON, sans markdown ni texte autour.`;

    const { model, systemPrompt: sysP, callOptions } = await resolveAITask("pharmacist_gold_extract", {
      systemPrompt,
      model: "google/gemini-3-flash-preview",
    });

    const result = await generateText({
      ...callOptions,
      model,
      system: sysP,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Analyse ce document de conciliation pharmacien et extrais les données." },
            { type: "file", data: `data:${data.mimeType};base64,${data.fileBase64}`, mediaType: data.mimeType },
          ],
        },
      ],
    });

    const { parseLlmJson } = await import("@/lib/llm/parseLlmJson");
    let parsed: unknown;
    try {
      parsed = parseLlmJson(result.text);
    } catch {
      throw new Error("Réponse IA non valide pour le document pharmacien.");
    }
    const extracted = ExtractedSchema.parse(parsed);

    // 3) Persist
    const { data: row, error: insErr } = await supabase
      .from("pharmacist_gold_standards")
      .insert({
        patient_id: data.patientId,
        episode_id: data.episodeId ?? null,
        cohort_id: data.cohortId ?? null,
        storage_path: storagePath,
        file_name: data.fileName,
        mime_type: data.mimeType,
        extracted_json: extracted as never,
        triage_complexe: extracted.triage_complexe ?? null,
        nb_divergences: extracted.divergences.length,
        uploaded_by: userId,
      } as never)
      .select("*")
      .single();
    if (insErr) throw new Error(insErr.message);

    return { ok: true, gold: row, extracted };
  });

const ListInput = z.object({ cohortId: z.string().uuid() });
export const listCohortGoldStandards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ListInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("pharmacist_gold_standards")
      .select("*")
      .eq("cohort_id", data.cohortId);
    return { gold: rows ?? [] };
  });
