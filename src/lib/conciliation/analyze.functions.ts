import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({ episodeId: z.string().uuid() });

export type DivergenceConciliation = {
  type: "omission" | "ajout_non_justifie" | "switch" | "modification_posologie" | "substitution_classe";
  medicament_ville: string | null;
  medicament_hopital: string | null;
  severite: "mineure" | "moderee" | "majeure" | "critique";
  justification_clinique: string;
  risque?: string;
  recommandation: string;
  alternative?: string;
  reference?: string;
  confiance?: number;
  ml_severity_score?: number; // 0..1 — Étage 4 (gravité oubli) si exécuté
  ml_is_severe?: number; // 0/1
};

export type ActionPrioritaire = {
  action: string;
  urgence: "immediate" | "24h" | "differee";
  destinataire: "prescripteur" | "IDE" | "patient" | string;
  justification?: string;
};

export type AIAnalysisPayload = {
  synthese: string;
  score_risque: number;
  divergences_conciliation?: DivergenceConciliation[];
  actions_prioritaires?: ActionPrioritaire[];
  interactions: Array<{ dci_1: string; dci_2: string; severite: string; mecanisme: string; recommandation: string; risque?: string; reference?: string; alternative?: string; confiance?: number }>;
  doublons_therapeutiques: Array<{ medicaments: string[]; classe: string; recommandation: string; severite?: string; mecanisme?: string; risque?: string; reference?: string; alternative?: string; confiance?: number }>;
  contre_indications: Array<{ medicament: string; raison: string; recommandation: string; severite?: string; mecanisme?: string; risque?: string; reference?: string; alternative?: string; confiance?: number }>;
  redondances_classe: Array<{ classe: string; medicaments: string[] }>;
  adaptations_posologiques: Array<{ medicament: string; raison: string; recommandation: string; severite?: string; mecanisme?: string; risque?: string; reference?: string; alternative?: string; confiance?: number }>;
  medicaments_haut_risque?: Array<{ medicament: string; classe: string; raison: string; severite?: string; risque?: string; recommandation?: string; reference?: string; alternative?: string; confiance?: number }>;
  allergies_croisees?: Array<{ allergene: string; medicament: string; risque: string; severite?: string; recommandation?: string; reference?: string; alternative?: string; confiance?: number }>;
  surveillance?: Array<{ parametre: string; frequence: string; justification: string }>;
  conclusion_clinique?: string;
  /**
   * Alertes produites par le moteur déterministe (interactions de classe ATC +
   * critères STOPP/START). Vérifiables et reproductibles, à distinguer des
   * alertes LLM. Voir `computeDeterministicAlerts`.
   */
  alertes_regles?: import("./deterministicAlerts").DeterministicAlert[];
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

    const { generateText } = await import("ai");
    const { resolveAITask } = await import("@/lib/ai/runAITask.server");
    const __aiTaskSlug = "analyze";
    const __aiDefaultModel = "google/gemini-3-flash-preview";

    const systemPrompt = `Tu es un pharmacien hospitalier clinicien expert en conciliation médicamenteuse.
Analyse le dossier patient (incluant biologie_recente : DFG, créatinine, kaliémie, INR, hémoglobine, ASAT/ALAT, HbA1c…) et produis STRICTEMENT un JSON valide avec cette structure :
{
  "synthese": "texte court (3-4 phrases) résumant les points clés, en mentionnant les valeurs biologiques pertinentes",
  "score_risque": entier 0-100,
  "interactions": [{"dci_1":"...","dci_2":"...","severite":"mineure|moderee|majeure|contre_indication","mecanisme":"explication pharmacologique précise","risque":"conséquence clinique attendue pour le patient","recommandation":"action pratique (arrêt, espacement, surveillance, alternative)","alternative":"alternative thérapeutique concrète si pertinente","confiance":0-100,"reference":"ex: ANSM Thésaurus interactions 2024, HAS, Vidal, RCP, STOPP/START v2, SPILF"}],
  "doublons_therapeutiques": [{"medicaments":["..."],"classe":"...","severite":"mineure|moderee|majeure","mecanisme":"...","risque":"...","recommandation":"...","alternative":"...","confiance":0-100,"reference":"..."}],
  "contre_indications": [{"medicament":"...","raison":"allergie/comorbidité/biologie","severite":"majeure|contre_indication","mecanisme":"...","risque":"...","recommandation":"...","alternative":"...","confiance":0-100,"reference":"RCP / HAS / ANSM / SPILF"}],
  "redondances_classe": [{"classe":"...","medicaments":["..."]}],
  "adaptations_posologiques": [{"medicament":"...","raison":"DFG=X mL/min / insuffisance hépatique / âge / hyperkaliémie / INR","severite":"mineure|moderee|majeure","mecanisme":"justification PK/PD","risque":"sur/sous-dosage attendu","recommandation":"posologie cible précise","alternative":"alternative si arrêt nécessaire","confiance":0-100,"reference":"GPR (Société de Néphrologie) / RCP / Vidal"}],
  "medicaments_haut_risque": [{"medicament":"...","classe":"anticoagulant|insuline|opioïde|antiépileptique|chimio|...","raison":"...","severite":"majeure","risque":"...","recommandation":"surveillance spécifique","alternative":"...","confiance":0-100,"reference":"ISMP / HAS Never Events"}],
  "allergies_croisees": [{"allergene":"...","medicament":"...","risque":"...","severite":"majeure|contre_indication","recommandation":"...","alternative":"alternative thérapeutique","confiance":0-100,"reference":"RCP / ANSM / SPILF"}],
  "surveillance": [{"parametre":"DFG|K+|INR|glycémie|TA|...","frequence":"...","justification":"..."}],
  "conclusion_clinique": "1-2 phrases — style compte-rendu hospitalier"
}
Règles cliniques :
- Si DFG < 60 mL/min, vérifier systématiquement chaque médicament à élimination rénale (metformine, IEC/ARA2, AINS, anticoagulants, antibiotiques) et proposer adaptation.
- Si INR > 4, alerter sur risque hémorragique des anticoagulants/antiagrégants.
- Si K+ anormal, alerter sur IEC/ARA2/spironolactone/AINS.
- Cite la valeur biologique précise dans "raison" et "risque".
- Pour chaque allergie documentée, vérifier les allergies croisées (pénicilline ↔ céphalosporines, AINS ↔ aspirine, sulfamides).
- Chaque alerte (interaction, contre-indication, adaptation, doublon, allergie croisée, haut risque) DOIT contenir severite, mecanisme/raison, risque clinique, recommandation pratique, alternative thérapeutique (si applicable), un score "confiance" entier 0-100 reflétant le niveau de preuve, ET reference de bonne pratique (ANSM, HAS, Vidal, RCP, STOPP/START, GPR, ISMP, SPILF).
- conclusion_clinique : ton neutre, factuel, exploitable pour le dossier patient.
Réponds UNIQUEMENT avec le JSON, sans markdown, sans commentaire.`;
    const { model, systemPrompt: __systemPrompt, callOptions } = await resolveAITask(__aiTaskSlug, { systemPrompt, model: __aiDefaultModel });

    // RLHF — injection de few-shot exemplars issus du feedback pharmacien (best-effort).
    let __finalSystemPrompt = __systemPrompt;
    try {
      const { getFeedbackExemplars } = await import("@/lib/ai/feedbackSignals.functions");
      const exemplars = await getFeedbackExemplars(__aiTaskSlug, 5);
      if (exemplars) __finalSystemPrompt = __systemPrompt + "\n" + exemplars;
    } catch (e) {
      console.warn("[analyze] feedback exemplars unavailable:", e);
    }

    // RAG — injection de passages issus des thésaurus opposables (STOPP, Laroche, BDPM, …).
    let __ragPassages: Array<{ ref: string; source: string; titre: string; version: string | null; similarity: number }> = [];
    try {
      const { buildRagContext } = await import("@/lib/rag/buildRagContext.server");
      const rag = await buildRagContext(dossier, { episodeId: data.episodeId });
      if (rag.passages.length > 0) {
        __finalSystemPrompt = rag.asPromptSection + "\n" + __finalSystemPrompt + `\n\nIMPORTANT — sourcing : pour chaque alerte produite, mets dans \"reference\" le code [Sn] correspondant à un passage ci-dessus ; si aucune source ne couvre, mets \"reference\": \"non couvert RAG\" et baisse \"confiance\" ≤ 60.`;
        __ragPassages = rag.passages.map((p) => ({ ref: p.ref, source: p.source, titre: p.titre, version: p.version, similarity: p.similarity }));
      }
    } catch (e) {
      console.warn("[analyze] RAG context unavailable:", e);
    }


    let result;
    try {
      result = await generateText({
        ...callOptions,
        model,
        system: __finalSystemPrompt,
        prompt: `Dossier patient :\n${JSON.stringify(dossier, null, 2)}`,
      });

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("429")) throw new Error("Limite IA atteinte, réessayez dans quelques instants.");
      if (msg.includes("402")) throw new Error("Crédits IA épuisés. Ajoutez des crédits dans les paramètres de l'espace.");
      throw e;
    }

    // Extraire JSON (tolérant : fences markdown + extraction objet équilibré)
    const { parseLlmJson, LlmJsonParseError } = await import("@/lib/llm/parseLlmJson");
    let payload: AIAnalysisPayload;
    try {
      payload = parseLlmJson<AIAnalysisPayload>(result.text);
    } catch (e) {
      if (e instanceof LlmJsonParseError) {
        // Retry unique avec un nudge système renforcé
        try {
          const retry = await generateText({
            ...callOptions,
            model,
            system: __finalSystemPrompt + "\n\nIMPORTANT: Réponds uniquement par un objet JSON valide, sans aucun texte avant ou après.",

            prompt: `Dossier patient :\n${JSON.stringify(dossier, null, 2)}`,
          });
          payload = parseLlmJson<AIAnalysisPayload>(retry.text);
        } catch {
          throw new Error("Réponse IA non parsable (après retry)");
        }
      } else {
        throw e;
      }
    }

    // Enrichissement ML (Étage 4 — gravité oubli) si execution_mode = ml | both
    try {
      const { getTaskExecutionMode, predictLayer4Sync } = await import(
        "@/lib/ai/mlConcilmed.server"
      );
      const mode = await getTaskExecutionMode("ml_omission_severity");
      if (mode === "ml" || mode === "both") {
        const age = dossier.patient.age ?? null;
        const nbMeds = dossier.prescriptions_hospitalieres.length;
        const duree = (episode as { duree_sejour?: number }).duree_sejour ?? null;
        const service = (episode as { service?: string }).service ?? null;
        payload.divergences_conciliation = (payload.divergences_conciliation ?? []).map((d) => {
          if (d.type !== "omission" || !d.medicament_ville) return d;
          const r = predictLayer4Sync({
            norm_name: d.medicament_ville,
            age,
            nb_meds_hosp: nbMeds,
            duree_sejour: duree,
            service,
          });
          return { ...d, ml_severity_score: r.severity_score, ml_is_severe: r.is_severe };
        });
      }
    } catch (e) {
      console.warn("[analyze] ML layer4 enrichment failed:", e);
    }

    // Moteur déterministe : interactions de classe ATC + critères STOPP/START
    try {
      const { computeDeterministicAlerts } = await import("./deterministicAlerts");
      type RxLite = { dci?: string | null; medicament?: string | null; code_atc?: string | null };
      const all: RxLite[] = [
        ...(dossier.traitements_habituels ?? []),
        ...(dossier.prescriptions_hospitalieres ?? []),
      ];
      const traitementsDci: string[] = [];
      const traitementsAtc: (string | null)[] = [];
      for (const t of all) {
        const dci = t.dci || t.medicament || "";
        if (!dci) continue;
        traitementsDci.push(dci);
        traitementsAtc.push(t.code_atc ?? null);
      }
      const det = computeDeterministicAlerts({
        age: dossier.patient.age ?? null,
        comorbidites: (dossier.comorbidites ?? []).map((c: { libelle?: string | null }) => c.libelle ?? ""),
        traitements_dci: traitementsDci,
        traitements_atc: traitementsAtc,
      });
      payload.alertes_regles = det.all;

    } catch (e) {
      console.warn("[analyze] deterministic alerts failed:", e);
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
