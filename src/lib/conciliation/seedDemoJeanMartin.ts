import { supabase } from "@/integrations/supabase/client";

/**
 * Cas clinique de démonstration — M. Jean MARTIN, 78 ans
 * Profil ultra-réaliste conçu pour déclencher l'ensemble des fonctionnalités
 * de Concil Med IA lors du Datathon :
 *  - IMC obèse (calcul auto)
 *  - 7 comorbidités (IRC stade 3B, FA, IDM, diabète déséquilibré, HTA, BPCO, dyslipidémie)
 *  - 3 allergies dont 1 sévère + 1 à risque croisé
 *  - Biologie pathologique (DFG bas, K+ haut, INR sur-dosé, HbA1c, Hb basse, ASAT/ALAT)
 *  - 10 traitements domicile (polymédication)
 *  - Prescription hospitalière contenant divergences volontaires :
 *      * Omissions (Metformine, Amlodipine, Aspirine)
 *      * Modifications de dose (Ramipril, Furosemide)
 *      * Ajouts (Enoxaparine, Pantoprazole, Ceftriaxone, Tramadol)
 *      * Interactions attendues (Warfarine ↔ AINS / Tramadol ↔ ISRS)
 *      * Contre-indication (Ceftriaxone si allergie pénicilline = croisée)
 */
export async function seedDemoJeanMartin(): Promise<string> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Non connecté");

  const today = new Date();
  const dn = new Date(today.getFullYear() - 78, 2, 14).toISOString().slice(0, 10);
  const bioDate = new Date(today.getTime() - 2 * 86400000).toISOString().slice(0, 10);
  const bioDateOld = new Date(today.getTime() - 30 * 86400000).toISOString().slice(0, 10);

  // 1) Patient — IMC 31.1 (obésité classe I)
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
      nir: "1 48 03 75 114 087",
      notes: "Patient adressé par le Dr Dubois (médecin traitant) pour décompensation cardiaque globale et déséquilibre métabolique. Vit seul à domicile, autonomie partielle, observance médicamenteuse fluctuante.",
      cohort_tag: "demo",
    })
    .select("id")
    .single();
  if (pErr) throw pErr;
  const patientId = patient.id;

  // 2) Comorbidités multiples (déclenche profil de risque cardio + rénal + métabolique)
  const comorbidites = [
    "HTA essentielle (depuis 2005)",
    "Diabète de type 2 mal équilibré (HbA1c 8.4%)",
    "Insuffisance rénale chronique stade 3B (DFG 34 mL/min)",
    "Fibrillation auriculaire permanente",
    "Cardiopathie ischémique post-IDM (2019, stents actifs)",
    "Insuffisance cardiaque NYHA II-III (FEVG 38%)",
    "BPCO stade II (GOLD)",
    "Dyslipidémie mixte",
    "Obésité grade I (IMC 31.1)",
  ].map((libelle) => ({ patient_id: patientId, libelle, statut: "actif" }));
  await supabase.from("comorbidites").insert(comorbidites);

  // 3) Antécédents médicaux & chirurgicaux
  await supabase.from("antecedents").insert([
    { patient_id: patientId, type: "medical", description: "Infarctus du myocarde antérieur (mars 2019)", date_evenement: "2019-03-10", actif: true },
    { patient_id: patientId, type: "chirurgical", description: "Angioplastie + pose de 2 stents actifs (IVA, Cx)", date_evenement: "2019-03-12", actif: true },
    { patient_id: patientId, type: "medical", description: "AVC ischémique mineur (séquelles motrices régressives)", date_evenement: "2021-09-04", actif: true },
    { patient_id: patientId, type: "chirurgical", description: "Cholécystectomie", date_evenement: "2008-06-18", actif: true },
    { patient_id: patientId, type: "medical", description: "2 décompensations cardiaques en 2024", date_evenement: "2024-11-20", actif: true },
  ]);

  // 4) Allergies (dont allergie croisée pénicilline ↔ céphalosporines)
  await supabase.from("allergies").insert([
    { patient_id: patientId, substance: "Pénicilline", reaction: "Urticaire généralisée + œdème labial", severite: "severe" },
    { patient_id: patientId, substance: "Iode (produits de contraste)", reaction: "Œdème de Quincke", severite: "severe" },
    { patient_id: patientId, substance: "Sulfamides", reaction: "Rash maculo-papuleux", severite: "modere" },
  ]);

  // 5) Biologie pathologique récente + ancienne (pour démontrer évolution)
  await supabase.from("biologie_resultats").insert([
    // J-2 (récents) — tous pathologiques
    { patient_id: patientId, parametre: "DFG (CKD-EPI)", valeur: 34, unite: "mL/min/1.73m²", date_prelevement: bioDate },
    { patient_id: patientId, parametre: "Créatinine", valeur: 182, unite: "µmol/L", date_prelevement: bioDate },
    { patient_id: patientId, parametre: "Kaliémie", valeur: 5.6, unite: "mmol/L", date_prelevement: bioDate },
    { patient_id: patientId, parametre: "Natrémie", valeur: 132, unite: "mmol/L", date_prelevement: bioDate },
    { patient_id: patientId, parametre: "INR", valeur: 4.2, unite: "", date_prelevement: bioDate },
    { patient_id: patientId, parametre: "HbA1c", valeur: 8.4, unite: "%", date_prelevement: bioDate },
    { patient_id: patientId, parametre: "Glycémie à jeun", valeur: 1.78, unite: "g/L", date_prelevement: bioDate },
    { patient_id: patientId, parametre: "Hémoglobine", valeur: 10.8, unite: "g/dL", date_prelevement: bioDate },
    { patient_id: patientId, parametre: "Plaquettes", valeur: 142, unite: "G/L", date_prelevement: bioDate },
    { patient_id: patientId, parametre: "ASAT", valeur: 68, unite: "UI/L", date_prelevement: bioDate },
    { patient_id: patientId, parametre: "ALAT", valeur: 74, unite: "UI/L", date_prelevement: bioDate },
    { patient_id: patientId, parametre: "CRP", valeur: 86, unite: "mg/L", date_prelevement: bioDate },
    { patient_id: patientId, parametre: "BNP", valeur: 1240, unite: "pg/mL", date_prelevement: bioDate },
    { patient_id: patientId, parametre: "Troponine T hs", valeur: 42, unite: "ng/L", date_prelevement: bioDate },
    // J-30 (historique pour comparaison)
    { patient_id: patientId, parametre: "DFG (CKD-EPI)", valeur: 42, unite: "mL/min/1.73m²", date_prelevement: bioDateOld },
    { patient_id: patientId, parametre: "Kaliémie", valeur: 4.8, unite: "mmol/L", date_prelevement: bioDateOld },
    { patient_id: patientId, parametre: "INR", valeur: 2.6, unite: "", date_prelevement: bioDateOld },
  ]);

  // 6) Traitements habituels — 10 médicaments (polymédication)
  const traitements = [
    { dci: "Metformine", nom_commercial: "Glucophage", dosage: "1000", dosage_unite: "mg", posologie_matin: "1", posologie_soir: "1", voie_administration: "PO", indication: "Diabète type 2" },
    { dci: "Gliclazide", nom_commercial: "Diamicron LM", dosage: "30", dosage_unite: "mg", posologie_matin: "2", voie_administration: "PO", indication: "Diabète type 2" },
    { dci: "Ramipril", nom_commercial: "Triatec", dosage: "10", dosage_unite: "mg", posologie_matin: "1", voie_administration: "PO", indication: "HTA / post-IDM / IC" },
    { dci: "Amlodipine", nom_commercial: "Amlor", dosage: "10", dosage_unite: "mg", posologie_matin: "1", voie_administration: "PO", indication: "HTA" },
    { dci: "Furosemide", nom_commercial: "Lasilix", dosage: "40", dosage_unite: "mg", posologie_matin: "1", voie_administration: "PO", indication: "Insuffisance cardiaque / IRC" },
    { dci: "Spironolactone", nom_commercial: "Aldactone", dosage: "25", dosage_unite: "mg", posologie_matin: "1", voie_administration: "PO", indication: "Insuffisance cardiaque (FEVG abaissée)" },
    { dci: "Atorvastatine", nom_commercial: "Tahor", dosage: "40", dosage_unite: "mg", posologie_soir: "1", voie_administration: "PO", indication: "Dyslipidémie post-IDM" },
    { dci: "Warfarine", nom_commercial: "Coumadine", dosage: "5", dosage_unite: "mg", posologie_soir: "1", voie_administration: "PO", indication: "Anticoagulation FA" },
    { dci: "Bisoprolol", nom_commercial: "Cardensiel", dosage: "5", dosage_unite: "mg", posologie_matin: "1", voie_administration: "PO", indication: "FA / IC / post-IDM" },
    { dci: "Aspirine", nom_commercial: "Kardégic", dosage: "75", dosage_unite: "mg", posologie_matin: "1", voie_administration: "PO", indication: "Antiagrégation post-stent" },
    { dci: "Sertraline", nom_commercial: "Zoloft", dosage: "50", dosage_unite: "mg", posologie_matin: "1", voie_administration: "PO", indication: "Syndrome dépressif post-AVC" },
    { dci: "Ibuprofène", nom_commercial: "Advil", dosage: "400", dosage_unite: "mg", posologie_matin: "1", posologie_midi: "1", posologie_soir: "1", voie_administration: "PO", indication: "Automédication gonalgies (non prescrit)" },
  ].map((t) => ({ ...t, patient_id: patientId, source: "patient", actif: true }));
  await supabase.from("traitements_habituels").insert(traitements);

  // 7) Épisode d'hospitalisation
  const { data: episode, error: eErr } = await supabase
    .from("episodes")
    .insert({
      patient_id: patientId,
      motif: "Décompensation cardiaque globale + sepsis urinaire + déséquilibre diabétique",
      service: "Médecine interne — Unité de gériatrie aiguë",
    })
    .select("id")
    .single();
  if (eErr) throw eErr;
  const episodeId = episode.id;

  // 8) Prescriptions hospitalières — divergences volontaires
  const presc = [
    // Adaptation rénale : dose Ramipril réduite (DFG 34)
    { medicament: "Ramipril", dosage: "2.5 mg", posologie: "1 matin", voie_administration: "PO", indication: "HTA / IC — dose réduite IRC" },
    // Majoration diurétique
    { medicament: "Furosemide", dosage: "80 mg", posologie: "1 matin + 1 midi (IV puis PO)", voie_administration: "IV/PO", indication: "Décompensation cardiaque" },
    { medicament: "Atorvastatine", dosage: "40 mg", posologie: "1 soir", voie_administration: "PO" },
    { medicament: "Bisoprolol", dosage: "2.5 mg", posologie: "1 matin", voie_administration: "PO", indication: "Dose réduite (IC décompensée)" },
    // Warfarine STOP (INR sur-dosé) → relais HBPM (curatif)
    { medicament: "Enoxaparine", dosage: "8000 UI", posologie: "1 SC x 2/jour (curatif)", voie_administration: "SC", indication: "Relais anticoagulation FA (Warfarine STOP INR 4.2)" },
    // IPP (prophylaxie ulcère sous corticoïdes/stress)
    { medicament: "Pantoprazole", dosage: "40 mg", posologie: "1 matin", voie_administration: "PO", indication: "Prophylaxie ulcère de stress" },
    // ⚠️ Antibiothérapie sepsis urinaire : Ceftriaxone — allergie croisée pénicilline !
    { medicament: "Ceftriaxone", dosage: "1 g", posologie: "1 IV /jour", voie_administration: "IV", indication: "Sepsis urinaire à E. coli" },
    // ⚠️ Antalgique : Tramadol — interaction sérotoninergique avec Sertraline + sujet âgé
    { medicament: "Tramadol", dosage: "50 mg", posologie: "1 cp x 3/jour si douleur", voie_administration: "PO", indication: "Douleurs lombaires" },
    // Insuline basale (Metformine arrêtée)
    { medicament: "Insuline glargine", dosage: "16 UI", posologie: "1 SC le soir", voie_administration: "SC", indication: "Diabète déséquilibré (Metformine STOP IRC)" },
    // Spironolactone maintenue
    { medicament: "Spironolactone", dosage: "25 mg", posologie: "1 matin", voie_administration: "PO" },
    // OMISSIONS volontaires (à détecter par la conciliation) :
    //  - Metformine (justifiée : DFG 34 → STOP)
    //  - Amlodipine (NON justifiée → divergence à signaler)
    //  - Aspirine (NON justifiée chez patient post-stent → divergence majeure)
    //  - Gliclazide (justifiée : remplacé par insuline)
    //  - Sertraline (oubli — divergence)
    //  - Ibuprofène (justifié : AINS contre-indiqué IRC/IC/anticoag)
  ].map((p) => ({ ...p, episode_id: episodeId, patient_id: patientId, actif: true }));
  await supabase.from("prescriptions_hospitalieres").insert(presc);

  return patientId;
}
