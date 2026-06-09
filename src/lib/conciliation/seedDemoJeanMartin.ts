import { supabase } from "@/integrations/supabase/client";

export async function seedDemoJeanMartin(): Promise<string> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Non connecté");

  const today = new Date();
  const dn = new Date(today.getFullYear() - 72, 4, 12).toISOString().slice(0, 10);
  const bioDate = new Date(today.getTime() - 2 * 86400000).toISOString().slice(0, 10);

  const { data: patient, error: pErr } = await supabase
    .from("patients")
    .insert({
      created_by: u.user.id,
      nom: "Martin",
      prenom: "Jean",
      date_naissance: dn,
      sexe: "M",
      poids_kg: 92,
      taille_cm: 172,
      cohort_tag: "demo",
    })
    .select("id")
    .single();
  if (pErr) throw pErr;
  const patientId = patient.id;

  const comorbidites = [
    "HTA",
    "Diabète type 2",
    "Insuffisance rénale chronique stade 3B",
    "Fibrillation auriculaire",
    "Obésité",
    "Dyslipidémie",
  ].map((libelle) => ({ patient_id: patientId, libelle, statut: "actif" }));
  await supabase.from("comorbidites").insert(comorbidites);

  await supabase.from("antecedents").insert([
    { patient_id: patientId, type: "medical", description: "Infarctus du myocarde (2019)", date_evenement: "2019-03-10", actif: true },
    { patient_id: patientId, type: "chirurgical", description: "Pose de stent coronarien", date_evenement: "2019-03-12", actif: true },
  ]);

  await supabase.from("allergies").insert([
    { patient_id: patientId, substance: "Pénicilline", reaction: "Rash cutané généralisé", severite: "modere" },
    { patient_id: patientId, substance: "Iode (produits de contraste)", reaction: "Œdème de Quincke", severite: "severe" },
  ]);

  await supabase.from("biologie_resultats").insert([
    { patient_id: patientId, parametre: "DFG (MDRD)", valeur: 38, unite: "mL/min/1.73m²", date_prelevement: bioDate },
    { patient_id: patientId, parametre: "Créatinine", valeur: 168, unite: "µmol/L", date_prelevement: bioDate },
    { patient_id: patientId, parametre: "Kaliémie", valeur: 5.3, unite: "mmol/L", date_prelevement: bioDate },
    { patient_id: patientId, parametre: "INR", valeur: 3.8, unite: "", date_prelevement: bioDate },
    { patient_id: patientId, parametre: "HbA1c", valeur: 8.2, unite: "%", date_prelevement: bioDate },
    { patient_id: patientId, parametre: "Hémoglobine", valeur: 11.4, unite: "g/dL", date_prelevement: bioDate },
  ]);

  const traitements = [
    { dci: "Metformine", dosage: "1000", dosage_unite: "mg", posologie_matin: "1", posologie_soir: "1", voie_administration: "PO", indication: "Diabète" },
    { dci: "Ramipril", dosage: "10", dosage_unite: "mg", posologie_matin: "1", voie_administration: "PO", indication: "HTA / post-IDM" },
    { dci: "Amlodipine", dosage: "10", dosage_unite: "mg", posologie_matin: "1", voie_administration: "PO", indication: "HTA" },
    { dci: "Furosemide", dosage: "40", dosage_unite: "mg", posologie_matin: "1", voie_administration: "PO", indication: "Oedèmes / IRC" },
    { dci: "Atorvastatine", dosage: "40", dosage_unite: "mg", posologie_soir: "1", voie_administration: "PO", indication: "Dyslipidémie" },
    { dci: "Warfarine", dosage: "5", dosage_unite: "mg", posologie_soir: "1", voie_administration: "PO", indication: "FA - anticoagulation" },
    { dci: "Bisoprolol", dosage: "5", dosage_unite: "mg", posologie_matin: "1", voie_administration: "PO", indication: "FA / post-IDM" },
    { dci: "Aspirine", dosage: "75", dosage_unite: "mg", posologie_matin: "1", voie_administration: "PO", indication: "Antiagrégation post-stent" },
  ].map((t) => ({ ...t, patient_id: patientId, source: "patient", actif: true }));
  await supabase.from("traitements_habituels").insert(traitements);

  const { data: episode, error: eErr } = await supabase
    .from("episodes")
    .insert({
      patient_id: patientId,
      motif: "Décompensation cardiaque + déséquilibre métabolique",
      service: "Médecine interne",
    })
    .select("id")
    .single();
  if (eErr) throw eErr;
  const episodeId = episode.id;

  // Prescriptions hospitalières — volontairement divergentes pour la démo
  const presc = [
    // Ramipril : dose réduite (IRC)
    { medicament: "Ramipril", dosage: "5 mg", posologie: "1 matin", voie_administration: "PO" },
    // Furosemide : dose augmentée
    { medicament: "Furosemide", dosage: "80 mg", posologie: "1 matin, 1 midi", voie_administration: "PO" },
    // Atorvastatine identique
    { medicament: "Atorvastatine", dosage: "40 mg", posologie: "1 soir", voie_administration: "PO" },
    // Bisoprolol identique
    { medicament: "Bisoprolol", dosage: "5 mg", posologie: "1 matin", voie_administration: "PO" },
    // Warfarine remplacée par HBPM (ajout)
    { medicament: "Enoxaparine", dosage: "4000 UI", posologie: "1 sous-cutanée /jour", voie_administration: "SC", indication: "Relais anticoagulation" },
    // IPP ajouté (prophylaxie)
    { medicament: "Pantoprazole", dosage: "40 mg", posologie: "1 matin", voie_administration: "PO", indication: "Prophylaxie ulcère" },
    // Metformine, Amlodipine, Aspirine : OMIS volontairement (divergences à détecter)
  ].map((p) => ({ ...p, episode_id: episodeId, patient_id: patientId, actif: true }));
  await supabase.from("prescriptions_hospitalieres").insert(presc);

  return patientId;
}
