import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({
  patientId: z.string().uuid(),
  fileBase64: z.string().min(10),
  mimeType: z.string(),
  fileName: z.string().optional(),
});

export interface ExtractedMedication {
  dci: string;
  nom_commercial?: string;
  dosage?: string;
  dosage_unite?: string;
  voie_administration?: string;
  posologie_matin?: number;
  posologie_midi?: number;
  posologie_soir?: number;
  posologie_coucher?: number;
  posologie_texte?: string;
  indication?: string;
  duree?: string;
}

export interface ExtractOrdonnanceResult {
  prescripteur?: string;
  date_prescription?: string;
  medications: ExtractedMedication[];
  storage_path?: string;
}

export const extractOrdonnance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }): Promise<ExtractOrdonnanceResult> => {
    const { supabase, userId } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY manquante");

    // Optional storage upload (best-effort)
    let storagePath: string | undefined;
    try {
      const ts = Date.now();
      const safeName = (data.fileName ?? "ordonnance").replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${userId}/${data.patientId}/${ts}_${safeName}`;
      const bin = Uint8Array.from(atob(data.fileBase64), (c) => c.charCodeAt(0));
      const up = await supabase.storage.from("ordonnances").upload(path, bin, {
        contentType: data.mimeType,
        upsert: false,
      });
      if (!up.error) storagePath = path;
    } catch {
      // silent — extraction works without storage
    }

    const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
    const { generateText } = await import("ai");
    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-3-flash-preview");

    const systemPrompt = `Tu es un assistant pharmaceutique expert en lecture d'ordonnances françaises.
Analyse l'image / le PDF fourni et extrais les médicaments prescrits.
Réponds STRICTEMENT en JSON valide selon ce schéma :
{
  "prescripteur": "nom du prescripteur (optionnel)",
  "date_prescription": "YYYY-MM-DD (optionnel)",
  "medications": [
    {
      "dci": "Dénomination Commune Internationale (obligatoire, ex: 'Metformine')",
      "nom_commercial": "nom de marque si lisible",
      "dosage": "valeur numérique du dosage (ex: '500')",
      "dosage_unite": "mg, g, UI, ml...",
      "voie_administration": "PO, SC, IV, IM, topique, inhalée...",
      "posologie_matin": nombre d'unités le matin,
      "posologie_midi": nombre d'unités le midi,
      "posologie_soir": nombre d'unités le soir,
      "posologie_coucher": nombre d'unités au coucher,
      "posologie_texte": "phrase libre si posologie complexe",
      "indication": "indication si mentionnée",
      "duree": "durée du traitement si mentionnée"
    }
  ]
}
Règles :
- Toujours préférer la DCI (princeps) plutôt que le nom commercial.
- Omets les champs inconnus plutôt que d'inventer.
- Ignore les annotations administratives, les en-têtes d'ordonnancier, signatures.
- N'inclus que les médicaments réellement prescrits.
Réponds UNIQUEMENT avec le JSON.`;

    const result = await generateText({
      model,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Voici l'ordonnance à analyser." },
            { type: "file", data: `data:${data.mimeType};base64,${data.fileBase64}`, mediaType: data.mimeType },
          ],
        },
      ],
    });

    const raw = result.text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "");
    let parsed: ExtractOrdonnanceResult;
    try {
      parsed = JSON.parse(raw) as ExtractOrdonnanceResult;
    } catch {
      throw new Error("Impossible d'analyser la réponse IA. Réessayez avec une image plus nette.");
    }

    return { ...parsed, storage_path: storagePath };
  });

const ImportInput = z.object({
  patientId: z.string().uuid(),
  medications: z.array(z.record(z.string(), z.unknown())),
});

export const importExtractedMedications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ImportInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const rows = data.medications.map((m) => ({
      patient_id: data.patientId,
      dci: String(m.dci ?? "Inconnu"),
      nom_commercial: m.nom_commercial ? String(m.nom_commercial) : null,
      dosage: m.dosage ? String(m.dosage) : null,
      dosage_unite: m.dosage_unite ? String(m.dosage_unite) : null,
      voie_administration: m.voie_administration ? String(m.voie_administration) : null,
      posologie_matin: typeof m.posologie_matin === "number" ? m.posologie_matin : null,
      posologie_midi: typeof m.posologie_midi === "number" ? m.posologie_midi : null,
      posologie_soir: typeof m.posologie_soir === "number" ? m.posologie_soir : null,
      posologie_coucher: typeof m.posologie_coucher === "number" ? m.posologie_coucher : null,
      indication: m.indication ? String(m.indication) : null,
      source: "ordonnance_ocr",
      actif: true,
    }));
    if (rows.length === 0) return { inserted: 0 };
    const { error } = await supabase.from("traitements_habituels").insert(rows as never);
    if (error) throw new Error(error.message);
    return { inserted: rows.length };
  });
