import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Iso = z.string().regex(/^\d{4}-\d{2}-\d{2}/).nullable().optional();

const PatientRow = z.object({
  external_ref: z.string().min(1).max(64),
  gender: z.enum(["M", "F"]).nullable().optional(),
  age: z.number().int().min(0).max(130).nullable().optional(),
  age_group: z.string().max(20).nullable().optional(),
  hta: z.number().int().nullable().optional(),
  did: z.number().int().nullable().optional(),
  dnid: z.number().int().nullable().optional(),
  diabete: z.number().int().nullable().optional(),
  irc: z.number().int().nullable().optional(),
  obesite: z.number().int().nullable().optional(),
  score_comorb: z.number().int().nullable().optional(),
});

const SejourRow = z.object({
  external_ref: z.string().min(1).max(64),
  patient_ref: z.string().min(1).max(64),
  motif: z.string().max(255).nullable().optional(),
  service: z.string().max(255).nullable().optional(),
  prescripteur: z.string().max(255).nullable().optional(),
  date_admission: Iso,
  date_sortie: Iso,
  nb_meds_chroniques: z.number().int().nullable().optional(),
  nb_meds_hosp: z.number().int().nullable().optional(),
  pas_mmhg: z.number().int().nullable().optional(),
  pad_mmhg: z.number().int().nullable().optional(),
});

const PrescriptionRow = z.object({
  sejour_ref: z.string().min(1).max(64),
  patient_ref: z.string().min(1).max(64),
  medicament: z.string().min(1).max(500),
  dose: z.string().max(255).nullable().optional(),
  voie: z.string().max(100).nullable().optional(),
  frequence: z.string().max(255).nullable().optional(),
  prescripteur: z.string().max(255).nullable().optional(),
});

const MedChronRow = z.object({
  sejour_ref: z.string().min(1).max(64),
  patient_ref: z.string().min(1).max(64),
  medicament: z.string().min(1).max(500),
  source: z.string().max(100).nullable().optional(),
});

const DivergenceRow = z.object({
  sejour_ref: z.string().min(1).max(64),
  patient_ref: z.string().min(1).max(64),
  medicament: z.string().max(500),
  type: z.string().max(50).nullable().optional(),
  gravite: z.number().int().nullable().optional(),
  justification: z.string().max(1000).nullable().optional(),
  action: z.string().max(1000).nullable().optional(),
});

const Input = z.object({
  cohortId: z.string().uuid(),
  patients: z.array(PatientRow).max(5000).default([]),
  sejours: z.array(SejourRow).max(5000).default([]),
  prescriptions: z.array(PrescriptionRow).max(50000).default([]),
  medsChron: z.array(MedChronRow).max(50000).default([]),
  divergences: z.array(DivergenceRow).max(20000).default([]),
});

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export const importCohortDataset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: cohort, error: cErr } = await supabase
      .from("cohorts")
      .select("id, tag, created_by")
      .eq("id", data.cohortId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!cohort) throw new Error("Cohorte introuvable");
    if ((cohort as { created_by: string }).created_by !== userId) throw new Error("Cohorte non autorisée");
    const cohortTag = (cohort as { tag: string }).tag;

    const stats = { patients: 0, episodes: 0, prescriptions: 0, traitements: 0, divergences: 0 };

    // 1) Upsert patients
    const patientIdByRef = new Map<string, string>();
    if (data.patients.length) {
      for (const batch of chunk(data.patients, 500)) {
        const rows = batch.map((p) => ({
          external_ref: p.external_ref,
          nom: `Patient ${p.external_ref}`,
          prenom: p.external_ref,
          sexe: p.gender ?? null,
          notes: [
            p.age != null ? `age=${p.age}` : null,
            p.age_group ? `groupe=${p.age_group}` : null,
            p.hta ? "HTA" : null,
            p.diabete ? "Diabète" : null,
            p.irc ? "IRC" : null,
            p.obesite ? "Obésité" : null,
            p.score_comorb != null ? `score_comorb=${p.score_comorb}` : null,
          ].filter(Boolean).join(" | ") || null,
          cohort_id: data.cohortId,
          cohort_tag: cohortTag,
          is_synthetic: true,
          created_by: userId,
        }));
        const { data: ins, error } = await supabase
          .from("patients")
          .upsert(rows as never, { onConflict: "cohort_id,external_ref" })
          .select("id, external_ref");
        if (error) throw new Error(`patients: ${error.message}`);
        (ins ?? []).forEach((r: { id: string; external_ref: string | null }) => {
          if (r.external_ref) patientIdByRef.set(r.external_ref, r.id);
        });
        stats.patients += ins?.length ?? 0;
      }
    } else {
      // fetch existing
      const { data: existing } = await supabase
        .from("patients")
        .select("id, external_ref")
        .eq("cohort_id", data.cohortId);
      (existing ?? []).forEach((r: { id: string; external_ref: string | null }) => {
        if (r.external_ref) patientIdByRef.set(r.external_ref, r.id);
      });
    }

    // collect referenced patient_refs from other tables; ensure they exist
    const allPatientRefs = new Set<string>([
      ...data.sejours.map((s) => s.patient_ref),
      ...data.prescriptions.map((p) => p.patient_ref),
      ...data.medsChron.map((p) => p.patient_ref),
      ...data.divergences.map((p) => p.patient_ref),
    ]);
    const missing = [...allPatientRefs].filter((r) => !patientIdByRef.has(r));
    if (missing.length) {
      // create minimal patient stubs so FKs resolve
      const stubs = missing.map((ref) => ({
        external_ref: ref,
        nom: `Patient ${ref}`,
        prenom: ref,
        cohort_id: data.cohortId,
        cohort_tag: cohortTag,
        is_synthetic: true,
        created_by: userId,
      }));
      for (const batch of chunk(stubs, 500)) {
        const { data: ins, error } = await supabase
          .from("patients")
          .upsert(batch as never, { onConflict: "cohort_id,external_ref" })
          .select("id, external_ref");
        if (error) throw new Error(`patients(stubs): ${error.message}`);
        (ins ?? []).forEach((r: { id: string; external_ref: string | null }) => {
          if (r.external_ref) patientIdByRef.set(r.external_ref, r.id);
        });
      }
    }

    // 2) Upsert episodes
    const episodeIdByRef = new Map<string, string>();
    const episodePatientByRef = new Map<string, string>();
    if (data.sejours.length) {
      for (const batch of chunk(data.sejours, 500)) {
        const rows = batch
          .map((s) => {
            const pid = patientIdByRef.get(s.patient_ref);
            if (!pid) return null;
            const entree = s.date_admission ?? new Date().toISOString().slice(0, 10);
            return {
              external_ref: s.external_ref,
              patient_id: pid,
              cohort_id: data.cohortId,
              motif: s.motif ?? null,
              service: s.service ?? null,
              date_entree: entree,
              date_sortie: s.date_sortie ?? null,
              statut: s.date_sortie ? "termine" : "en_cours",
              ta_systolique: s.pas_mmhg ?? null,
              ta_diastolique: s.pad_mmhg ?? null,
              bmo_notes: s.prescripteur ? `Prescripteur: ${s.prescripteur}` : null,
            };
          })
          .filter(Boolean);
        if (!rows.length) continue;
        const { data: ins, error } = await supabase
          .from("episodes")
          .upsert(rows as never, { onConflict: "cohort_id,external_ref" })
          .select("id, external_ref, patient_id");
        if (error) throw new Error(`episodes: ${error.message}`);
        (ins ?? []).forEach((r: { id: string; external_ref: string | null; patient_id: string }) => {
          if (r.external_ref) {
            episodeIdByRef.set(r.external_ref, r.id);
            episodePatientByRef.set(r.external_ref, r.patient_id);
          }
        });
        stats.episodes += ins?.length ?? 0;
      }
    } else {
      const { data: existing } = await supabase
        .from("episodes")
        .select("id, external_ref, patient_id")
        .eq("cohort_id", data.cohortId);
      (existing ?? []).forEach((r: { id: string; external_ref: string | null; patient_id: string }) => {
        if (r.external_ref) {
          episodeIdByRef.set(r.external_ref, r.id);
          episodePatientByRef.set(r.external_ref, r.patient_id);
        }
      });
    }

    // 3) Prescriptions hospitalières
    if (data.prescriptions.length) {
      const now = new Date().toISOString();
      for (const batch of chunk(data.prescriptions, 500)) {
        const rows = batch
          .map((p) => {
            const eid = episodeIdByRef.get(p.sejour_ref);
            const pid = patientIdByRef.get(p.patient_ref);
            if (!eid || !pid) return null;
            return {
              episode_id: eid,
              patient_id: pid,
              medicament: p.medicament,
              dosage: p.dose ?? null,
              posologie: p.frequence ?? null,
              voie_administration: p.voie ?? null,
              prescripteur: p.prescripteur ?? null,
              date_debut: now,
              actif: true,
              source: "import_cohorte",
            };
          })
          .filter(Boolean);
        if (!rows.length) continue;
        const { error, count } = await supabase
          .from("prescriptions_hospitalieres")
          .insert(rows as never, { count: "exact" });
        if (error) throw new Error(`prescriptions: ${error.message}`);
        stats.prescriptions += count ?? rows.length;
      }
    }

    // 4) Traitements habituels (BMO)
    if (data.medsChron.length) {
      for (const batch of chunk(data.medsChron, 500)) {
        const rows = batch
          .map((m) => {
            const pid = patientIdByRef.get(m.patient_ref);
            if (!pid) return null;
            return {
              patient_id: pid,
              dci: m.medicament,
              source: m.source ?? "BMO_entree",
              actif: true,
            };
          })
          .filter(Boolean);
        if (!rows.length) continue;
        const { error, count } = await supabase
          .from("traitements_habituels")
          .insert(rows as never, { count: "exact" });
        if (error) throw new Error(`traitements_habituels: ${error.message}`);
        stats.traitements += count ?? rows.length;
      }
    }

    // 5) Divergences → pharmacist_gold_standards (one row per sejour with extracted_json)
    if (data.divergences.length) {
      const grouped = new Map<string, typeof data.divergences>();
      for (const d of data.divergences) {
        const arr = grouped.get(d.sejour_ref) ?? [];
        arr.push(d);
        grouped.set(d.sejour_ref, arr);
      }
      const rows: Array<Record<string, unknown>> = [];
      for (const [sejourRef, divs] of grouped) {
        const eid = episodeIdByRef.get(sejourRef);
        const pid = episodePatientByRef.get(sejourRef) ?? patientIdByRef.get(divs[0].patient_ref);
        if (!pid) continue;
        rows.push({
          patient_id: pid,
          episode_id: eid ?? null,
          cohort_id: data.cohortId,
          storage_path: `virtual/import/${sejourRef}`,
          file_name: `divergences_${sejourRef}.json`,
          mime_type: "application/json",
          extracted_json: {
            sejour_ref: sejourRef,
            divergences: divs.map((d) => ({
              medicament: d.medicament,
              type: d.type ?? "autre",
              severite: d.gravite ?? null,
              commentaire: [d.justification, d.action].filter(Boolean).join(" — ") || null,
            })),
          },
          nb_divergences: divs.length,
          uploaded_by: userId,
        });
      }
      for (const batch of chunk(rows, 200)) {
        const { error, count } = await supabase
          .from("pharmacist_gold_standards")
          .insert(batch as never, { count: "exact" });
        if (error) throw new Error(`divergences: ${error.message}`);
        stats.divergences += count ?? batch.length;
      }
    }

    return { ok: true, stats };
  });
