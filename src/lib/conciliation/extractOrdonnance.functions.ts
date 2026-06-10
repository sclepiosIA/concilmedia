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
  // v1 OCR avancé
  agreement?: "both" | "single";
  match_status?: "exact" | "fuzzy" | "inconnu";
  bdpm_confidence?: number;
  bdpm_cis?: number | null;
  bdpm_code_atc?: string | null;
  bdpm_canonical_dci?: string | null;
  bdpm_suggestions?: { dci: string; nom: string; cis: number; code_atc: string | null; score: number }[];
}

export interface ExtractOrdonnanceResult {
  prescripteur?: string;
  date_prescription?: string;
  medications: ExtractedMedication[];
  storage_path?: string;
  models_used?: string[];
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

    const { generateText } = await import("ai");
    const { resolveAITask } = await import("@/lib/ai/runAITask.server");
    const __aiTaskSlug = "extract_ordonnance";
    const __aiDefaultModel = "google/gemini-3-flash-preview";

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
- Pour CHAQUE médicament, extraire impérativement : DCI, dosage + unité, schéma de prise (matin/midi/soir/coucher OU posologie_texte si schéma complexe) et la DURÉE de traitement.
- Pour la durée : reprends exactement la mention de l'ordonnance ("3 mois", "30 jours", "à renouveler 3 fois", "au long cours", "jusqu'à nouvel ordre"...). Si non précisée, utilise "non précisée".
- TU DOIS remplir les champs structurés posologie_matin / midi / soir / coucher dès que possible, même partiellement, en plus de posologie_texte. Mappings obligatoires :
  • "matin", "petit-déjeuner", "au lever" → posologie_matin
  • "midi", "déjeuner" → posologie_midi
  • "soir", "dîner", "souper" → posologie_soir
  • "coucher", "avant de dormir", "au lit", "la nuit" → posologie_coucher
  • Fréquences "Nx/j" / "N fois par jour" → répartir : 1x/j → matin=1 ; 2x/j → matin=1, soir=1 ; 3x/j → matin=1, midi=1, soir=1 ; 4x/j → les 4 créneaux = 1.
  • Intervalles "/Nh" ou "toutes les N heures" → calcule 24/N puis applique le mapping ci-dessus.
  • Pour les ranges ("1-3x/j", "20-80 mg") prends la borne basse pour les créneaux.
  • Pour "1 inj SC/j", "1 cp/j", "1 sachet/j" sans créneau précis → posologie_matin = 1.
  • Pour les schémas hebdomadaires/mensuels ("1/semaine") → laisse les créneaux à null et précise dans posologie_texte.
- Exemples : "1 cp matin et 1 cp soir" → matin=1, soir=1. "3x/j" → matin=1, midi=1, soir=1. "8-12 UI le soir" → soir=8.
- Omets uniquement les champs vraiment absents (sauf duree : toujours renseignée).
- Ignore les annotations administratives, en-têtes d'ordonnancier, signatures.
- N'inclus que les médicaments réellement prescrits.
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
            { type: "text", text: "Voici l'ordonnance à analyser." },
            {
              type: "file",
              data: `data:${data.mimeType};base64,${data.fileBase64}`,
              mediaType: data.mimeType,
            },
          ],
        },
      ],
    });

    const { parseLlmJson } = await import("@/lib/llm/parseLlmJson");
    let parsed: ExtractOrdonnanceResult;
    try {
      parsed = parseLlmJson<ExtractOrdonnanceResult>(result.text);
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { fillMissingPosologieSlots } = await import("./parsePosologie");
    const { normalizeDrugBdpm } = await import("./normalizeBdpm.server");
    const rows = await Promise.all(
      data.medications.map(async (raw) => {
      const m = fillMissingPosologieSlots({
        posologie_matin: raw.posologie_matin != null ? String(raw.posologie_matin) : null,
        posologie_midi: raw.posologie_midi != null ? String(raw.posologie_midi) : null,
        posologie_soir: raw.posologie_soir != null ? String(raw.posologie_soir) : null,
        posologie_coucher: raw.posologie_coucher != null ? String(raw.posologie_coucher) : null,
        posologie_texte: raw.posologie_texte ? String(raw.posologie_texte) : null,
      });
      const num = (v: string | null | undefined) => {
        if (!v) return null;
        const n = parseFloat(String(v).replace(",", "."));
        return Number.isFinite(n) ? n : null;
      };
      // Enrichissement BDPM : CIS + code ATC + DCI canonique
      const query = String(raw.nom_commercial ?? raw.dci ?? "");
      const norm = query ? await normalizeDrugBdpm(query) : null;
      return {
        patient_id: data.patientId,
        dci: norm?.dci ?? String(raw.dci ?? "Inconnu"),
        nom_commercial: raw.nom_commercial ? String(raw.nom_commercial) : null,
        dosage: raw.dosage ? String(raw.dosage) : null,
        dosage_unite: raw.dosage_unite ? String(raw.dosage_unite) : null,
        voie_administration: raw.voie_administration ? String(raw.voie_administration) : null,
        posologie_matin: num(m.posologie_matin),
        posologie_midi: num(m.posologie_midi),
        posologie_soir: num(m.posologie_soir),
        posologie_coucher: num(m.posologie_coucher),
        posologie_texte: raw.posologie_texte ? String(raw.posologie_texte) : null,
        indication: raw.indication ? String(raw.indication) : null,
        duree: raw.duree ? String(raw.duree) : null,
        source: "ordonnance_ocr",
        actif: true,
        cis: norm?.cis ?? null,
        code_atc: norm?.code_atc ?? null,
      };
    }),
    );
    if (rows.length === 0) return { inserted: 0 };
    const { error } = await supabaseAdmin.from("traitements_habituels").insert(rows as never);
    if (error) throw new Error(error.message);
    void context.userId;
    return { inserted: rows.length };
  });


const ImportHospitalInput = z.object({
  episodeId: z.string().uuid(),
  patientId: z.string().uuid(),
  medications: z.array(z.record(z.string(), z.unknown())),
});

export const importExtractedHospitalPrescriptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ImportHospitalInput.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { fillMissingPosologieSlots } = await import("./parsePosologie");
    const { normalizeDrugBdpm } = await import("./normalizeBdpm.server");
    const rows = await Promise.all(
      data.medications.map(async (raw) => {
      const slots = fillMissingPosologieSlots({
        posologie_matin: raw.posologie_matin != null ? String(raw.posologie_matin) : null,
        posologie_midi: raw.posologie_midi != null ? String(raw.posologie_midi) : null,
        posologie_soir: raw.posologie_soir != null ? String(raw.posologie_soir) : null,
        posologie_coucher: raw.posologie_coucher != null ? String(raw.posologie_coucher) : null,
        posologie_texte: raw.posologie_texte ? String(raw.posologie_texte) : null,
      });
      const query = String(raw.nom_commercial ?? raw.dci ?? "");
      const norm = query ? await normalizeDrugBdpm(query) : null;
      return {
        episode_id: data.episodeId,
        patient_id: data.patientId,
        medicament: norm?.dci ?? String(raw.dci ?? "Inconnu"),
        nom_commercial: raw.nom_commercial ? String(raw.nom_commercial) : null,
        dosage: raw.dosage ? String(raw.dosage) : null,
        dosage_unite: raw.dosage_unite ? String(raw.dosage_unite) : null,
        posologie: raw.posologie_texte ? String(raw.posologie_texte) : null,
        posologie_matin: slots.posologie_matin ?? null,
        posologie_midi: slots.posologie_midi ?? null,
        posologie_soir: slots.posologie_soir ?? null,
        posologie_coucher: slots.posologie_coucher ?? null,
        voie_administration: raw.voie_administration ? String(raw.voie_administration) : null,
        prescripteur: raw.prescripteur ? String(raw.prescripteur) : null,
        indication: raw.indication ? String(raw.indication) : null,
        source: "ordonnance_ocr",
        actif: true,
        cis: norm?.cis ?? null,
        code_atc: norm?.code_atc ?? null,
      };
    }),
    );
    if (rows.length === 0) return { inserted: 0 };
    const { error } = await supabaseAdmin.from("prescriptions_hospitalieres").insert(rows as never);
    if (error) throw new Error(error.message);
    return { inserted: rows.length };
  });

