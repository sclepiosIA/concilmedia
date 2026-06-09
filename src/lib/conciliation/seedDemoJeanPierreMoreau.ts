import { supabase } from "@/integrations/supabase/client";
import { classifyDci } from "@/lib/conciliation/atcInteractions";
import { classifyDivergenceGravite } from "@/lib/clinical/complexityScore";

/**
 * Cas clinique de démonstration n°3 — M. Jean-Pierre MOREAU, 97 ans
 *
 * Patient âgé polymédiqué avec insuffisance rénale chronique stade 5
 * (DFG = 9 mL/min/1,73 m²), admis pour fracture du col fémoral droit
 * suite à chute mécanique.
 *
 * Démonstration : conciliation médicamenteuse complète à partir de
 * sources multiples (ordonnance de ville + prescription hospitalière)
 * chez un patient à très haut risque iatrogène.
 */
export async function seedDemoJeanPierreMoreau(): Promise<string> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Non connecté");

  const today = new Date();
  const dn = new Date(today.getFullYear() - 97, 2, 14).toISOString().slice(0, 10);
  const bioDate = new Date(today.getTime() - 86400000).toISOString().slice(0, 10);

  // 1) Patient
  const { data: patient, error: pErr } = await supabase
    .from("patients")
    .insert({
      created_by: u.user.id,
      nom: "Moreau",
      prenom: "Jean-Pierre",
      date_naissance: dn,
      sexe: "M",
      poids_kg: 92,
      taille_cm: 172,
      nir: "1 28 03 75 110 087",
      notes:
        "Patient de 97 ans, IMC 31,1 (obésité classe I), admis pour chute mécanique avec fracture du col fémoral droit. IRC stade 5 (DFG 9 mL/min). Cas démonstratif : conciliation médicamenteuse chez patient âgé polymédiqué à haut risque iatrogène.",
      cohort_tag: "demo",
    })
    .select("id")
    .single();
  if (pErr) throw pErr;
  const patientId = patient.id;

  // 2) Comorbidités
  await supabase.from("comorbidites").insert(
    [
      "Insuffisance rénale chronique stade 5 (DFG 9 mL/min)",
      "Diabète de type 2 (HbA1c 7%)",
      "Hypertension artérielle",
      "Obésité (IMC 31,1 kg/m² — classe I)",
    ].map((libelle) => ({ patient_id: patientId, libelle, statut: "actif" })),
  );

  // 3) Antécédents
  await supabase.from("antecedents").insert([
    {
      patient_id: patientId,
      type: "medical",
      description: "Fracture du col fémoral droit suite à chute mécanique (motif d'hospitalisation)",
      date_evenement: today.toISOString().slice(0, 10),
      actif: true,
    },
    {
      patient_id: patientId,
      type: "medical",
      description: "IRC stade 5 suivie en néphrologie, sous darbépoétine",
      actif: true,
    },
  ]);

  // 4) Allergies
  await supabase.from("allergies").insert([
    {
      patient_id: patientId,
      substance: "Aucune allergie médicamenteuse connue",
      reaction: "—",
      severite: "leger",
    },
  ]);

  // 5) Biologie
  await supabase.from("biologie_resultats").insert([
    { patient_id: patientId, parametre: "Créatinine", valeur: 472.6, unite: "µmol/L", date_prelevement: bioDate },
    { patient_id: patientId, parametre: "DFG (CKD-EPI)", valeur: 9, unite: "mL/min/1.73m²", date_prelevement: bioDate },
    { patient_id: patientId, parametre: "Glycémie", valeur: 16.4, unite: "mmol/L", date_prelevement: bioDate },
    { patient_id: patientId, parametre: "HbA1c", valeur: 7, unite: "%", date_prelevement: bioDate },
    { patient_id: patientId, parametre: "Kaliémie", valeur: 3.3, unite: "mmol/L", date_prelevement: bioDate },
    { patient_id: patientId, parametre: "CRP", valeur: 9.8, unite: "mg/L", date_prelevement: bioDate },
    { patient_id: patientId, parametre: "PAS", valeur: 154, unite: "mmHg", date_prelevement: bioDate },
  ]);

  // 6) Traitements habituels (ordonnance de ville)
  const traitements = [
    {
      dci: "Empagliflozine",
      nom_commercial: "Jardiance",
      dosage: "10",
      dosage_unite: "mg",
      posologie_matin: "1",
      voie_administration: "PO",
      indication: "Diabète type 2",
    },
    {
      dci: "Orlistat",
      nom_commercial: "Xenical",
      dosage: "120",
      dosage_unite: "mg",
      posologie_matin: "1",
      posologie_midi: "1",
      posologie_soir: "1",
      voie_administration: "PO",
      indication: "Obésité — avant les repas",
    },
    {
      dci: "Lisinopril",
      nom_commercial: "Zestril",
      dosage: "10",
      dosage_unite: "mg",
      posologie_matin: "1",
      voie_administration: "PO",
      indication: "HTA",
    },
    {
      dci: "Paracétamol",
      nom_commercial: "Doliprane",
      dosage: "500",
      dosage_unite: "mg",
      posologie_matin: "si douleur",
      voie_administration: "PO",
      indication: "Antalgique si besoin",
    },
    {
      dci: "Darbépoétine alfa",
      nom_commercial: "Aranesp",
      dosage: "30",
      dosage_unite: "µg",
      posologie_matin: "1 injection / semaine",
      voie_administration: "SC",
      indication: "Anémie sur IRC",
    },
    {
      dci: "Patiromer",
      nom_commercial: "Veltassa",
      dosage: "8.4",
      dosage_unite: "g",
      posologie_matin: "1 sachet/j",
      voie_administration: "PO",
      indication: "Hyperkaliémie sur IRC",
    },
  ].map((t) => ({ ...t, patient_id: patientId, source: "ordonnance", actif: true }));
  await supabase.from("traitements_habituels").insert(traitements);

  // 7) Épisode hospitalier
  const { data: episode, error: eErr } = await supabase
    .from("episodes")
    .insert({
      patient_id: patientId,
      motif: "Chute mécanique — fracture du col fémoral droit",
      service: "Orthopédie / Gériatrie",
    })
    .select("id")
    .single();
  if (eErr) throw eErr;
  const episodeId = episode.id;

  // 8) Prescription hospitalière
  const presc = [
    { medicament: "Empagliflozine", dosage: "10 mg", posologie: "1 matin", voie_administration: "PO", indication: "Diabète (maintenu)" },
    { medicament: "Méthylprednisolone", dosage: "40 mg", posologie: "1/j", voie_administration: "IV", indication: "Corticothérapie péri-opératoire" },
    { medicament: "Orlistat", dosage: "120 mg", posologie: "3/j", voie_administration: "PO", indication: "Obésité (maintenu)" },
    { medicament: "Paracétamol", dosage: "1 g", posologie: "x4/j", voie_administration: "PO", indication: "Antalgie" },
    { medicament: "Lisinopril", dosage: "10 mg", posologie: "1 matin", voie_administration: "PO", indication: "HTA (maintenu)" },
    { medicament: "Ondansétron", dosage: "4 mg", posologie: "x3/j si besoin", voie_administration: "IV", indication: "Nausées post-op" },
    { medicament: "KCl", dosage: "2 g", posologie: "1/j", voie_administration: "IV", indication: "Hypokaliémie (K=3,3)" },
    { medicament: "Pipéracilline-Tazobactam", dosage: "4 g / 0,5 g", posologie: "x3/j", voie_administration: "IV", indication: "Antibioprophylaxie / infection" },
    { medicament: "NaCl 0,9 %", dosage: "500 mL", posologie: "x2/j", voie_administration: "IV", indication: "Hydratation" },
    { medicament: "Vancomycine", dosage: "1 g", posologie: "x2/j", voie_administration: "IV", indication: "Couverture Gram+ / SARM" },
    { medicament: "Darbépoétine alfa", dosage: "30 µg", posologie: "1/sem", voie_administration: "SC", indication: "Anémie IRC (maintenu)" },
  ].map((p) => ({ ...p, episode_id: episodeId, patient_id: patientId, actif: true }));
  const { data: prescRows } = await supabase
    .from("prescriptions_hospitalieres")
    .insert(presc)
    .select("id, medicament");

  const findRx = (name: string) => (prescRows ?? []).find((p) => p.medicament === name);
  const now = new Date().toISOString();

  // 9) Divergences de conciliation pré-calculées
  const rows: any[] = [];

  // OMISSION : Patiromer (non poursuivi à l'hôpital alors que K=3,3 et IRC sévère)
  const patiromerClasse = classifyDci("Patiromer");
  rows.push({
    episode_id: episodeId,
    patient_id: patientId,
    phase: "entree",
    medication_domicile: {
      dci: "Patiromer",
      dosage: "8,4 g",
      posologie: "1 sachet/j",
      voie: "PO",
      indication: "Hyperkaliémie sur IRC stade 5",
      source: "ordonnance",
    },
    medication_hospitalisation: null,
    type_divergence: "omission",
    intention: "non_intentionnel",
    justification: null,
    action_corrective:
      "Réévaluer la poursuite du Patiromer — IRC stade 5 (DFG 9), kaliémie actuelle 3,3 mmol/L. À adapter selon surveillance ionique rapprochée.",
    statut: "non_traite",
    date_analyse: now,
    gravite: classifyDivergenceGravite(patiromerClasse, "omission"),
    classe_atc: patiromerClasse,
  });

  // AJOUT : Méthylprednisolone (corticothérapie — risque hyperglycémie et infection)
  const methylClasse = classifyDci("Méthylprednisolone");
  rows.push({
    episode_id: episodeId,
    patient_id: patientId,
    phase: "entree",
    medication_domicile: null,
    medication_hospitalisation: {
      dci: "Méthylprednisolone",
      dosage: "40 mg IV",
      posologie: "1/j",
      prescription_id: findRx("Méthylprednisolone")?.id,
    },
    type_divergence: "ajout",
    intention: "intentionnel",
    justification: "Corticothérapie péri-opératoire",
    action_corrective:
      "Surveiller glycémie (DT2 déséquilibré, glycémie 16,4) et risque infectieux (antibiothérapie large déjà en cours).",
    statut: "non_traite",
    date_analyse: now,
    gravite: classifyDivergenceGravite(methylClasse, "ajout"),
    classe_atc: methylClasse,
  });

  // AJOUT : Vancomycine IV — médicament à haut risque néphrotoxique en IRC stade 5
  const vancoClasse = classifyDci("Vancomycine");
  rows.push({
    episode_id: episodeId,
    patient_id: patientId,
    phase: "entree",
    medication_domicile: null,
    medication_hospitalisation: {
      dci: "Vancomycine",
      dosage: "1 g IV",
      posologie: "x2/j",
      prescription_id: findRx("Vancomycine")?.id,
    },
    type_divergence: "ajout",
    intention: "a_evaluer",
    justification: null,
    action_corrective:
      "ADAPTATION POSOLOGIQUE IMPÉRATIVE : DFG = 9 mL/min. Vancomycine 1 g x2/j inadaptée. Recommandation : dose de charge 25-30 mg/kg puis dosage des taux résiduels avant chaque administration (cible 15-20 mg/L). Risque néphrotoxique majoré.",
    statut: "non_traite",
    date_analyse: now,
    gravite: classifyDivergenceGravite(vancoClasse, "ajout"),
    classe_atc: vancoClasse,
  });

  // AJOUT : Pipéracilline-Tazobactam — adaptation rénale nécessaire
  const pipClasse = classifyDci("Pipéracilline");
  rows.push({
    episode_id: episodeId,
    patient_id: patientId,
    phase: "entree",
    medication_domicile: null,
    medication_hospitalisation: {
      dci: "Pipéracilline-Tazobactam",
      dosage: "4 g / 0,5 g IV",
      posologie: "x3/j",
      prescription_id: findRx("Pipéracilline-Tazobactam")?.id,
    },
    type_divergence: "ajout",
    intention: "a_evaluer",
    justification: null,
    action_corrective:
      "Adapter la posologie à la fonction rénale (DFG 9) : réduire à 4 g / 0,5 g toutes les 12 h. Association vanco + pip-tazo majore le risque de néphrotoxicité (AKI).",
    statut: "non_traite",
    date_analyse: now,
    gravite: classifyDivergenceGravite(pipClasse, "ajout"),
    classe_atc: pipClasse,
  });

  // ADAPTATION POSOLOGIQUE : Empagliflozine — CONTRE-INDIQUÉE si DFG < 20
  const empaClasse = classifyDci("Empagliflozine");
  rows.push({
    episode_id: episodeId,
    patient_id: patientId,
    phase: "entree",
    medication_domicile: {
      dci: "Empagliflozine",
      dosage: "10 mg",
      posologie: "1 matin",
      indication: "DT2",
    },
    medication_hospitalisation: {
      dci: "Empagliflozine",
      dosage: "10 mg",
      posologie: "1 matin",
      prescription_id: findRx("Empagliflozine")?.id,
    },
    type_divergence: "modification_dose",
    intention: "non_intentionnel",
    justification: null,
    action_corrective:
      "CONTRE-INDICATION : Empagliflozine non recommandée si DFG < 20 mL/min (RCP) — à arrêter. Risque d'acidocétose euglycémique et d'aggravation de la fonction rénale. Relais insuline indispensable (glycémie 16,4 mmol/L).",
    statut: "non_traite",
    date_analyse: now,
    gravite: classifyDivergenceGravite(empaClasse, "modification"),
    classe_atc: empaClasse,
  });

  // ADAPTATION : Lisinopril — à suspendre en péri-opératoire + IRC stade 5
  const lisinoClasse = classifyDci("Lisinopril");
  rows.push({
    episode_id: episodeId,
    patient_id: patientId,
    phase: "entree",
    medication_domicile: {
      dci: "Lisinopril",
      dosage: "10 mg",
      posologie: "1 matin",
      indication: "HTA",
    },
    medication_hospitalisation: {
      dci: "Lisinopril",
      dosage: "10 mg",
      posologie: "1 matin",
      prescription_id: findRx("Lisinopril")?.id,
    },
    type_divergence: "modification_dose",
    intention: "a_evaluer",
    justification: null,
    action_corrective:
      "IEC à suspendre en péri-opératoire et à réévaluer (IRC stade 5, DFG 9, risque d'AKI et d'hyperkaliémie). Préférer un autre antihypertenseur si nécessaire.",
    statut: "non_traite",
    date_analyse: now,
    gravite: classifyDivergenceGravite(lisinoClasse, "modification"),
    classe_atc: lisinoClasse,
  });

  await supabase.from("conciliation_medicaments").insert(rows as never);

  return patientId;
}
