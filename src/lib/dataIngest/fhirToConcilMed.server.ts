// Adaptateur FHIR R4 → lignes CSV ConcilMed (Patient + MedicationStatement/Request).
// Pas exposé en serverFn v1 — sert de fondation à la piste #6.

interface FhirResource { resourceType?: string; [k: string]: unknown }
interface FhirBundle { resourceType?: string; entry?: { resource?: FhirResource }[] }

export interface FhirAdaptResult {
  patients: { ipp_local: string; date_naissance: string; sexe: string }[];
  traitements: { ipp_local: string; dci: string; dosage: string; dosage_unite: string; voie_administration: string; posologie_texte: string; indication: string }[];
}

function getPatientId(ref: string | undefined): string | null {
  if (!ref) return null;
  const m = ref.match(/Patient\/(.+)/);
  return m ? m[1] : ref;
}

export function fhirBundleToCsvRows(bundle: FhirBundle): FhirAdaptResult {
  const out: FhirAdaptResult = { patients: [], traitements: [] };
  const entries = bundle.entry ?? [];
  for (const e of entries) {
    const r = e.resource;
    if (!r) continue;
    if (r.resourceType === "Patient") {
      const id = String((r as { id?: string }).id ?? "");
      const birth = String((r as { birthDate?: string }).birthDate ?? "");
      const genderRaw = String((r as { gender?: string }).gender ?? "");
      const sexe = genderRaw === "male" ? "M" : genderRaw === "female" ? "F" : "";
      if (id && birth && sexe) out.patients.push({ ipp_local: id, date_naissance: birth, sexe });
    }
    if (r.resourceType === "MedicationStatement" || r.resourceType === "MedicationRequest") {
      const subject = (r as { subject?: { reference?: string } }).subject;
      const ipp = getPatientId(subject?.reference);
      const med = (r as { medicationCodeableConcept?: { text?: string; coding?: { display?: string }[] } }).medicationCodeableConcept;
      const dci = med?.text || med?.coding?.[0]?.display || "";
      const dosage = (r as { dosage?: { text?: string }[]; dosageInstruction?: { text?: string }[] });
      const txt = dosage.dosage?.[0]?.text || dosage.dosageInstruction?.[0]?.text || "";
      if (ipp && dci) {
        out.traitements.push({
          ipp_local: ipp, dci, dosage: "", dosage_unite: "",
          voie_administration: "", posologie_texte: txt, indication: "",
        });
      }
    }
  }
  return out;
}
