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

type TimeoutError = Error & { name: "TimeoutError" };

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function drugLabel(row: Record<string, unknown>): string {
  return (
    asString(row.dci) ||
    asString(row.medicament) ||
    asString(row.nom_commercial) ||
    "Traitement non précisé"
  );
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

function compactText(value: unknown, maxLength = 180): string | null {
  const text = asString(value).replace(/\s+/g, " ");
  if (!text) return null;
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function compactRow(row: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(
    keys
      .map((key) => [key, compactText(row[key]) ?? row[key]] as const)
      .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== ""),
  );
}

function buildCompactAiDossier(dossier: AnalysisDossier) {
  return {
    patient: dossier.patient,
    allergies: dossier.allergies.slice(0, 8).map((r) => compactRow(r, ["substance", "reaction", "severite"])),
    antecedents: dossier.antecedents.slice(0, 10).map((r) => compactRow(r, ["libelle", "date_diagnostic", "commentaire"])),
    comorbidites: dossier.comorbidites.slice(0, 10).map((r) => compactRow(r, ["libelle", "severite"])),
    biologie_recente: dossier.biologie_recente.slice(0, 18).map((r) => compactRow(r, ["parametre", "valeur", "unite", "valeur_texte", "date_prelevement"])),
    traitements_habituels: dossier.traitements_habituels.slice(0, 24).map((r) => compactRow(r, ["dci", "nom_commercial", "dosage", "dosage_unite", "voie_administration", "posologie_matin", "posologie_midi", "posologie_soir", "posologie_coucher", "posologie_texte", "indication"])),
    prescriptions_hospitalieres: dossier.prescriptions_hospitalieres.slice(0, 24).map((r) => compactRow(r, ["medicament", "nom_commercial", "dosage", "dosage_unite", "voie_administration", "posologie_matin", "posologie_midi", "posologie_soir", "posologie_coucher", "posologie", "indication"])),
  };
}

async function withHardTimeout<T>(task: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      const error = new Error("timeout") as TimeoutError;
      error.name = "TimeoutError";
      reject(error);
    }, timeoutMs);
  });

  try {
    return await Promise.race([task(controller.signal), timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
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
  return (
    slots.join(", ") ||
    asString(row.posologie_texte) ||
    asString(row.posologie) ||
    "posologie non précisée"
  );
}

function buildFastConciliationPayload(dossier: AnalysisDossier, reason: string): AIAnalysisPayload {
  const ville = dossier.traitements_habituels
    .map((t) => ({ row: t, label: drugLabel(t), key: normalizeDrugName(drugLabel(t)) }))
    .filter((t) => t.key);
  const hopital = dossier.prescriptions_hospitalieres
    .map((p) => ({ row: p, label: drugLabel(p), key: normalizeDrugName(drugLabel(p)) }))
    .filter((p) => p.key);
  const hopitalKeys = new Set(hopital.map((p) => p.key));
  const villeKeys = new Set(ville.map((t) => t.key));
  const divergences: NonNullable<AIAnalysisPayload["divergences_conciliation"]> = [
    ...ville
      .filter((t) => !hopitalKeys.has(t.key))
      .slice(0, 12)
      .map((t) => ({
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
    ...hopital
      .filter((p) => !villeKeys.has(p.key))
      .slice(0, 8)
      .map((p) => ({
        type: "ajout_non_justifie" as const,
        medicament_ville: null,
        medicament_hopital: `${p.label} — ${doseSummary(p.row)}`,
        severite: "mineure" as const,
        justification_clinique:
          "Prescription hospitalière sans correspondance dans le traitement habituel importé.",
        risque: "Ajout potentiellement justifié par l'hospitalisation, à confirmer dans le dossier.",
        recommandation: `Confirmer l'indication hospitalière de ${p.label} et la durée prévue.`,
        alternative: "Arrêter ou tracer l'indication si non justifié.",
        confiance: 70,
        reference: "HAS conciliation médicamenteuse",
      })),
  ];
  const score = Math.min(
    100,
    20 + divergences.length * 6 + dossier.allergies.length * 4 + dossier.comorbidites.length * 2,
  );
  return {
    synthese: `Conciliation générée en mode rapide car ${reason}. ${ville.length} traitement(s) habituel(s) et ${hopital.length} prescription(s) hospitalière(s) ont été comparés. Les divergences listées doivent être vérifiées et validées par le pharmacien dans le contexte clinique du patient.`,
    score_risque: score,
    divergences_conciliation: divergences,
    actions_prioritaires: divergences.slice(0, 6).map((d) => ({
      action: d.recommandation,
      urgence: d.severite === "majeure" || d.severite === "critique" ? "immediate" : "24h",
      destinataire: "prescripteur",
      justification: d.justification_clinique,
    })),
    interactions: [],
    doublons_therapeutiques: [],
    contre_indications: [],
    redondances_classe: [],
    adaptations_posologiques: [],
    medicaments_haut_risque: [],
    allergies_croisees: [],
    surveillance: [
      {
        parametre: "Validation pharmaceutique",
        frequence: "Avant dispensation ou sortie",
        justification: "Résultat rapide basé sur rapprochement ville/hôpital à confirmer cliniquement.",
      },
    ],
    conclusion_clinique:
      "Prioriser la revue des omissions et des ajouts non justifiés, puis tracer les décisions de reprise, arrêt ou modification.",
  };
}

async function attachDeterministicAlerts(payload: AIAnalysisPayload, dossier: AnalysisDossier): Promise<AIAnalysisPayload> {
  try {
    const { computeDeterministicAlerts } = await import("./deterministicAlerts");
    const traitementsDci = [
      ...dossier.traitements_habituels.map((t) => drugLabel(t)),
      ...dossier.prescriptions_hospitalieres.map((p) => drugLabel(p)),
    ].filter(Boolean);
    const det = computeDeterministicAlerts({
      age: (dossier.patient.age as number | undefined) ?? null,
      comorbidites: dossier.comorbidites.map((c) => asString(c.libelle)).filter(Boolean),
      traitements_dci: traitementsDci,
    });
    payload.alertes_regles = det.all;
  } catch (e) {
    console.warn("[conciliation_complete] deterministic alerts failed:", e);
  }
  return payload;
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

    const systemPrompt = `Tu es pharmacien clinicien. Produis UNIQUEMENT un JSON court et valide de conciliation ville ↔ hôpital.
Schéma obligatoire: {"synthese":"2-3 phrases","score_risque":0-100,"divergences_conciliation":[{"type":"omission|ajout_non_justifie|switch|modification_posologie|substitution_classe","medicament_ville":null,"medicament_hopital":null,"severite":"mineure|moderee|majeure|critique","justification_clinique":"court","risque":"court","recommandation":"action concrète","alternative":"","confiance":0-100,"reference":"HAS/SFPC/ANSM"}],"actions_prioritaires":[{"action":"court","urgence":"immediate|24h|differee","destinataire":"prescripteur|IDE|patient","justification":"court"}],"interactions":[],"doublons_therapeutiques":[],"contre_indications":[],"redondances_classe":[],"adaptations_posologiques":[],"medicaments_haut_risque":[],"allergies_croisees":[],"surveillance":[{"parametre":"","frequence":"","justification":""}],"conclusion_clinique":"1 phrase"}.
Priorité: signaler surtout omissions/ajouts/switch/dose. Max 10 divergences, max 5 actions. Pas de doublons entre catégories. Réponses très concises.`;
    const { model, systemPrompt: __systemPrompt, callOptions, modelId: __modelIdUsed } = data.modelOverride
      ? await (await import("@/lib/ai/runAITask.server")).resolveAITaskWithOverride(
          { systemPrompt, model: __aiDefaultModel },
          data.modelOverride,
        )
      : await resolveAITask(__aiTaskSlug, { systemPrompt, model: __aiDefaultModel });

    // Garde-fou : on borne la durée d'appel et la longueur de sortie pour
    // éviter un "chargement infini" côté UI si le modèle traîne.
    const TIMEOUT_MS = 18_000;
    const callOptionsWithDefaults: Record<string, unknown> = { ...callOptions };
    const { isGpt5Family } = await import("@/lib/ai/runAITask.server");
    const isGpt5 = isGpt5Family(__modelIdUsed, "lovable");
    const provOpts = (callOptionsWithDefaults.providerOptions ?? {}) as
      Record<string, Record<string, unknown> | undefined>;

    if (isGpt5) {
      // Force verbosité minimale + raisonnement minimal pour latence courte.
      const key = provOpts.lovable !== undefined ? "lovable" : "openai";
      const existing = (provOpts[key] ?? {}) as Record<string, unknown>;
      callOptionsWithDefaults.providerOptions = {
        ...provOpts,
        [key]: {
          ...existing,
          verbosity: "low",
          reasoningEffort: "minimal",
          maxCompletionTokens: (existing.maxCompletionTokens as number | undefined) ?? 900,
        },
      };
    } else if (callOptionsWithDefaults.maxOutputTokens === undefined) {
      callOptionsWithDefaults.maxOutputTokens = 900;
    }


    let payload: AIAnalysisPayload;
    try {
      const result = await withHardTimeout(
        (signal) => generateText({
          ...callOptionsWithDefaults,
          model,
          system: __systemPrompt,
          prompt: `Dossier patient compact :\n${JSON.stringify(buildCompactAiDossier(dossier as AnalysisDossier))}`,
          abortSignal: signal,
        }),
        TIMEOUT_MS,
      );
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

    payload = await attachDeterministicAlerts(payload, dossier as AnalysisDossier);

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
