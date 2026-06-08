import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ExtractInput = z.object({
  fileBase64: z.string().min(10),
  mimeType: z.string().min(3).max(100),
  fileName: z.string().max(255).optional(),
});

const PatientSchema = z.object({
  nom: z.string().optional().nullable(),
  prenom: z.string().optional().nullable(),
  date_naissance: z.string().optional().nullable(),
  sexe: z.enum(["M", "F", "autre"]).optional().nullable(),
  poids_kg: z.number().optional().nullable(),
  taille_cm: z.number().optional().nullable(),
});

const AntecedentSchema = z.object({
  type: z.enum(["medical", "chirurgical", "familial", "obstetrical", "autre"]).default("medical"),
  description: z.string(),
  date_evenement: z.string().optional().nullable(),
});

const ComorbiditeSchema = z.object({
  libelle: z.string(),
  statut: z.enum(["actif", "resolu", "suspect"]).default("actif"),
});

const AllergieSchema = z.object({
  substance: z.string(),
  reaction: z.string().optional().nullable(),
  severite: z.enum(["legere", "moderee", "severe", "anaphylaxie"]).optional().nullable(),
});

const BiologieSchema = z.object({
  parametre: z.string(),
  valeur: z.number().optional().nullable(),
  unite: z.string().optional().nullable(),
  valeur_texte: z.string().optional().nullable(),
  date_prelevement: z.string().optional().nullable(),
});

const TraitementSchema = z.object({
  dci: z.string(),
  nom_commercial: z.string().optional().nullable(),
  dosage: z.string().optional().nullable(),
  dosage_unite: z.string().optional().nullable(),
  voie_administration: z.string().optional().nullable(),
  posologie_matin: z.string().optional().nullable(),
  posologie_midi: z.string().optional().nullable(),
  posologie_soir: z.string().optional().nullable(),
  posologie_coucher: z.string().optional().nullable(),
  indication: z.string().optional().nullable(),
});

const DossierSchema = z.object({
  patient: PatientSchema,
  antecedents: z.array(AntecedentSchema).default([]),
  comorbidites: z.array(ComorbiditeSchema).default([]),
  allergies: z.array(AllergieSchema).default([]),
  biologie: z.array(BiologieSchema).default([]),
  traitements: z.array(TraitementSchema).default([]),
});

export type ExtractedDossier = z.infer<typeof DossierSchema> & {
  existing_patient_id?: string | null;
  source_file?: string;
};

export const extractPatientDossier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ExtractInput.parse(d))
  .handler(async ({ data, context }): Promise<ExtractedDossier> => {
    const { supabase } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY manquante");

    const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
    const { generateText } = await import("ai");
    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-3-flash-preview");

    const systemPrompt = `Tu es un assistant médical expert en lecture de dossiers patients.
Analyse le document fourni (PDF / image d'un dossier patient, compte-rendu, ordonnance + bilan) et extrais TOUTES les informations cliniques.
Réponds STRICTEMENT en JSON valide (aucun texte avant/après, pas de markdown) selon ce schéma :
{
  "patient": {
    "nom": "...", "prenom": "...",
    "date_naissance": "YYYY-MM-DD",
    "sexe": "M" | "F" | "autre",
    "poids_kg": number, "taille_cm": number
  },
  "antecedents": [{ "type": "medical|chirurgical|familial|obstetrical|autre", "description": "...", "date_evenement": "YYYY-MM-DD" }],
  "comorbidites": [{ "libelle": "HTA", "statut": "actif|resolu|suspect" }],
  "allergies": [{ "substance": "Pénicilline", "reaction": "urticaire", "severite": "legere|moderee|severe|anaphylaxie" }],
  "biologie": [{ "parametre": "DFG", "valeur": 45, "unite": "mL/min/1,73m²", "date_prelevement": "YYYY-MM-DD" }],
  "traitements": [{ "dci": "Metformine", "nom_commercial": "Glucophage", "dosage": "500", "dosage_unite": "mg", "voie_administration": "PO", "posologie_matin": "1", "posologie_soir": "1", "indication": "diabète" }]
}
Règles :
- Privilégie la DCI au nom commercial.
- Pour la biologie, extrais en priorité : DFG, créatinine, kaliémie, natrémie, INR, TP, hémoglobine, plaquettes, leucocytes, ASAT, ALAT, glycémie, HbA1c, CRP.
- Omets les champs inconnus, n'invente rien.
- Ne renvoie QUE le JSON.`;

    const result = await generateText({
      model,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Analyse ce dossier patient et extrais toutes les données structurées." },
            { type: "file", data: `data:${data.mimeType};base64,${data.fileBase64}`, mediaType: data.mimeType },
          ],
        },
      ],
    });

    const raw = result.text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "");
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      throw new Error("Réponse IA non valide. Réessayez avec un document plus net.");
    }
    const dossier = DossierSchema.parse(parsedJson);

    // Détection de doublon
    let existingId: string | null = null;
    const { nom, prenom, date_naissance } = dossier.patient;
    if (nom && prenom) {
      const q = supabase.from("patients").select("id").ilike("nom", nom).ilike("prenom", prenom).limit(1);
      const { data: matches } = date_naissance ? await q.eq("date_naissance", date_naissance) : await q;
      if (matches && matches.length > 0) existingId = matches[0].id;
    }

    return { ...dossier, existing_patient_id: existingId, source_file: data.fileName };
  });

const CommitInput = z.object({
  items: z.array(DossierSchema.extend({
    existing_patient_id: z.string().uuid().nullable().optional(),
    source_file: z.string().optional(),
  })).min(1).max(20),
});

export const commitBulkImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CommitInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const summary = { created: 0, updated: 0, failed: [] as { name: string; error: string }[] };

    for (const item of data.items) {
      const displayName = `${item.patient.nom ?? "?"} ${item.patient.prenom ?? ""}`.trim();
      try {
        let patientId = item.existing_patient_id ?? null;
        if (!patientId) {
          const { data: ins, error } = await supabase.from("patients").insert({
            nom: item.patient.nom ?? "Inconnu",
            prenom: item.patient.prenom ?? "Inconnu",
            date_naissance: item.patient.date_naissance ?? null,
            sexe: item.patient.sexe ?? null,
            poids_kg: item.patient.poids_kg ?? null,
            taille_cm: item.patient.taille_cm ?? null,
            created_by: userId,
          } as never).select("id").single();
          if (error || !ins) throw new Error(error?.message ?? "Création patient échouée");
          patientId = (ins as { id: string }).id;
          summary.created++;
        } else {
          summary.updated++;
        }

        if (item.antecedents.length) {
          await supabase.from("antecedents").insert(item.antecedents.map((a) => ({
            patient_id: patientId!,
            type: a.type,
            description: a.description,
            date_evenement: a.date_evenement ?? null,
          })) as never);
        }
        if (item.comorbidites.length) {
          await supabase.from("comorbidites").insert(item.comorbidites.map((c) => ({
            patient_id: patientId!,
            libelle: c.libelle,
            statut: c.statut,
          })) as never);
        }
        if (item.allergies.length) {
          await supabase.from("allergies").insert(item.allergies.map((a) => ({
            patient_id: patientId!,
            substance: a.substance,
            reaction: a.reaction ?? null,
            severite: a.severite ?? null,
          })) as never);
        }
        if (item.biologie.length) {
          await supabase.from("biologie_resultats").insert(item.biologie.map((b) => ({
            patient_id: patientId!,
            parametre: b.parametre,
            valeur: b.valeur ?? null,
            unite: b.unite ?? null,
            valeur_texte: b.valeur_texte ?? null,
            date_prelevement: b.date_prelevement ?? null,
            source: "pdf_import",
          })) as never);
        }
        if (item.traitements.length) {
          await supabase.from("traitements_habituels").insert(item.traitements.map((t) => ({
            patient_id: patientId!,
            dci: t.dci,
            nom_commercial: t.nom_commercial ?? null,
            dosage: t.dosage ?? null,
            dosage_unite: t.dosage_unite ?? null,
            voie_administration: t.voie_administration ?? null,
            posologie_matin: t.posologie_matin ?? null,
            posologie_midi: t.posologie_midi ?? null,
            posologie_soir: t.posologie_soir ?? null,
            posologie_coucher: t.posologie_coucher ?? null,
            indication: t.indication ?? null,
            source: "pdf_import",
            actif: true,
          })) as never);
        }
      } catch (e) {
        summary.failed.push({ name: displayName || item.source_file || "?", error: e instanceof Error ? e.message : String(e) });
      }
    }
    return summary;
  });
