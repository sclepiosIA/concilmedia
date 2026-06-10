// Adaptateur FHIR R4 → lignes ConcilMed.
// v2 : Patient, MedicationStatement/MedicationRequest, AllergyIntolerance, Condition, Observation.

interface FhirResource { resourceType?: string; [k: string]: unknown }
interface FhirBundle { resourceType?: string; entry?: { resource?: FhirResource }[] }

export interface FhirAdaptResult {
  patients: { ipp_local: string; date_naissance: string; sexe: string; ins_pseudo_raw?: string; ipp_authority_oid?: string }[];
  traitements: { ipp_local: string; dci: string; dosage: string; dosage_unite: string; voie_administration: string; posologie_texte: string; indication: string }[];
  allergies: { ipp_local: string; substance: string; criticite: string; manifestation: string }[];
  antecedents: { ipp_local: string; libelle: string; code: string }[];
  biologie: { ipp_local: string; loinc: string; libelle: string; valeur: string; unite: string; date: string }[];
}

const INS_NIR_OID = "urn:oid:1.2.250.1.213.1.4.10";
const INS_NIA_OID = "urn:oid:1.2.250.1.213.1.4.9";

function getPatientId(ref: string | undefined): string | null {
  if (!ref) return null;
  const m = ref.match(/Patient\/(.+)/);
  return m ? m[1] : ref;
}

function pickIdentifier(
  identifiers: { system?: string; value?: string }[] | undefined,
  systems: string[],
): { value: string; system: string } | null {
  if (!identifiers) return null;
  for (const i of identifiers) {
    if (i.system && i.value && systems.includes(i.system)) return { value: i.value, system: i.system };
  }
  return null;
}

export function fhirBundleToCsvRows(bundle: FhirBundle): FhirAdaptResult {
  const out: FhirAdaptResult = { patients: [], traitements: [], allergies: [], antecedents: [], biologie: [] };
  const entries = bundle.entry ?? [];

  for (const e of entries) {
    const r = e.resource;
    if (!r) continue;

    if (r.resourceType === "Patient") {
      const id = String((r as { id?: string }).id ?? "");
      const birth = String((r as { birthDate?: string }).birthDate ?? "");
      const genderRaw = String((r as { gender?: string }).gender ?? "");
      const sexe = genderRaw === "male" ? "M" : genderRaw === "female" ? "F" : "";
      const ins = pickIdentifier((r as { identifier?: { system?: string; value?: string }[] }).identifier, [INS_NIR_OID, INS_NIA_OID]);
      if (id && birth && sexe) {
        out.patients.push({
          ipp_local: id,
          date_naissance: birth,
          sexe,
          ins_pseudo_raw: ins?.value,
          ipp_authority_oid: ins?.system,
        });
      }
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

    if (r.resourceType === "AllergyIntolerance") {
      const ipp = getPatientId((r as { patient?: { reference?: string } }).patient?.reference);
      const code = (r as { code?: { text?: string; coding?: { display?: string }[] } }).code;
      const substance = code?.text || code?.coding?.[0]?.display || "";
      const crit = String((r as { criticality?: string }).criticality ?? "");
      const reaction = (r as { reaction?: { manifestation?: { text?: string; coding?: { display?: string }[] }[] }[] }).reaction;
      const manif = reaction?.[0]?.manifestation?.[0]?.text || reaction?.[0]?.manifestation?.[0]?.coding?.[0]?.display || "";
      if (ipp && substance) out.allergies.push({ ipp_local: ipp, substance, criticite: crit, manifestation: manif });
    }

    if (r.resourceType === "Condition") {
      const ipp = getPatientId((r as { subject?: { reference?: string } }).subject?.reference);
      const code = (r as { code?: { text?: string; coding?: { code?: string; display?: string }[] } }).code;
      const libelle = code?.text || code?.coding?.[0]?.display || "";
      const codeVal = code?.coding?.[0]?.code || "";
      if (ipp && libelle) out.antecedents.push({ ipp_local: ipp, libelle, code: codeVal });
    }

    if (r.resourceType === "Observation") {
      const ipp = getPatientId((r as { subject?: { reference?: string } }).subject?.reference);
      const code = (r as { code?: { text?: string; coding?: { code?: string; display?: string; system?: string }[] } }).code;
      const loincEntry = code?.coding?.find((c) => c.system === "http://loinc.org");
      const loinc = loincEntry?.code || "";
      const libelle = code?.text || loincEntry?.display || "";
      const v = (r as { valueQuantity?: { value?: number; unit?: string }; valueString?: string }).valueQuantity;
      const valeur = v?.value != null ? String(v.value) : ((r as { valueString?: string }).valueString ?? "");
      const unite = v?.unit ?? "";
      const date = String((r as { effectiveDateTime?: string; issued?: string }).effectiveDateTime ?? (r as { issued?: string }).issued ?? "");
      if (ipp && libelle && valeur) out.biologie.push({ ipp_local: ipp, loinc, libelle, valeur, unite, date });
    }
  }
  return out;
}
