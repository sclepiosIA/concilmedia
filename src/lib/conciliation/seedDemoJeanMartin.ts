import { supabase } from "@/integrations/supabase/client";

export async function seedDemoJeanMartin(): Promise<string> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Non connecté");

  const today = new Date();
  const dn = new Date(today.getFullYear() - 72, 4, 12).toISOString().slice(0, 10);

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
    "Insuffisance rénale chronique",
    "Obésité",
    "Fibrillation auriculaire",
  ].map((libelle) => ({ patient_id: patientId, libelle }));
  await supabase.from("comorbidites").insert(comorbidites);

  const traitements = [
    { dci: "Metformine", dosage: "1000", dosage_unite: "mg", posologie_matin: "1", posologie_soir: "1", voie_administration: "PO", indication: "Diabète" },
    { dci: "Ramipril", dosage: "10", dosage_unite: "mg", posologie_matin: "1", voie_administration: "PO", indication: "HTA" },
    { dci: "Amlodipine", dosage: "10", dosage_unite: "mg", posologie_matin: "1", voie_administration: "PO", indication: "HTA" },
    { dci: "Furosemide", dosage: "40", dosage_unite: "mg", posologie_matin: "1", voie_administration: "PO", indication: "IC" },
    { dci: "Apixaban", dosage: "5", dosage_unite: "mg", posologie_matin: "1", posologie_soir: "1", voie_administration: "PO", indication: "FA" },
    { dci: "Atorvastatine", dosage: "40", dosage_unite: "mg", posologie_soir: "1", voie_administration: "PO", indication: "Dyslipidémie" },
  ].map((t) => ({ ...t, patient_id: patientId, source: "patient", actif: true }));
  await supabase.from("traitements_habituels").insert(traitements);

  const { data: episode, error: eErr } = await supabase
    .from("episodes")
    .insert({
      patient_id: patientId,
      motif: "Décompensation cardiaque",
      service: "Cardiologie",
    })
    .select("id")
    .single();
  if (eErr) throw eErr;
  const episodeId = episode.id;

  const presc = [
    { medicament: "Ramipril", dosage: "10 mg", posologie: "1 matin", voie_administration: "PO" },
    { medicament: "Furosemide", dosage: "40 mg", posologie: "1 matin", voie_administration: "PO" },
    { medicament: "Atorvastatine", dosage: "40 mg", posologie: "1 soir", voie_administration: "PO" },
  ].map((p) => ({ ...p, episode_id: episodeId, patient_id: patientId, actif: true }));
  await supabase.from("prescriptions_hospitalieres").insert(presc);

  return patientId;
}
