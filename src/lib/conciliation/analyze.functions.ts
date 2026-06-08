import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({ episodeId: z.string().uuid() });

export type AIAnalysisPayload = {
  synthese: string;
  score_risque: number;
  interactions: Array<{ dci_1: string; dci_2: string; severite: string; mecanisme: string; recommandation: string }>;
  doublons_therapeutiques: Array<{ medicaments: string[]; classe: string; recommandation: string }>;
  contre_indications: Array<{ medicament: string; raison: string; recommandation: string }>;
  redondances_classe: Array<{ classe: string; medicaments: string[] }>;
  adaptations_posologiques: Array<{ medicament: string; raison: string; recommandation: string }>;
};

export const analyzeConciliation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY manquante");

    // Charger contexte patient
    const { data: episode } = await supabase
      .from("episodes")
      .select("*, patients(*)")
      .eq("id", data.episodeId)
      .maybeSingle();
    if (!episode) throw new Error("Épisode introuvable");

    const patientId = episode.patient_id;
    const [allergies, antecedents, comorbidites, traitements, prescriptions] = await Promise.all([
      supabase.from("allergies").select("*").eq("patient_id", patientId),
      supabase.from("antecedents").select("*").eq("patient_id", patientId).eq("actif", true),
      supabase.from("comorbidites").select("*").eq("patient_id", patientId).eq("statut", "actif"),
      supabase.from("traitements_habituels").select("*").eq("patient_id", patientId).eq("actif", true),
      supabase.from("prescriptions_hospitalieres").select("*").eq("episode_id", data.episodeId).eq("actif", true),
    ]);

    const dossier = {
      patient: {
        sexe: episode.patients?.sexe,
        age: episode.patients?.date_naissance
          ? Math.floor((Date.now() - new Date(episode.patients.date_naissance).getTime()) / 31557600000)
          : undefined,
        poids_kg: episode.patients?.poids_kg,
      },
      allergies: allergies.data ?? [],
      antecedents: antecedents.data ?? [],
      comorbidites: comorbidites.data ?? [],
      traitements_habituels: traitements.data ?? [],
      prescriptions_hospitalieres: prescriptions.data ?? [],
    };

    const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
    const { generateText } = await import("ai");
    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-3-flash-preview");

    const systemPrompt = `Tu es un pharmacien hospitalier clinicien expert en conciliation médicamenteuse.
Analyse le dossier patient et produis STRICTEMENT un JSON valide avec cette structure :
{
  "synthese": "texte court (3-4 phrases) résumant les points clés",
  "score_risque": entier 0-100,
  "interactions": [{"dci_1":"...","dci_2":"...","severite":"mineure|moderee|majeure|contre_indication","mecanisme":"...","recommandation":"..."}],
  "doublons_therapeutiques": [{"medicaments":["..."],"classe":"...","recommandation":"..."}],
  "contre_indications": [{"medicament":"...","raison":"allergie/comorbidité","recommandation":"..."}],
  "redondances_classe": [{"classe":"...","medicaments":["..."]}],
  "adaptations_posologiques": [{"medicament":"...","raison":"insuffisance rénale/hépatique/age","recommandation":"..."}]
}
Réponds UNIQUEMENT avec le JSON, sans markdown, sans commentaire.`;

    let result;
    try {
      result = await generateText({
        model,
        system: systemPrompt,
        prompt: `Dossier patient :\n${JSON.stringify(dossier, null, 2)}`,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("429")) throw new Error("Limite IA atteinte, réessayez dans quelques instants.");
      if (msg.includes("402")) throw new Error("Crédits IA épuisés. Ajoutez des crédits dans les paramètres de l'espace.");
      throw e;
    }

    // Extraire JSON
    const raw = result.text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
    let payload: AIAnalysisPayload;
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new Error("Réponse IA non parsable");
    }

    await supabase.from("conciliation_ai_analyses").insert({
      episode_id: data.episodeId,
      patient_id: patientId,
      payload: payload as unknown as Record<string, unknown>,
      model: "google/gemini-3-flash-preview",
    });

    void userId;
    return payload;
  });
