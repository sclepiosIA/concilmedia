// Échelle de tri FRENCH-MED — priorité de relecture de la conciliation médicamenteuse.
// Inspirée de la FRENCH (SFMU), 5 paliers, du plus urgent (1) au moins urgent (5).

export type TriageLevel = 1 | 2 | 3 | 4 | 5;

export interface TriageMeta {
  level: TriageLevel;
  code: string;          // P1..P5
  label: string;         // "Immédiat", ...
  delay: string;         // "À relire maintenant", ...
  swatch: string;        // CSS color var
  fg: string;            // text color var
  bg: string;            // bg color var
  ring: string;          // border var
}

export const TRIAGE_META: Record<TriageLevel, TriageMeta> = {
  1: { level: 1, code: "P1", label: "Immédiat",     delay: "À relire maintenant",
       swatch: "var(--triage-1)", fg: "var(--triage-1-fg)", bg: "var(--triage-1-bg)", ring: "var(--triage-1-line)" },
  2: { level: 2, code: "P2", label: "Très urgent",  delay: "À relire < 1 h",
       swatch: "var(--triage-2)", fg: "var(--triage-2-fg)", bg: "var(--triage-2-bg)", ring: "var(--triage-2-line)" },
  3: { level: 3, code: "P3", label: "Urgent",       delay: "À relire < 6 h",
       swatch: "var(--triage-3)", fg: "var(--triage-3-fg)", bg: "var(--triage-3-bg)", ring: "var(--triage-3-line)" },
  4: { level: 4, code: "P4", label: "Standard",     delay: "À relire < 24 h",
       swatch: "var(--triage-4)", fg: "var(--triage-4-fg)", bg: "var(--triage-4-bg)", ring: "var(--triage-4-line)" },
  5: { level: 5, code: "P5", label: "Non urgent",   delay: "Relecture programmée / validée",
       swatch: "var(--triage-5)", fg: "var(--triage-5-fg)", bg: "var(--triage-5-bg)", ring: "var(--triage-5-line)" },
};

export type Gravite = "mineur" | "modere" | "majeur" | "critique";
export type NiveauRisque = "faible" | "modere" | "eleve" | "critique";

export interface PatientTriageInput {
  hasActiveEpisode: boolean;
  hasValidation: boolean;          // au moins une conciliation_validations pour le patient
  worstRisk: NiveauRisque | null;  // pire niveau parmi les épisodes
  // divergences non résolues (statut != 'resolu' et != 'non_applicable')
  divergencesByGravity: Record<Gravite, number>;
  nbDivergencesNonIntentionnelles: number;
  // analyse IA la plus ancienne en attente de relecture (ms since epoch) ou null
  oldestPendingAnalysisAt: number | null;
  // contexte clinique (utilisé pour la garde de sécurité gériatrique)
  age?: number | null;
  nbTraitements?: number;
  hasInsuffisanceRenale?: boolean;
}


export interface TriageDetails {
  divergences: Record<Gravite, number>;
  nbNonIntentionnelles: number;
  worstRisk: NiveauRisque | null;
  hasValidation: boolean;
  hasActiveEpisode: boolean;
  pendingSinceHours: number | null;
  riskComputed: boolean;
  analysisRun: boolean;
}

export interface TriageResult {
  level: TriageLevel;
  reason: string;
  details?: TriageDetails;
}

export function computePatientTriage(input: PatientTriageInput): TriageResult {
  const {
    hasActiveEpisode,
    hasValidation,
    worstRisk,
    divergencesByGravity,
    nbDivergencesNonIntentionnelles,
    oldestPendingAnalysisAt,
    age,
    nbTraitements,
    hasInsuffisanceRenale,
  } = input;

  const totalDiv =
    divergencesByGravity.mineur +
    divergencesByGravity.modere +
    divergencesByGravity.majeur +
    divergencesByGravity.critique;
  const analysisRun = totalDiv > 0 || oldestPendingAnalysisAt != null || worstRisk != null;

  let level: TriageLevel = 5;
  let reason = "Aucun épisode de conciliation en cours";

  if (hasActiveEpisode && !(hasValidation && nbDivergencesNonIntentionnelles === 0)) {
    // Par défaut, conciliation à faire — on ne préjuge plus du niveau de risque
    // quand aucune analyse n'a tourné.
    level = 4;
    reason = analysisRun
      ? "Conciliation à relire"
      : "Conciliation à initier — risque non évalué";

    if (divergencesByGravity.mineur > 0) {
      level = 4;
      reason = `${divergencesByGravity.mineur} divergence(s) mineure(s) non résolue(s)`;
    }

    if (divergencesByGravity.modere > 0 || worstRisk === "modere") {
      level = 3;
      reason = divergencesByGravity.modere > 0
        ? `${divergencesByGravity.modere} divergence(s) modérée(s) non résolue(s)`
        : "Score de risque modéré, en attente de relecture";
    }

    if (
      divergencesByGravity.majeur > 0 ||
      (worstRisk === "eleve" && !hasValidation) ||
      nbDivergencesNonIntentionnelles >= 3
    ) {
      level = 2;
      reason = divergencesByGravity.majeur > 0
        ? `${divergencesByGravity.majeur} divergence(s) majeure(s) non résolue(s)`
        : nbDivergencesNonIntentionnelles >= 3
          ? `${nbDivergencesNonIntentionnelles} divergences non intentionnelles`
          : "Score de risque élevé, non validé";
    }

    if (
      divergencesByGravity.critique > 0 ||
      (worstRisk === "critique" && !hasValidation)
    ) {
      level = 1;
      reason = divergencesByGravity.critique > 0
        ? `${divergencesByGravity.critique} divergence(s) critique(s) non résolue(s)`
        : "Score de risque critique, non validé";
    }

    // Garde de sécurité gériatrique : patient âgé polymédiqué ou IRC connue,
    // tant qu'on n'a pas calculé de score, on plafonne le triage à P3 mini.
    if (
      !analysisRun &&
      (age ?? 0) >= 75 &&
      ((nbTraitements ?? 0) >= 5 || hasInsuffisanceRenale === true)
    ) {
      if (level > 3) {
        level = 3;
        reason = "Patient âgé polymédiqué — priorisation à calculer";
      }
    }
  }
  // NB : la validation pharmacien n'écrase plus le niveau P — le patient est
  // archivé automatiquement par saveConciliationValidation, donc il sort
  // du flux actif tout en gardant son classement clinique réel.

  let pendingSinceHours: number | null = null;
  if (oldestPendingAnalysisAt != null) {
    pendingSinceHours = Math.round((Date.now() - oldestPendingAnalysisAt) / 36e5);
  }

  // Surcouche d'ancienneté : > 48 h en attente → on remonte d'un palier
  if (level > 1 && pendingSinceHours != null && pendingSinceHours > 48) {
    level = (level - 1) as TriageLevel;
    reason += ` · en attente depuis ${pendingSinceHours} h`;
  }


  return {
    level,
    reason,
    details: {
      divergences: { ...divergencesByGravity },
      nbNonIntentionnelles: nbDivergencesNonIntentionnelles,
      worstRisk,
      hasValidation,
      hasActiveEpisode,
      pendingSinceHours,
      riskComputed: worstRisk != null,
      analysisRun,
    },

  };
}

