import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { computeRiskScore } from "./riskScore";

const Input = z.object({ n: z.number().int().min(5).max(500).default(50) });

const NOMS = ["Jean-Baptiste", "Marie-Louise", "Henri", "Joséphine", "Maxime", "Lucette", "Auguste", "Yvonne", "Camille", "Roger", "Yolande", "Frédéric", "Ginette"];
const PRENOMS_F = ["CARRIERE", "PELLETIER", "LEROY", "MOREAU", "DUPONT", "MARTIN", "BERNARD", "LAMBERT", "JEAN-LOUIS", "ANTOINE"];

interface BmoEntry {
  dci: string;
  dosage: string;
  dosage_unite: string;
  voie: string;
  matin?: number;
  midi?: number;
  soir?: number;
  coucher?: number;
}
interface Antecedent {
  type: "medical" | "chirurgical" | "familial" | "obstetrical" | "autre";
  description: string;
  yearsAgo?: number;
}
interface Allergie {
  substance: string;
  reaction?: string;
  severite?: "legere" | "moderee" | "severe" | "anaphylaxie";
}
interface BioEntry {
  parametre: string;
  valeur: number;
  unite: string;
}
interface Profil {
  tag: string;
  comorbidites: string[];
  antecedents: Antecedent[];
  allergies: Allergie[];
  biologie: BioEntry[];
  bmo: BmoEntry[];
  motif: string;
  service: string;
}

const today = () => new Date().toISOString().slice(0, 10);
const dateYearsAgo = (n: number) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  return d.toISOString().slice(0, 10);
};

const PROFILS: Profil[] = [
  {
    tag: "diabete_hta",
    motif: "Déséquilibre glycémique et poussée hypertensive",
    service: "Médecine interne",
    comorbidites: ["Diabète de type 2", "HTA essentielle", "Dyslipidémie"],
    antecedents: [
      { type: "medical", description: "Diabète de type 2 diagnostiqué", yearsAgo: 12 },
      { type: "medical", description: "HTA essentielle traitée", yearsAgo: 10 },
      { type: "chirurgical", description: "Cholécystectomie sous cœlioscopie", yearsAgo: 8 },
      { type: "familial", description: "Père : infarctus du myocarde à 62 ans" },
    ],
    allergies: [
      { substance: "Pénicilline", reaction: "Urticaire généralisée", severite: "moderee" },
    ],
    biologie: [
      { parametre: "Glycémie à jeun", valeur: 1.78, unite: "g/L" },
      { parametre: "HbA1c", valeur: 8.4, unite: "%" },
      { parametre: "Créatininémie", valeur: 11, unite: "mg/L" },
      { parametre: "DFG (CKD-EPI)", valeur: 68, unite: "mL/min/1.73m²" },
      { parametre: "LDL cholestérol", valeur: 1.42, unite: "g/L" },
      { parametre: "Kaliémie", valeur: 4.3, unite: "mmol/L" },
    ],
    bmo: [
      { dci: "Metformine", dosage: "1000", dosage_unite: "mg", voie: "PO", matin: 1, soir: 1 },
      { dci: "Ramipril", dosage: "5", dosage_unite: "mg", voie: "PO", matin: 1 },
      { dci: "Atorvastatine", dosage: "20", dosage_unite: "mg", voie: "PO", soir: 1 },
      { dci: "Aspirine", dosage: "75", dosage_unite: "mg", voie: "PO", matin: 1 },
    ],
  },
  {
    tag: "ic_fa",
    motif: "Décompensation cardiaque globale",
    service: "Cardiologie",
    comorbidites: ["Insuffisance cardiaque", "Fibrillation auriculaire", "Insuffisance rénale chronique stade 3"],
    antecedents: [
      { type: "medical", description: "Cardiopathie ischémique post-IDM antérieur", yearsAgo: 7 },
      { type: "medical", description: "Fibrillation auriculaire permanente", yearsAgo: 5 },
      { type: "chirurgical", description: "Pose de stent actif IVA", yearsAgo: 7 },
      { type: "medical", description: "Insuffisance rénale chronique stade 3", yearsAgo: 3 },
    ],
    allergies: [
      { substance: "Iode (produit de contraste)", reaction: "Bronchospasme", severite: "severe" },
    ],
    biologie: [
      { parametre: "Créatininémie", valeur: 18, unite: "mg/L" },
      { parametre: "DFG (CKD-EPI)", valeur: 42, unite: "mL/min/1.73m²" },
      { parametre: "NT-proBNP", valeur: 4850, unite: "pg/mL" },
      { parametre: "Kaliémie", valeur: 5.4, unite: "mmol/L" },
      { parametre: "Natrémie", valeur: 134, unite: "mmol/L" },
      { parametre: "INR", valeur: 1.1, unite: "" },
    ],
    bmo: [
      { dci: "Bisoprolol", dosage: "5", dosage_unite: "mg", voie: "PO", matin: 1 },
      { dci: "Furosemide", dosage: "40", dosage_unite: "mg", voie: "PO", matin: 1 },
      { dci: "Apixaban", dosage: "5", dosage_unite: "mg", voie: "PO", matin: 1, soir: 1 },
      { dci: "Ramipril", dosage: "2.5", dosage_unite: "mg", voie: "PO", matin: 1 },
      { dci: "Digoxine", dosage: "0.125", dosage_unite: "mg", voie: "PO", matin: 1 },
    ],
  },
  {
    tag: "drepanocytose",
    motif: "Crise vaso-occlusive hyperalgique",
    service: "Médecine interne",
    comorbidites: ["Drépanocytose homozygote SS", "Crise vaso-occlusive récurrente", "Lithiase biliaire pigmentaire"],
    antecedents: [
      { type: "medical", description: "Drépanocytose homozygote SS diagnostiquée à la naissance" },
      { type: "medical", description: "Crises vaso-occlusives répétées (> 3/an)" },
      { type: "chirurgical", description: "Splénectomie pour séquestration splénique", yearsAgo: 15 },
      { type: "medical", description: "Anémie hémolytique chronique" },
    ],
    allergies: [],
    biologie: [
      { parametre: "Hémoglobine", valeur: 7.8, unite: "g/dL" },
      { parametre: "Réticulocytes", valeur: 320, unite: "G/L" },
      { parametre: "LDH", valeur: 680, unite: "U/L" },
      { parametre: "Bilirubine totale", valeur: 42, unite: "µmol/L" },
      { parametre: "CRP", valeur: 28, unite: "mg/L" },
    ],
    bmo: [
      { dci: "Hydroxyurée", dosage: "500", dosage_unite: "mg", voie: "PO", matin: 1, soir: 1 },
      { dci: "Acide folique", dosage: "5", dosage_unite: "mg", voie: "PO", matin: 1 },
      { dci: "Paracetamol", dosage: "1000", dosage_unite: "mg", voie: "PO", matin: 1, midi: 1, soir: 1 },
      { dci: "Tramadol", dosage: "50", dosage_unite: "mg", voie: "PO", matin: 1, soir: 1 },
    ],
  },
  {
    tag: "psy_age",
    motif: "Chute à domicile et confusion",
    service: "Gériatrie",
    comorbidites: ["Trouble dépressif majeur", "Insomnie chronique", "Trouble cognitif léger", "RGO"],
    antecedents: [
      { type: "medical", description: "Trouble dépressif récurrent", yearsAgo: 8 },
      { type: "medical", description: "Trouble cognitif léger (MMSE 24/30)", yearsAgo: 2 },
      { type: "chirurgical", description: "PTH droite pour coxarthrose", yearsAgo: 4 },
      { type: "medical", description: "RGO sous IPP au long cours" },
    ],
    allergies: [
      { substance: "AINS (ibuprofène)", reaction: "Œdème de Quincke", severite: "severe" },
    ],
    biologie: [
      { parametre: "Natrémie", valeur: 128, unite: "mmol/L" },
      { parametre: "Kaliémie", valeur: 3.4, unite: "mmol/L" },
      { parametre: "Créatininémie", valeur: 9, unite: "mg/L" },
      { parametre: "DFG (CKD-EPI)", valeur: 72, unite: "mL/min/1.73m²" },
      { parametre: "Albuminémie", valeur: 28, unite: "g/L" },
    ],
    bmo: [
      { dci: "Sertraline", dosage: "50", dosage_unite: "mg", voie: "PO", matin: 1 },
      { dci: "Lorazepam", dosage: "1", dosage_unite: "mg", voie: "PO", coucher: 1 },
      { dci: "Zolpidem", dosage: "10", dosage_unite: "mg", voie: "PO", coucher: 1 },
      { dci: "Omeprazole", dosage: "20", dosage_unite: "mg", voie: "PO", matin: 1 },
      { dci: "Paracetamol", dosage: "500", dosage_unite: "mg", voie: "PO", matin: 1, soir: 1 },
    ],
  },
  {
    tag: "bpco_tabac",
    motif: "Exacerbation aiguë de BPCO",
    service: "Pneumologie",
    comorbidites: ["BPCO stade III GOLD", "Tabagisme actif", "HTA essentielle"],
    antecedents: [
      { type: "medical", description: "BPCO post-tabagique (60 PA)", yearsAgo: 6 },
      { type: "medical", description: "Exacerbations infectieuses répétées (3/an)" },
      { type: "medical", description: "HTA essentielle" },
      { type: "familial", description: "Mère : BPCO sévère" },
    ],
    allergies: [],
    biologie: [
      { parametre: "CRP", valeur: 82, unite: "mg/L" },
      { parametre: "Leucocytes", valeur: 14.2, unite: "G/L" },
      { parametre: "PaO2", valeur: 56, unite: "mmHg" },
      { parametre: "PaCO2", valeur: 52, unite: "mmHg" },
      { parametre: "Kaliémie", valeur: 4.0, unite: "mmol/L" },
    ],
    bmo: [
      { dci: "Tiotropium", dosage: "18", dosage_unite: "µg", voie: "inhalée", matin: 1 },
      { dci: "Salbutamol", dosage: "100", dosage_unite: "µg", voie: "inhalée", matin: 2, midi: 2, soir: 2 },
      { dci: "Amlodipine", dosage: "5", dosage_unite: "mg", voie: "PO", matin: 1 },
      { dci: "Atorvastatine", dosage: "20", dosage_unite: "mg", voie: "PO", soir: 1 },
    ],
  },
];

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function rand(a: number, b: number): number { return Math.floor(Math.random() * (b - a + 1)) + a; }

export const seedSyntheticCohort = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const cohortTag = `cohort_${Date.now()}`;
    const created = {
      patients: 0, episodes: 0, traitements: 0, prescriptions: 0,
      truth_dnis: 0, risk_scores: 0,
      antecedents: 0, allergies: 0, biologie: 0,
    };

    for (let i = 0; i < data.n; i++) {
      const profil = pick(PROFILS);
      const age = rand(55, 92);
      const dob = new Date();
      dob.setFullYear(dob.getFullYear() - age);
      const sexe = Math.random() > 0.5 ? "M" : "F";

      // Patient
      const { data: pat, error: ePat } = await supabase
        .from("patients")
        .insert({
          nom: pick(PRENOMS_F),
          prenom: pick(NOMS),
          date_naissance: dob.toISOString().slice(0, 10),
          sexe,
          poids_kg: rand(55, 90),
          taille_cm: rand(150, 185),
          is_synthetic: true,
          cohort_tag: cohortTag,
          created_by: userId,
        } as never)
        .select("id")
        .single();
      if (ePat || !pat) continue;
      created.patients++;

      // Comorbidités
      for (const c of profil.comorbidites) {
        await supabase.from("comorbidites").insert({
          patient_id: pat.id, libelle: c, statut: "actif",
        } as never);
      }

      // Antécédents (cohérents avec les comorbidités)
      for (const a of profil.antecedents) {
        await supabase.from("antecedents").insert({
          patient_id: pat.id,
          type: a.type,
          description: a.description,
          date_evenement: a.yearsAgo != null ? dateYearsAgo(a.yearsAgo) : null,
          actif: true,
        } as never);
        created.antecedents++;
      }

      // Allergies
      for (const al of profil.allergies) {
        await supabase.from("allergies").insert({
          patient_id: pat.id,
          substance: al.substance,
          reaction: al.reaction ?? null,
          severite: al.severite ?? null,
        } as never);
        created.allergies++;
      }

      // Biologie (cohérente avec le profil)
      for (const b of profil.biologie) {
        await supabase.from("biologie_resultats").insert({
          patient_id: pat.id,
          parametre: b.parametre,
          valeur: b.valeur,
          unite: b.unite,
          date_prelevement: today(),
          source: "manuel",
        } as never);
        created.biologie++;
      }

      // Traitements habituels (BMO)
      for (const t of profil.bmo) {
        const { error: eTh } = await supabase.from("traitements_habituels").insert({
          patient_id: pat.id,
          dci: t.dci, dosage: t.dosage, dosage_unite: t.dosage_unite,
          voie_administration: t.voie,
          posologie_matin: t.matin ?? null, posologie_midi: t.midi ?? null,
          posologie_soir: t.soir ?? null, posologie_coucher: t.coucher ?? null,
          source: "ordonnance", actif: true,
        } as never);
        if (!eTh) created.traitements++;
      }

      // Épisode
      const viaUrg = Math.random() > 0.4;
      const { data: ep, error: eEp } = await supabase
        .from("episodes")
        .insert({
          patient_id: pat.id,
          motif: profil.motif,
          service: profil.service,
          via_urgences: viaUrg,
          statut: "ouvert",
        } as never)
        .select("id")
        .single();
      if (eEp || !ep) continue;
      created.episodes++;

      // Prescriptions hospitalières : copie BMO en introduisant des DNI étiquetées
      const truthRows: Array<{ medicament: string; type: string }> = [];
      for (let idx = 0; idx < profil.bmo.length; idx++) {
        const t = profil.bmo[idx];
        // 30% omission, 20% modif dose, sinon copie fidèle
        const r = Math.random();
        if (r < 0.3 && idx > 0) {
          truthRows.push({ medicament: t.dci, type: "omission" });
          continue;
        }
        if (r < 0.5) {
          const newDose = String(Math.max(1, Number(t.dosage) / 2));
          await supabase.from("prescriptions_hospitalieres").insert({
            episode_id: ep.id, patient_id: pat.id,
            medicament: t.dci, dosage: `${newDose}`, voie_administration: t.voie, actif: true,
          } as never);
          created.prescriptions++;
          truthRows.push({ medicament: t.dci, type: "modification_dose" });
        } else {
          await supabase.from("prescriptions_hospitalieres").insert({
            episode_id: ep.id, patient_id: pat.id,
            medicament: t.dci, dosage: `${t.dosage} ${t.dosage_unite}`, voie_administration: t.voie, actif: true,
          } as never);
          created.prescriptions++;
        }
      }

      // Ajout de prescriptions hospitalières propres à l'épisode (aiguës)
      const acuteByProfile: Record<string, BmoEntry[]> = {
        diabete_hta: [
          { dci: "Insuline rapide (Novorapid)", dosage: "4-6-4", dosage_unite: "UI", voie: "SC" },
          { dci: "Amlodipine", dosage: "5", dosage_unite: "mg", voie: "PO", matin: 1 },
        ],
        ic_fa: [
          { dci: "Furosemide IV", dosage: "40", dosage_unite: "mg", voie: "IV", matin: 1, midi: 1, soir: 1 },
          { dci: "Enoxaparine prophylactique", dosage: "4000", dosage_unite: "UI", voie: "SC", soir: 1 },
        ],
        drepanocytose: [
          { dci: "Morphine PCA", dosage: "1", dosage_unite: "mg/bolus", voie: "IV" },
          { dci: "Sérum physiologique", dosage: "2000", dosage_unite: "mL/24h", voie: "IV" },
          { dci: "Ceftriaxone", dosage: "1", dosage_unite: "g", voie: "IV", matin: 1 },
        ],
        psy_age: [
          { dci: "Paracetamol IV", dosage: "1", dosage_unite: "g", voie: "IV", matin: 1, midi: 1, soir: 1 },
          { dci: "Mélatonine", dosage: "2", dosage_unite: "mg", voie: "PO", coucher: 1 },
        ],
        bpco_tabac: [
          { dci: "Prednisolone", dosage: "40", dosage_unite: "mg", voie: "PO", matin: 1 },
          { dci: "Amoxicilline-acide clavulanique", dosage: "1", dosage_unite: "g", voie: "PO", matin: 1, midi: 1, soir: 1 },
          { dci: "Oxygénothérapie", dosage: "2", dosage_unite: "L/min", voie: "inhalée" },
        ],
      };
      for (const t of acuteByProfile[profil.tag] ?? []) {
        await supabase.from("prescriptions_hospitalieres").insert({
          episode_id: ep.id, patient_id: pat.id,
          medicament: t.dci, dosage: `${t.dosage} ${t.dosage_unite}`,
          voie_administration: t.voie, actif: true,
        } as never);
        created.prescriptions++;
      }

      // Ground truth
      if (truthRows.length) {
        await supabase.from("ground_truth_dnis").insert(
          truthRows.map((r) => ({
            episode_id: ep.id, medicament: r.medicament, type_divergence: r.type, expected_intention: "non_intentionnel",
          })) as never,
        );
        created.truth_dnis += truthRows.length;
      }

      // Risk score
      const dcis = profil.bmo.map((t) => t.dci);
      const rk = computeRiskScore({
        age, via_urgences: viaUrg,
        nb_comorbidites: profil.comorbidites.length,
        has_insuffisance_renale: profil.comorbidites.some((c) => /rénale|renale/i.test(c)),
        has_insuffisance_hepatique: false,
        traitements_dci: dcis,
      });
      await supabase.from("risk_scores").insert({
        episode_id: ep.id, score: rk.score, niveau: rk.niveau,
        variables: { breakdown: rk.breakdown, nb_medicaments: rk.nb_medicaments, classes_a_risque: rk.classes_a_risque, age },
      } as never);
      created.risk_scores++;
    }

    return { cohort_tag: cohortTag, ...created };
  });
