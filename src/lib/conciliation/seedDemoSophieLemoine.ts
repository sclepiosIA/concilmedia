import { supabase } from "@/integrations/supabase/client";

/**
 * Cas clinique de démonstration n°2 — Mme Sophie LEMOINE, 68 ans
 *
 * Objectif : démontrer la détection de divergences thérapeutiques lors
 * d'une transition de soins (admission hospitalière).
 *
 * Ordonnance habituelle :
 *   - Apixaban 5 mg x2/j (anticoagulation FA)
 *   - Bisoprolol 5 mg/j
 *   - Metformine 1000 mg x2/j
 *
 * Prescription hospitalière :
 *   - Bisoprolol 5 mg/j         (maintenu)
 *   - Metformine 1000 mg x2/j   (maintenu)
 *   - Oméprazole 20 mg/j        (AJOUT)
 *
 * Divergences attendues :
 *   - OMISSION : Apixaban → absence d'anticoagulation chez patiente en FA
 *     (alerte clinique majeure : risque thromboembolique / AVC)
 *   - AJOUT : Oméprazole (sans justification documentée)
 */
export async function seedDemoSophieLemoine(): Promise<string> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Non connecté");

  const today = new Date();
  const dn = new Date(today.getFullYear() - 68, 5, 22).toISOString().slice(0, 10);
  const bioDate = new Date(today.getTime() - 86400000).toISOString().slice(0, 10);

  // 1) Patient
  const { data: patient, error: pErr } = await supabase
    .from("patients")
    .insert({
      created_by: u.user.id,
      nom: "Lemoine",
      prenom: "Sophie",
      date_naissance: dn,
      sexe: "F",
      poids_kg: 72,
      taille_cm: 165,
      nir: "2 57 06 75 220 045",
      notes:
        "Patiente admise pour bilan de chute mécanique. Cas démonstratif centré sur la conciliation médicamenteuse à l'admission (transition ville → hôpital).",
      cohort_tag: "demo",
    })
    .select("id")
    .single();
  if (pErr) throw pErr;
  const patientId = patient.id;

  // 2) Comorbidités
  await supabase.from("comorbidites").insert(
    [
      "Fibrillation auriculaire paroxystique (CHA2DS2-VASc = 4)",
      "Diabète de type 2 (HbA1c 7.1%)",
      "HTA essentielle",
    ].map((libelle) => ({ patient_id: patientId, libelle, statut: "actif" })),
  );

  // 3) Antécédents
  await supabase.from("antecedents").insert([
    {
      patient_id: patientId,
      type: "medical",
      description: "FA paroxystique diagnostiquée en 2022, sous anticoagulation orale directe",
      date_evenement: "2022-04-15",
      actif: true,
    },
    {
      patient_id: patientId,
      type: "medical",
      description: "HTA suivie depuis 2010",
      date_evenement: "2010-01-01",
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

  // 5) Biologie récente (fonction rénale conservée → Apixaban dose standard)
  await supabase.from("biologie_resultats").insert([
    { patient_id: patientId, parametre: "DFG (CKD-EPI)", valeur: 78, unite: "mL/min/1.73m²", date_prelevement: bioDate },
    { patient_id: patientId, parametre: "Créatinine", valeur: 72, unite: "µmol/L", date_prelevement: bioDate },
    { patient_id: patientId, parametre: "Kaliémie", valeur: 4.2, unite: "mmol/L", date_prelevement: bioDate },
    { patient_id: patientId, parametre: "HbA1c", valeur: 7.1, unite: "%", date_prelevement: bioDate },
    { patient_id: patientId, parametre: "Hémoglobine", valeur: 13.2, unite: "g/dL", date_prelevement: bioDate },
    { patient_id: patientId, parametre: "Plaquettes", valeur: 232, unite: "G/L", date_prelevement: bioDate },
  ]);

  // 6) Traitements habituels (ordonnance de ville)
  const traitements = [
    {
      dci: "Apixaban",
      nom_commercial: "Eliquis",
      dosage: "5",
      dosage_unite: "mg",
      posologie_matin: "1",
      posologie_soir: "1",
      voie_administration: "PO",
      indication: "Anticoagulation FA (CHA2DS2-VASc 4)",
    },
    {
      dci: "Bisoprolol",
      nom_commercial: "Cardensiel",
      dosage: "5",
      dosage_unite: "mg",
      posologie_matin: "1",
      voie_administration: "PO",
      indication: "Contrôle fréquence FA / HTA",
    },
    {
      dci: "Metformine",
      nom_commercial: "Glucophage",
      dosage: "1000",
      dosage_unite: "mg",
      posologie_matin: "1",
      posologie_soir: "1",
      voie_administration: "PO",
      indication: "Diabète type 2",
    },
  ].map((t) => ({ ...t, patient_id: patientId, source: "ordonnance", actif: true }));
  await supabase.from("traitements_habituels").insert(traitements);

  // 7) Épisode hospitalier
  const { data: episode, error: eErr } = await supabase
    .from("episodes")
    .insert({
      patient_id: patientId,
      motif: "Bilan post-chute mécanique sans traumatisme grave",
      service: "Médecine polyvalente",
    })
    .select("id")
    .single();
  if (eErr) throw eErr;
  const episodeId = episode.id;

  // 8) Prescription hospitalière — Apixaban OMIS, Oméprazole AJOUTÉ
  const presc = [
    {
      medicament: "Bisoprolol",
      dosage: "5 mg",
      posologie: "1 matin",
      voie_administration: "PO",
      indication: "Contrôle fréquence FA",
    },
    {
      medicament: "Metformine",
      dosage: "1000 mg",
      posologie: "1 matin + 1 soir",
      voie_administration: "PO",
      indication: "Diabète type 2",
    },
    {
      medicament: "Oméprazole",
      dosage: "20 mg",
      posologie: "1 matin",
      voie_administration: "PO",
      indication: "Protection gastrique (non documentée)",
    },
    // OMISSION volontaire : Apixaban (non justifiée) → absence d'anticoagulation
    // chez une patiente en FA avec CHA2DS2-VASc = 4 → risque thromboembolique majeur.
  ].map((p) => ({ ...p, episode_id: episodeId, patient_id: patientId, actif: true }));
  await supabase.from("prescriptions_hospitalieres").insert(presc);

  return patientId;
}
