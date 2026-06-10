/**
 * Moteur déterministe : produit des alertes vérifiables et reproductibles
 * (≠ alertes LLM hallucinables) en exécutant les couples d'interactions de
 * classes ATC et les critères STOPP/START sur la liste des traitements.
 *
 * Source : `atcInteractions.ts` + `stoppStart.ts` (jamais branchés jusqu'ici).
 */
import {
  classifyDci,
  CLASS_INTERACTIONS,
  ATC_LABELS,
  severityGravite,
  type AtcClassKey,
} from "./atcInteractions";
import { evaluateStoppForDci } from "./stoppStart";

export type DeterministicAlert =
  | {
      source: "regle";
      type: "interaction";
      severite: "mineur" | "modere" | "majeur" | "critique";
      libelle: string;
      mecanisme: string;
      reference: string;
      classes: [AtcClassKey, AtcClassKey];
      dci_concernes: string[];
    }
  | {
      source: "regle";
      type: "stopp";
      id: string;
      severite: "mineur" | "modere" | "majeur" | "critique";
      libelle: string;
      reference: string;
      classe: AtcClassKey;
      dci: string;
      dci_concernes?: string[];
    };


export interface DeterministicAlertsInput {
  age: number | null;
  comorbidites: string[];
  traitements_dci: string[];
}

export interface DeterministicAlertsResult {
  interactions: Extract<DeterministicAlert, { type: "interaction" }>[];
  stopp: Extract<DeterministicAlert, { type: "stopp" }>[];
  all: DeterministicAlert[];
  classes_detectees: AtcClassKey[];
}

export function computeDeterministicAlerts(
  input: DeterministicAlertsInput,
): DeterministicAlertsResult {
  const traitements = (input.traitements_dci ?? [])
    .map((d) => (d ?? "").trim())
    .filter((d) => d.length > 0);

  const classified = traitements.map((dci) => ({ dci, classe: classifyDci(dci) }));
  const presentClasses = new Set<AtcClassKey>(classified.map((c) => c.classe));
  const coTraitements = Array.from(presentClasses);

  // 1. Interactions de classe (couples ATC)
  const interactions: Extract<DeterministicAlert, { type: "interaction" }>[] = [];
  for (const rule of CLASS_INTERACTIONS) {
    if (!presentClasses.has(rule.a) || !presentClasses.has(rule.b)) continue;
    const dciA = classified.filter((c) => c.classe === rule.a).map((c) => c.dci);
    const dciB = classified.filter((c) => c.classe === rule.b).map((c) => c.dci);
    interactions.push({
      source: "regle",
      type: "interaction",
      severite: severityGravite(rule.severite),
      libelle: `${ATC_LABELS[rule.a]} + ${ATC_LABELS[rule.b]}`,
      mecanisme: rule.mecanisme,
      reference: "Référentiel interne ATC",
      classes: [rule.a, rule.b],
      dci_concernes: Array.from(new Set([...dciA, ...dciB])),
    });
  }

  // 2. Critères STOPP/START par DCI
  const stopp: Extract<DeterministicAlert, { type: "stopp" }>[] = [];
  for (const { dci, classe } of classified) {
    const rules = evaluateStoppForDci(
      dci,
      classe,
      input.age,
      input.comorbidites ?? [],
      coTraitements,
    );
    for (const rule of rules) {
      stopp.push({
        source: "regle",
        type: "stopp",
        id: rule.id,
        severite: rule.gravite,
        libelle: rule.label,
        reference: "STOPP/START v2",
        classe,
        dci,
      });
    }
  }

  return {
    interactions,
    stopp,
    all: [...interactions, ...stopp],
    classes_detectees: Array.from(presentClasses),
  };
}
