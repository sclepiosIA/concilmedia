import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { AIAnalysisPayload } from "@/lib/conciliation/analyze.functions";

const Input = z.object({
  patientId: z.string().uuid(),
  modelOverride: z
    .object({
      providerName: z.string().min(1),
      modelId: z.string().min(1),
    })
    .optional(),
  runTag: z.string().min(1).max(120).optional(),
  modelLabel: z.string().min(1).max(120).optional(),
});

export const analyzePatientConciliationComplete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY manquante");

    const { data: patient } = await supabase
      .from("patients")
      .select("*")
      .eq("id", data.patientId)
      .maybeSingle();
    if (!patient) throw new Error("Patient introuvable");

    // Dernier épisode pour récupérer les prescriptions hospitalières
    const { data: lastEpisode } = await supabase
      .from("episodes")
      .select("id")
      .eq("patient_id", data.patientId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const [allergies, antecedents, comorbidites, traitements, biologie, prescriptions] = await Promise.all([
      supabase.from("allergies").select("*").eq("patient_id", data.patientId),
      supabase.from("antecedents").select("*").eq("patient_id", data.patientId).eq("actif", true),
      supabase.from("comorbidites").select("*").eq("patient_id", data.patientId).eq("statut", "actif"),
      supabase.from("traitements_habituels").select("*").eq("patient_id", data.patientId).eq("actif", true),
      supabase
        .from("biologie_resultats")
        .select("parametre, valeur, unite, valeur_texte, date_prelevement")
        .eq("patient_id", data.patientId)
        .order("date_prelevement", { ascending: false, nullsFirst: false })
        .limit(50),
      lastEpisode
        ? supabase
            .from("prescriptions_hospitalieres")
            .select("*")
            .eq("episode_id", lastEpisode.id)
            .eq("actif", true)
        : Promise.resolve({ data: [] as never[] }),
    ]);

    const bioLatest = new Map<string, { parametre: string; valeur: number | null; unite: string | null; valeur_texte: string | null; date_prelevement: string | null }>();
    for (const b of biologie.data ?? []) {
      const k = b.parametre.toLowerCase();
      if (!bioLatest.has(k)) bioLatest.set(k, b);
    }

    const dossier = {
      patient: {
        sexe: patient.sexe,
        age: patient.date_naissance
          ? Math.floor((Date.now() - new Date(patient.date_naissance).getTime()) / 31557600000)
          : undefined,
        poids_kg: patient.poids_kg,
        taille_cm: patient.taille_cm,
      },
      allergies: allergies.data ?? [],
      antecedents: antecedents.data ?? [],
      comorbidites: comorbidites.data ?? [],
      biologie_recente: Array.from(bioLatest.values()),
      traitements_habituels: traitements.data ?? [],
      prescriptions_hospitalieres: prescriptions.data ?? [],
    };

    const { generateText } = await import("ai");
    const { resolveAITask } = await import("@/lib/ai/runAITask.server");
    const __aiTaskSlug = "analyze_patient_complete";
    const __aiDefaultModel = "google/gemini-3-flash-preview";

    const systemPrompt = `Tu es un pharmacien clinicien hospitalier expert en CONCILIATION MÉDICAMENTEUSE. Ta mission : comparer ligne à ligne traitements habituels (ville/domicile) ↔ prescriptions hospitalières en cours, dans le contexte clinique (comorbidités, biologie, allergies, antécédents), et produire une aide à la décision opérationnelle pour le pharmacien hospitalier.

Produis STRICTEMENT un JSON :
{
  "synthese":"4-6 phrases — profil patient, divergences ville/hôpital majeures, biologie pertinente",
  "score_risque":0-100,
  "divergences_conciliation":[{"type":"omission|ajout_non_justifie|switch|modification_posologie|substitution_classe","medicament_ville":"DCI ville ou null","medicament_hopital":"DCI hôpital ou null","severite":"mineure|moderee|majeure|critique","justification_clinique":"pourquoi c'est un problème (citer CHA2DS2, DFG, INR, indication...)","risque":"conséquence clinique","recommandation":"action pharmaceutique concrète (ex: 'Reprendre Apixaban 5 mg x2/j')","alternative":"","confiance":0-100,"reference":"HAS conciliation / SFPC / STOPP-START / ANSM"}],
  "actions_prioritaires":[{"action":"intervention pharmaceutique concrète","urgence":"immediate|24h|differee","destinataire":"prescripteur|IDE|patient","justification":"lien avec la divergence ou l'alerte"}],
  "interactions":[{"dci_1":"","dci_2":"","severite":"mineure|moderee|majeure|contre_indication","mecanisme":"","risque":"","recommandation":"","alternative":"","confiance":0-100,"reference":"ANSM Thésaurus"}],
  "doublons_therapeutiques":[{"medicaments":[""],"classe":"","severite":"","mecanisme":"","risque":"","recommandation":"","alternative":"","confiance":0-100,"reference":""}],
  "contre_indications":[{"medicament":"","raison":"","severite":"majeure|contre_indication","mecanisme":"","risque":"","recommandation":"","alternative":"","confiance":0-100,"reference":""}],
  "redondances_classe":[{"classe":"","medicaments":[""]}],
  "adaptations_posologiques":[{"medicament":"","raison":"","severite":"","mecanisme":"","risque":"","recommandation":"posologie cible","alternative":"","confiance":0-100,"reference":"GPR / RCP"}],
  "medicaments_haut_risque":[{"medicament":"","classe":"","raison":"","severite":"majeure","risque":"","recommandation":"","alternative":"","confiance":0-100,"reference":"ISMP / HAS Never Events"}],
  "allergies_croisees":[{"allergene":"","medicament":"","risque":"","severite":"majeure|contre_indication","recommandation":"","alternative":"","confiance":0-100,"reference":"RCP / ANSM"}],
  "surveillance":[{"parametre":"","frequence":"","justification":""}],
  "conclusion_clinique":"2-3 phrases — conduite prioritaire pour le pharmacien"
}

RÈGLES CLINIQUES STRICTES :
1. **Une molécule (DCI) ne doit apparaître QUE DANS UNE SEULE catégorie**. Ordre de priorité : divergences_conciliation > contre_indications > interactions > adaptations_posologiques > allergies_croisees > doublons_therapeutiques > medicaments_haut_risque. Si tu listes Apixaban dans "divergences_conciliation", tu NE le remets PAS dans "medicaments_haut_risque" ni ailleurs.
2. **"contre_indications"** est réservé aux médicaments EFFECTIVEMENT PRESCRITS contre-indiqués chez ce patient (ex: AINS prescrit + DFG=30). Un médicament MANQUANT à l'hôpital n'est JAMAIS une contre-indication → c'est une "omission" dans divergences_conciliation.
3. **"medicaments_haut_risque"** ne liste un médicament que s'il pose un problème SPÉCIFIQUE non couvert ailleurs (ex: insuline à dose élevée sans surveillance glycémique). Ne pas le remplir juste parce qu'un AOD/insuline/opioïde est présent.
4. Pour CHAQUE divergence, identifier précisément : médicament ville, médicament hôpital (ou null), type, justification ancrée dans la clinique.
5. Comparer DCI/dose/voie/posologie : omission (ville→absent hôpital), ajout_non_justifie (absent ville→hôpital sans indication claire), switch (DCI ou voie changée), modification_posologie (même DCI, dose différente), substitution_classe (changement de classe thérapeutique).
6. Adaptations rénales : si DFG<60 vérifier metformine, IEC/ARA2, AINS, anticoagulants, antibio. Si INR>4 alerter anticoagulants. Si K+ anormal alerter IEC/ARA2/spironolactone.
7. Allergies croisées (pénicilline↔céphalo, AINS↔aspirine, sulfamides).
8. Chaque item DOIT contenir severite, recommandation pratique, confiance 0-100, reference.
9. "actions_prioritaires" : déduire les 3-8 interventions pharmaceutiques les plus utiles (appel prescripteur, modification ordonnance, éducation patient), triées par urgence.

Réponds UNIQUEMENT avec le JSON, sans markdown.`;
    const { model, systemPrompt: __systemPrompt, callOptions } = await resolveAITask(__aiTaskSlug, { systemPrompt, model: __aiDefaultModel });

    let result;
    try {
      result = await generateText({
        ...callOptions,
        model,
        system: __systemPrompt,
        prompt: `Dossier patient complet :\n${JSON.stringify(dossier, null, 2)}`,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("429")) throw new Error("Limite IA atteinte, réessayez.");
      if (msg.includes("402")) throw new Error("Crédits IA épuisés.");
      throw e;
    }

    const raw = result.text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
    let payload: AIAnalysisPayload;
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new Error("Réponse IA non parsable");
    }

    await supabase.from("conciliation_ai_analyses").insert({
      episode_id: null,
      patient_id: data.patientId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      payload: payload as any,
      model: "google/gemini-3-flash-preview",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      analysis_type: "conciliation_complete" as any,
    });

    return payload;
  });
