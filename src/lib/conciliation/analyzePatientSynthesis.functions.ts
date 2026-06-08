import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { AIAnalysisPayload } from "@/lib/conciliation/analyze.functions";

const Input = z.object({ patientId: z.string().uuid() });

export const analyzePatientSynthesis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY manquante");

    const { data: patient } = await supabase.from("patients").select("*").eq("id", data.patientId).maybeSingle();
    if (!patient) throw new Error("Patient introuvable");

    const [allergies, antecedents, comorbidites, traitements, biologie] = await Promise.all([
      supabase.from("allergies").select("*").eq("patient_id", data.patientId),
      supabase.from("antecedents").select("*").eq("patient_id", data.patientId).eq("actif", true),
      supabase.from("comorbidites").select("*").eq("patient_id", data.patientId).eq("statut", "actif"),
      supabase.from("traitements_habituels").select("*").eq("patient_id", data.patientId).eq("actif", true),
      supabase.from("biologie_resultats").select("parametre, valeur, unite, valeur_texte, date_prelevement").eq("patient_id", data.patientId).order("date_prelevement", { ascending: false, nullsFirst: false }).limit(50),
    ]);

    const bioLatest = new Map<string, { parametre: string; valeur: number | null; unite: string | null; valeur_texte: string | null; date_prelevement: string | null }>();
    for (const b of biologie.data ?? []) {
      const k = b.parametre.toLowerCase();
      if (!bioLatest.has(k)) bioLatest.set(k, b);
    }

    const dossier = {
      patient: {
        sexe: patient.sexe,
        age: patient.date_naissance ? Math.floor((Date.now() - new Date(patient.date_naissance).getTime()) / 31557600000) : undefined,
        poids_kg: patient.poids_kg,
      },
      allergies: allergies.data ?? [],
      antecedents: antecedents.data ?? [],
      comorbidites: comorbidites.data ?? [],
      biologie_recente: Array.from(bioLatest.values()),
      traitements_habituels: traitements.data ?? [],
    };

    const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
    const { generateText } = await import("ai");
    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-3-flash-preview");

    const systemPrompt = `Tu es un pharmacien clinicien. Analyse les traitements habituels du patient (sans prescription hospitalière) et produis STRICTEMENT un JSON :
{
  "synthese":"...","score_risque":0-100,
  "interactions":[{"dci_1":"","dci_2":"","severite":"mineure|moderee|majeure|contre_indication","mecanisme":"","recommandation":""}],
  "doublons_therapeutiques":[{"medicaments":[""],"classe":"","recommandation":""}],
  "contre_indications":[{"medicament":"","raison":"","recommandation":""}],
  "redondances_classe":[{"classe":"","medicaments":[""]}],
  "adaptations_posologiques":[{"medicament":"","raison":"","recommandation":""}]
}
Règles cliniques :
- Si DFG < 60, vérifier metformine, IEC/ARA2, AINS, anticoagulants, antibio.
- Si INR > 4, alerter sur anticoagulants/antiagrégants.
- Si K+ anormal, alerter IEC/ARA2/spironolactone/AINS.
- Cite la valeur biologique précise dans "raison".
Réponds UNIQUEMENT avec le JSON.`;

    let result;
    try {
      result = await generateText({ model, system: systemPrompt, prompt: `Dossier patient :\n${JSON.stringify(dossier, null, 2)}` });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("429")) throw new Error("Limite IA atteinte, réessayez.");
      if (msg.includes("402")) throw new Error("Crédits IA épuisés.");
      throw e;
    }

    const raw = result.text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
    let payload: AIAnalysisPayload;
    try { payload = JSON.parse(raw); } catch { throw new Error("Réponse IA non parsable"); }

    await supabase.from("conciliation_ai_analyses").insert({
      episode_id: null,
      patient_id: data.patientId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      payload: payload as any,
      model: "google/gemini-3-flash-preview",
    });

    return payload;
  });
