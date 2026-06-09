import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({ episodeId: z.string().uuid() });

export type AIAnalysisPayload = {
  synthese: string;
  score_risque: number;
  interactions: Array<{ dci_1: string; dci_2: string; severite: string; mecanisme: string; recommandation: string; risque?: string; reference?: string; alternative?: string; confiance?: number }>;
  doublons_therapeutiques: Array<{ medicaments: string[]; classe: string; recommandation: string; severite?: string; mecanisme?: string; risque?: string; reference?: string; alternative?: string; confiance?: number }>;
  contre_indications: Array<{ medicament: string; raison: string; recommandation: string; severite?: string; mecanisme?: string; risque?: string; reference?: string; alternative?: string; confiance?: number }>;
  redondances_classe: Array<{ classe: string; medicaments: string[] }>;
  adaptations_posologiques: Array<{ medicament: string; raison: string; recommandation: string; severite?: string; mecanisme?: string; risque?: string; reference?: string; alternative?: string; confiance?: number }>;
  medicaments_haut_risque?: Array<{ medicament: string; classe: string; raison: string; severite?: string; risque?: string; recommandation?: string; reference?: string; alternative?: string; confiance?: number }>;
  allergies_croisees?: Array<{ allergene: string; medicament: string; risque: string; severite?: string; recommandation?: string; reference?: string; alternative?: string; confiance?: number }>;
  surveillance?: Array<{ parametre: string; frequence: string; justification: string }>;
  conclusion_clinique?: string;
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
    const [allergies, antecedents, comorbidites, traitements, prescriptions, biologie] = await Promise.all([
      supabase.from("allergies").select("*").eq("patient_id", patientId),
      supabase.from("antecedents").select("*").eq("patient_id", patientId).eq("actif", true),
      supabase.from("comorbidites").select("*").eq("patient_id", patientId).eq("statut", "actif"),
      supabase.from("traitements_habituels").select("*").eq("patient_id", patientId).eq("actif", true),
      supabase.from("prescriptions_hospitalieres").select("*").eq("episode_id", data.episodeId).eq("actif", true),
      supabase.from("biologie_resultats").select("parametre, valeur, unite, valeur_texte, date_prelevement").eq("patient_id", patientId).order("date_prelevement", { ascending: false, nullsFirst: false }).limit(50),
    ]);

    // Garder le résultat le plus récent par paramètre
    const bioLatest = new Map<string, { parametre: string; valeur: number | null; unite: string | null; valeur_texte: string | null; date_prelevement: string | null }>();
    for (const b of biologie.data ?? []) {
      const k = b.parametre.toLowerCase();
      if (!bioLatest.has(k)) bioLatest.set(k, b);
    }

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
      biologie_recente: Array.from(bioLatest.values()),
      traitements_habituels: traitements.data ?? [],
      prescriptions_hospitalieres: prescriptions.data ?? [],
    };

    const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
    const { generateText } = await import("ai");
    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-3-flash-preview");

    const systemPrompt = `Tu es un pharmacien hospitalier clinicien expert en conciliation médicamenteuse.
Analyse le dossier patient (incluant biologie_recente : DFG, créatinine, kaliémie, INR, hémoglobine, ASAT/ALAT, HbA1c…) et produis STRICTEMENT un JSON valide avec cette structure :
{
  "synthese": "texte court (3-4 phrases) résumant les points clés, en mentionnant les valeurs biologiques pertinentes",
  "score_risque": entier 0-100,
  "interactions": [{"dci_1":"...","dci_2":"...","severite":"mineure|moderee|majeure|contre_indication","mecanisme":"explication pharmacologique précise","risque":"conséquence clinique attendue pour le patient","recommandation":"action pratique (arrêt, espacement, surveillance, alternative)","reference":"ex: ANSM Thésaurus interactions 2024, HAS, Vidal, RCP, STOPP/START v2"}],
  "doublons_therapeutiques": [{"medicaments":["..."],"classe":"...","severite":"mineure|moderee|majeure","mecanisme":"...","risque":"...","recommandation":"...","reference":"..."}],
  "contre_indications": [{"medicament":"...","raison":"allergie/comorbidité/biologie","severite":"majeure|contre_indication","mecanisme":"...","risque":"...","recommandation":"...","reference":"RCP / HAS / ANSM"}],
  "redondances_classe": [{"classe":"...","medicaments":["..."]}],
  "adaptations_posologiques": [{"medicament":"...","raison":"DFG=X mL/min / insuffisance hépatique / âge / hyperkaliémie / INR","severite":"mineure|moderee|majeure","mecanisme":"justification PK/PD","risque":"sur/sous-dosage attendu","recommandation":"posologie cible précise","reference":"GPR (Société de Néphrologie) / RCP / Vidal"}],
  "medicaments_haut_risque": [{"medicament":"...","classe":"anticoagulant|insuline|opioïde|antiépileptique|chimio|...","raison":"...","severite":"majeure","risque":"...","recommandation":"surveillance spécifique","reference":"ISMP / HAS Never Events"}],
  "allergies_croisees": [{"allergene":"...","medicament":"...","risque":"...","severite":"majeure|contre_indication","recommandation":"alternative thérapeutique","reference":"RCP / ANSM"}],
  "surveillance": [{"parametre":"DFG|K+|INR|glycémie|TA|...","frequence":"...","justification":"..."}],
  "conclusion_clinique": "1-2 phrases — style compte-rendu hospitalier"
}
Règles cliniques :
- Si DFG < 60 mL/min, vérifier systématiquement chaque médicament à élimination rénale (metformine, IEC/ARA2, AINS, anticoagulants, antibiotiques) et proposer adaptation.
- Si INR > 4, alerter sur risque hémorragique des anticoagulants/antiagrégants.
- Si K+ anormal, alerter sur IEC/ARA2/spironolactone/AINS.
- Cite la valeur biologique précise dans "raison" et "risque".
- Pour chaque allergie documentée, vérifier les allergies croisées (pénicilline ↔ céphalosporines, AINS ↔ aspirine, sulfamides).
- Chaque alerte (interaction, contre-indication, adaptation, doublon, allergie croisée, haut risque) DOIT contenir severite, mecanisme/raison, risque clinique, recommandation pratique ET reference de bonne pratique (ANSM, HAS, Vidal, RCP, STOPP/START, GPR, ISMP).
- conclusion_clinique : ton neutre, factuel, exploitable pour le dossier patient.
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      payload: payload as any,
      model: "google/gemini-3-flash-preview",
    });

    void userId;
    return payload;
  });
