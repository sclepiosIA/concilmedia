import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { computeRiskScore } from "./riskScore";

const Input = z.object({ n: z.number().int().min(5).max(500).default(50) });

const NOMS = ["Jean-Baptiste", "Marie-Louise", "Henri", "Joséphine", "Maxime", "Lucette", "Auguste", "Yvonne", "Camille", "Roger", "Yolande", "Frédéric", "Ginette"];
const PRENOMS_F = ["CARRIERE", "PELLETIER", "LEROY", "MOREAU", "DUPONT", "MARTIN", "BERNARD", "LAMBERT", "JEAN-LOUIS", "ANTOINE"];

const PROFILS = [
  {
    tag: "diabete_hta",
    comorbidites: ["Diabète de type 2", "HTA essentielle"],
    bmo: [
      { dci: "Metformine", dosage: "1000", dosage_unite: "mg", voie: "PO", matin: 1, soir: 1 },
      { dci: "Ramipril", dosage: "5", dosage_unite: "mg", voie: "PO", matin: 1 },
      { dci: "Atorvastatine", dosage: "20", dosage_unite: "mg", voie: "PO", soir: 1 },
      { dci: "Aspirine", dosage: "75", dosage_unite: "mg", voie: "PO", matin: 1 },
    ],
  },
  {
    tag: "ic_fa",
    comorbidites: ["Insuffisance cardiaque", "Fibrillation auriculaire", "Insuffisance rénale chronique"],
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
    comorbidites: ["Drépanocytose homozygote", "Crise vaso-occlusive récurrente"],
    bmo: [
      { dci: "Hydroxyurée", dosage: "500", dosage_unite: "mg", voie: "PO", matin: 1, soir: 1 },
      { dci: "Acide folique", dosage: "5", dosage_unite: "mg", voie: "PO", matin: 1 },
      { dci: "Paracetamol", dosage: "1000", dosage_unite: "mg", voie: "PO", matin: 1, midi: 1, soir: 1 },
      { dci: "Tramadol", dosage: "50", dosage_unite: "mg", voie: "PO", matin: 1, soir: 1 },
    ],
  },
  {
    tag: "psy_age",
    comorbidites: ["Trouble dépressif majeur", "Insomnie chronique", "Trouble cognitif léger"],
    bmo: [
      { dci: "Sertraline", dosage: "50", dosage_unite: "mg", voie: "PO", matin: 1 },
      { dci: "Lorazepam", dosage: "1", dosage_unite: "mg", voie: "PO", coucher: 1 },
      { dci: "Zolpidem", dosage: "10", dosage_unite: "mg", voie: "PO", coucher: 1 },
      { dci: "Omeprazole", dosage: "20", dosage_unite: "mg", voie: "PO", matin: 1 },
      { dci: "Paracetamol", dosage: "500", dosage_unite: "mg", voie: "PO", matin: 1, soir: 1 },
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
    const created: { patients: number; episodes: number; traitements: number; prescriptions: number; truth_dnis: number; risk_scores: number } = {
      patients: 0, episodes: 0, traitements: 0, prescriptions: 0, truth_dnis: 0, risk_scores: 0,
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

      // Traitements habituels (BMO)
      for (const t of profil.bmo) {
        await supabase.from("traitements_habituels").insert({
          patient_id: pat.id,
          dci: t.dci, dosage: t.dosage, dosage_unite: t.dosage_unite,
          voie_administration: t.voie,
          posologie_matin: t.matin ?? null, posologie_midi: t.midi ?? null,
          posologie_soir: t.soir ?? null, posologie_coucher: t.coucher ?? null,
          source: "synthetique", actif: true,
        } as never);
        created.traitements++;
      }

      // Épisode
      const viaUrg = Math.random() > 0.4;
      const { data: ep, error: eEp } = await supabase
        .from("episodes")
        .insert({
          patient_id: pat.id,
          motif: "Décompensation aiguë",
          service: pick(["Médecine interne", "Cardiologie", "Gériatrie", "Urgences"]),
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
          // modif dose
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
