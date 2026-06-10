import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({
  patientId: z.string().uuid(),
  fileBase64: z.string().min(10),
  mimeType: z.string(),
  fileName: z.string().optional(),
});

export interface ExtractedBioResult {
  parametre: string;
  valeur?: number | null;
  unite?: string | null;
  valeur_texte?: string | null;
  date_prelevement?: string | null;
}

export interface ExtractBiologieResult {
  date_prelevement?: string;
  results: ExtractedBioResult[];
  inserted: number;
}

export const extractBiologie = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }): Promise<ExtractBiologieResult> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY manquante");

    const { generateText } = await import("ai");
    const { resolveAITask } = await import("@/lib/ai/runAITask.server");
    const __aiTaskSlug = "extract_biologie";
    const __aiDefaultModel = "google/gemini-3-flash-preview";

    const systemPrompt = `Tu es un assistant biomédical expert en lecture de comptes-rendus de biologie médicale français.
Analyse le PDF / image et extrais tous les résultats biologiques.
Réponds STRICTEMENT en JSON valide selon ce schéma :
{
  "date_prelevement": "YYYY-MM-DD (date de prélèvement, optionnel)",
  "results": [
    {
      "parametre": "nom du paramètre (ex: 'Créatininémie', 'DFG', 'Kaliémie', 'INR', 'Hémoglobine', 'CRP', 'HbA1c'...)",
      "valeur": valeur numérique (nombre, sans unité),
      "unite": "unité (ex: 'µmol/L', 'mmol/L', 'g/dL', 'mL/min/1,73m²', '%')",
      "valeur_texte": "valeur textuelle si non numérique (optionnel)",
      "date_prelevement": "YYYY-MM-DD (si différent du global)"
    }
  ]
}
Règles :
- Privilégie les noms courts standards (DFG, créatinine, K, Na, Hb, INR, CRP, HbA1c, plaquettes...).
- Omets les champs inconnus.
- Ignore les commentaires, les valeurs de référence, les en-têtes.
- N'inclus que les résultats biologiques mesurés.
Réponds UNIQUEMENT avec le JSON.`;
    const { model, systemPrompt: __systemPrompt, callOptions } = await resolveAITask(__aiTaskSlug, { systemPrompt, model: __aiDefaultModel });

    const result = await generateText({
      ...callOptions,
      model,
      system: __systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Voici le compte-rendu de biologie à analyser." },
            {
              type: "file",
              data: `data:${data.mimeType};base64,${data.fileBase64}`,
              mediaType: data.mimeType,
            },
          ],
        },
      ],
    });

    const raw = result.text
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "");

    let parsed: { date_prelevement?: string; results: ExtractedBioResult[] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("Impossible d'analyser la réponse IA. Réessayez avec un PDF plus net.");
    }

    const results = Array.isArray(parsed.results) ? parsed.results : [];
    const globalDate = parsed.date_prelevement ?? null;

    const rows = results
      .filter((r) => r && r.parametre)
      .map((r) => ({
        patient_id: data.patientId,
        parametre: String(r.parametre),
        valeur: typeof r.valeur === "number" ? r.valeur : null,
        unite: r.unite ? String(r.unite) : null,
        valeur_texte: r.valeur_texte ? String(r.valeur_texte) : null,
        date_prelevement: r.date_prelevement ?? globalDate ?? null,
        source: "pdf_import",
      }));

    let inserted = 0;
    if (rows.length > 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin.from("biologie_resultats").insert(rows as never);
      if (error) throw new Error(error.message);
      inserted = rows.length;
    }

    void context.userId;
    return { date_prelevement: parsed.date_prelevement, results, inserted };
  });
