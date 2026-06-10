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

type AnalysisDossier = {
  patient: Record<string, unknown>;
  allergies: Array<Record<string, unknown>>;
  antecedents: Array<Record<string, unknown>>;
  comorbidites: Array<Record<string, unknown>>;
  biologie_recente: Array<Record<string, unknown>>;
  traitements_habituels: Array<Record<string, unknown>>;
  prescriptions_hospitalieres: Array<Record<string, unknown>>;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function drugLabel(row: Record<string, unknown>): string {
  return asString(row.dci) || asString(row.medicament) || asString(row.nom_commercial) || "Traitement non précisé";
}

function normalizeDrugName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(cp|comprime|gelule|g|mg|ml|ui|iu|lp|xr|solution|injectable)\b/g, " ")
    .replace(/\d+[,.]?\d*/g, " ")
    .replace(/[^a-z]+/g, " ")
    .trim();
}

function doseSummary(row: Record<string, unknown>): string {
  const slots = [
    ["matin", row.posologie_matin],
    ["midi", row.posologie_midi],
    ["soir", row.posologie_soir],
    ["coucher", row.posologie_coucher],
  ]
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
    .map(([k, v]) => `${k}: ${String(v).trim()}`);
  return slots.join(", ") || asString(row.posologie_texte) || asString(row.posologie) || "posologie non précisée";
}

function buildFastConciliationPayload(dossier: AnalysisDossier, reason: string): AIAnalysisPayload {
  const ville = dossier.traitements_habituels.map((t) => ({ row: t, label: drugLabel(t), key: normalizeDrugName(drugLabel(t)) })).filter((t) => t.key);
  const hopital = dossier.prescriptions_hospitalieres.map((p) => ({ row: p, label: drugLabel(p), key: normalizeDrugName(drugLabel(p)) })).filter((p) => p.key);
  const hopitalKeys = new Set(hopital.map((p) => p.key));
  const villeKeys = new Set(ville.map((t) => t.key));
  const divergences: NonNullable<AIAnalysisPayload["divergences_conciliation"]> = [
    ...ville.filter((t) => !hopitalKeys.has(t.key)).slice(0, 12).map((t) => ({
      type: "omission" as const,
      medicament_ville: `${t.label} — ${doseSummary(t.row)}`,
      medicament_hopital: null,
      severite: "moderee" as const,
      justification_clinique: "Traitement habituel absent des prescriptions hospitalières actives.",
      risque: "Risque de rupture thérapeutique si le traitement est toujours indiqué.",
      recommandation: `Vérifier l'indication et statuer sur la reprise ou l'arrêt documenté de ${t.label}.`,
      alternative: "Documenter la décision médicale si arrêt volontaire.",
      confiance: 82,
      reference: "HAS conciliation médicamenteuse",
    })),
    ...hopital.filter((p) => !villeKeys.has(p.key)).slice(0, 8).map((p) => ({
      type: "ajout_non_justifie" as const,
      medicament_ville: null,
      medicament_hopital: `${p.label} — ${doseSummary(p.row)}`,
      severite: "mineure" as const,
      justification_clinique: "Prescription hospitalière sans correspondance dans le traitement habituel importé.",
      risque: "Ajout potentiellement justifié par l'hospitalisation, à confirmer dans le dossier.",
      recommandation: `Confirmer l'indication hospitalière de ${p.label} et la durée prévue.`,
      alternative: "Arrêter ou tracer l'indication si non justifié.",
      confiance: 70,
      reference: "HAS conciliation médicamenteuse",
    })),
  ];
  const score = Math.min(100, 20 + divergences.length * 6 + dossier.allergies.length * 4 + dossier.comorbidites.length * 2);
  return {
    synthese: `Conciliation générée en mode rapide car ${reason}. ${ville.length} traitement(s) habituel(s) et ${hopital.length} prescription(s) hospitalière(s) ont été comparés. Les divergences listées doivent être vérifiées et validées par le pharmacien dans le contexte clinique du patient.`,
    score_risque: score,
    divergences_conciliation: divergences,
    actions_prioritaires: divergences.slice(0, 6).map((d) => ({ action: d.recommandation, urgence: d.severite === "majeure" || d.severite === "critique" ? "immediate" : "24h", destinataire: "prescripteur", justification: d.justification_clinique })),
    interactions: [],
    doublons_therapeutiques: [],
    contre_indications: [],
    redondances_classe: [],
    adaptations_posologiques: [],
    medicaments_haut_risque: [],
    allergies_croisees: [],
    surveillance: [{ parametre: "Validation pharmaceutique", frequence: "Avant dispensation ou sortie", justification: "Résultat rapide basé sur rapprochement ville/hôpital à confirmer cliniquement." }],
    conclusion_clinique: "Prioriser la revue des omissions et des ajouts non justifiés, puis tracer les décisions de reprise, arrêt ou modification.",
  };
}

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
    const { model, systemPrompt: __systemPrompt, callOptions, modelId: __modelIdUsed } = data.modelOverride
      ? await (await import("@/lib/ai/runAITask.server")).resolveAITaskWithOverride(
          { systemPrompt, model: __aiDefaultModel },
          data.modelOverride,
        )
      : await resolveAITask(__aiTaskSlug, { systemPrompt, model: __aiDefaultModel });

    // Garde-fou : on borne la durée d'appel et la longueur de sortie pour
    // éviter un "chargement infini" côté UI si le modèle traîne.
    const TIMEOUT_MS = 24_000;
    const callOptionsWithDefaults: Record<string, unknown> = { ...callOptions };
    const { isGpt5Family } = await import("@/lib/ai/runAITask.server");
    const isGpt5 = isGpt5Family(__modelIdUsed, "lovable");
    const provOpts = (callOptionsWithDefaults.providerOptions ?? {}) as
      Record<string, Record<string, unknown> | undefined>;
    const hasMaxCompletion = !!(
      (provOpts.openai as { maxCompletionTokens?: number } | undefined)?.maxCompletionTokens ??
      (provOpts.lovable as { maxCompletionTokens?: number } | undefined)?.maxCompletionTokens
    );
    if (callOptionsWithDefaults.maxOutputTokens === undefined && !hasMaxCompletion) {
      if (isGpt5) {
        // GPT-5 refuse max_tokens → max_completion_tokens via providerOptions
        const key = provOpts.lovable !== undefined ? "lovable" : "openai";
        callOptionsWithDefaults.providerOptions = {
          ...provOpts,
          [key]: { ...(provOpts[key] ?? {}), maxCompletionTokens: 1600 },
        };
      } else {
        callOptionsWithDefaults.maxOutputTokens = 1600;
      }
    }


    let payload: AIAnalysisPayload;
    try {
      const result = await generateText({
        ...callOptionsWithDefaults,
        model,
        system: __systemPrompt,
        prompt: `Dossier patient complet :\n${JSON.stringify(dossier)}`,
        abortSignal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const { parseLlmJson } = await import("@/lib/llm/parseLlmJson");
      payload = parseLlmJson<AIAnalysisPayload>(result.text);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError" || msg.toLowerCase().includes("abort") || msg.toLowerCase().includes("timeout"))) {
        payload = buildFastConciliationPayload(dossier as AnalysisDossier, "l'analyse IA a dépassé le délai disponible");
      } else if (msg.includes("429")) {
        throw new Error("Limite IA atteinte, réessayez.");
      } else if (msg.includes("402")) {
        throw new Error("Crédits IA épuisés.");
      } else {
        console.warn("[conciliation_complete] IA indisponible, fallback rapide:", msg);
        payload = buildFastConciliationPayload(dossier as AnalysisDossier, "l'analyse IA complète est momentanément indisponible");
      }
    }

    await supabase.from("conciliation_ai_analyses").insert({
      episode_id: null,
      patient_id: data.patientId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      payload: payload as any,
      model: __modelIdUsed,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      analysis_type: "conciliation_complete" as any,
      run_tag: data.runTag ?? null,
      model_label: data.modelLabel ?? null,
    } as never);

    return payload;
  });
