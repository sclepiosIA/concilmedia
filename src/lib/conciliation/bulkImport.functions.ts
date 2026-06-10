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
  posologie_texte: z.string().optional().nullable(),
  indication: z.string().optional().nullable(),
  duree: z.string().optional().nullable(),
});

const PrescriptionHospiSchema = z.object({
  medicament: z.string(),
  dosage: z.string().optional().nullable(),
  posologie: z.string().optional().nullable(),
  voie_administration: z.string().optional().nullable(),
  indication: z.string().optional().nullable(),
  date_debut: z.string().optional().nullable(),
  date_fin: z.string().optional().nullable(),
});

const EpisodeContextSchema = z.object({
  motif: z.string().optional().nullable(),
  service: z.string().optional().nullable(),
  date_admission: z.string().optional().nullable(),
}).optional().nullable();

const PrescriberSchema = z.object({
  name: z.string().optional().nullable(),
  specialty: z.string().optional().nullable(),
  prescription_date: z.string().optional().nullable(),
}).optional().nullable();

const DossierSchema = z.object({
  document_type: z.enum(["ordonnance_ville", "ordonnance_hospitaliere", "lettre_admission", "compte_rendu", "bilan_bio", "autre"]).default("autre"),
  patient: PatientSchema,
  prescriber: PrescriberSchema,
  antecedents: z.array(AntecedentSchema).default([]),
  comorbidites: z.array(ComorbiditeSchema).default([]),
  allergies: z.array(AllergieSchema).default([]),
  biologie: z.array(BiologieSchema).default([]),
  traitements: z.array(TraitementSchema).default([]),
  prescriptions_hospitalieres: z.array(PrescriptionHospiSchema).default([]),
  episode_context: EpisodeContextSchema,
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

    const { generateText } = await import("ai");
    const { resolveAITask } = await import("@/lib/ai/runAITask.server");
    const __aiTaskSlug = "bulk_import";
    const __aiDefaultModel = "google/gemini-3-flash-preview";

    const systemPrompt = `Tu es un assistant médical expert en lecture de dossiers patients.
Analyse le document fourni (PDF / image) et CLASSIFIE-LE puis extrais TOUTES les informations cliniques.
Réponds STRICTEMENT en JSON valide (aucun texte avant/après, pas de markdown) selon ce schéma :
{
  "document_type": "ordonnance_ville" | "ordonnance_hospitaliere" | "lettre_admission" | "compte_rendu" | "bilan_bio" | "autre",
  "patient": { "nom":"...", "prenom":"...", "date_naissance":"YYYY-MM-DD", "sexe":"M|F|autre", "poids_kg":number, "taille_cm":number },
  "prescriber": { "name":"Dr Jean Dupont", "specialty":"Médecin généraliste|Cardiologue|Endocrinologue|Néphrologue|...", "prescription_date":"YYYY-MM-DD" },
  "antecedents": [{ "type":"medical|chirurgical|familial|obstetrical|autre", "description":"...", "date_evenement":"YYYY-MM-DD" }],
  "comorbidites": [{ "libelle":"HTA", "statut":"actif|resolu|suspect" }],
  "allergies": [{ "substance":"Pénicilline", "reaction":"urticaire", "severite":"legere|moderee|severe|anaphylaxie" }],
  "biologie": [{ "parametre":"DFG", "valeur":45, "unite":"mL/min/1,73m²", "date_prelevement":"YYYY-MM-DD" }],
  "traitements": [{ "dci":"Metformine", "nom_commercial":"Glucophage", "dosage":"500", "dosage_unite":"mg", "voie_administration":"PO", "posologie_matin":"1", "posologie_soir":"1", "posologie_texte":"phrase libre si schéma complexe", "indication":"diabète", "duree":"3 mois | au long cours | non précisée" }],
  "prescriptions_hospitalieres": [{ "medicament":"Enoxaparine 4000 UI", "dosage":"4000 UI", "posologie":"1 inj/j SC", "voie_administration":"SC", "indication":"thromboprophylaxie", "date_debut":"YYYY-MM-DD (date du jour J / date de prescription)", "date_fin":"YYYY-MM-DD ou null" }],
  "episode_context": { "motif":"...", "service":"...", "date_admission":"YYYY-MM-DD" }
}
Règles CRUCIALES de classification :
- "lettre_admission" = lettre/courrier d'admission, lettre du médecin adressant le patient, demande d'hospitalisation, fiche d'admission aux urgences. PRIORITÉ ABSOLUE : remplis "episode_context.motif" (motif d'admission/d'hospitalisation, ex. "chute mécanique avec fracture col fémur", "décompensation cardiaque") + "episode_context.service" + "episode_context.date_admission". Extrais AUSSI les antécédents et allergies mentionnés dans la lettre (souvent listés). Les traitements habituels listés vont dans "traitements". Ne mets RIEN dans "prescriptions_hospitalieres" (pas de prescription du jour J ici).
- "ordonnance_hospitaliere" = prescription rédigée PENDANT une hospitalisation (en-tête hôpital/service, date d'admission, ordonnance de séjour) → met les lignes dans "prescriptions_hospitalieres" ET remplis "episode_context".
- "ordonnance_ville" = ordonnance de médecin traitant / sortie / traitement habituel → met les lignes dans "traitements".
- "compte_rendu" = CRH, lettre de consultation → extrais antécédents/comorbidités/allergies/traitements habituels mentionnés.
- "bilan_bio" = laboratoire → remplis surtout "biologie".
- Si le document liste à la fois traitement habituel ET nouvelles prescriptions hospi, sépare-les correctement.
- Pour les antécédents et allergies : extrais TOUS ceux mentionnés, même brièvement (sections "ATCD", "Allergies", "Intolérances", anamnèse). N'invente jamais.
- Pour chaque prescription hospitalière, EXTRAIS la date du jour de prescription (jour J) dans "date_debut" (format YYYY-MM-DD). C'est la date imprimée en tête d'ordonnance hospitalière ou à côté de chaque ligne. Si une durée ou date d'arrêt est précisée, remplis "date_fin".
- Pour TOUTE ordonnance de ville : extrais OBLIGATOIREMENT le bloc "prescriber" (nom complet du médecin prescripteur tel qu'écrit avec titre "Dr"/"Pr", spécialité littérale issue de l'en-tête/du tampon, date de l'ordonnance en YYYY-MM-DD). Si plusieurs ordonnances dans le même PDF, prends celle du document analysé. N'invente jamais : laisse null si non lisible.
- Privilégie la DCI au nom commercial dans "traitements"; dans "prescriptions_hospitalieres" garde le libellé tel qu'écrit.
- Biologie prioritaire : DFG, créatinine, kaliémie, natrémie, INR, TP, hémoglobine, plaquettes, leucocytes, ASAT, ALAT, glycémie, HbA1c, CRP.
- Omets les champs inconnus, n'invente rien. Renvoie [] pour les sections vides.
- Ne renvoie QUE le JSON.`;
    const { model, systemPrompt: __systemPrompt } = await resolveAITask(__aiTaskSlug, { systemPrompt, model: __aiDefaultModel });

    const result = await generateText({
      model,
      system: __systemPrompt,
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
    file_base64: z.string().optional(),
    mime_type: z.string().optional(),
    file_size: z.number().optional(),
  })).min(1).max(20),
  auto_create_episode: z.boolean().optional().default(true),
});

export const commitBulkImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CommitInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const summary = {
      created: 0,
      updated: 0,
      failed: [] as { name: string; error: string }[],
      created_episode_ids: [] as string[],
    };

    // Groupe les items par patient (existant ou nouveau) pour agréger les prescriptions hospi
    type PendingHospi = { patientId: string; prescriptions: typeof data.items[number]["prescriptions_hospitalieres"]; context: { motif?: string | null; service?: string | null; date_admission?: string | null }; sourceDocumentId: string | null };
    const hospiByPatient = new Map<string, PendingHospi>();

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

        // ────────────── Traçabilité : upload du PDF source ──────────────
        let sourceDocumentId: string | null = null;
        if (item.file_base64 && item.mime_type) {
          try {
            const bin = Uint8Array.from(atob(item.file_base64), (c) => c.charCodeAt(0));
            const hashBuf = await crypto.subtle.digest("SHA-256", bin);
            const hashHex = Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");
            const safeName = (item.source_file ?? "document.pdf").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
            const storagePath = `${userId}/${patientId}/${hashHex.slice(0, 16)}_${safeName}`;
            const { error: upErr } = await supabase.storage
              .from("ordonnances")
              .upload(storagePath, bin, { contentType: item.mime_type, upsert: true });
            if (upErr) throw upErr;
            const { data: doc, error: docErr } = await supabase.from("documents_sources").insert({
              patient_id: patientId,
              storage_path: storagePath,
              file_name: item.source_file ?? "document.pdf",
              mime_type: item.mime_type,
              file_size: item.file_size ?? bin.length,
              hash_sha256: hashHex,
              document_type: item.document_type,
              uploaded_by: userId,
              prescriber_name: item.prescriber?.name ?? null,
              prescriber_specialty: item.prescriber?.specialty ?? null,
              prescription_date: item.prescriber?.prescription_date ?? null,
            } as never).select("id").single();
            if (docErr || !doc) throw docErr ?? new Error("Création document source échouée");
            sourceDocumentId = (doc as { id: string }).id;
          } catch (e) {
            console.warn("Source document upload failed:", e);
          }
        }

        // Dédup si patient existant
        let existingAntecedents = new Set<string>();
        let existingComorb = new Set<string>();
        let existingAllergies = new Set<string>();
        let existingTraitements = new Set<string>();
        let existingBio = new Set<string>();
        if (item.existing_patient_id) {
          const [ea, ec, eal, et, eb] = await Promise.all([
            supabase.from("antecedents").select("type, description").eq("patient_id", patientId!),
            supabase.from("comorbidites").select("libelle").eq("patient_id", patientId!),
            supabase.from("allergies").select("substance").eq("patient_id", patientId!),
            supabase.from("traitements_habituels").select("dci").eq("patient_id", patientId!).eq("actif", true),
            supabase.from("biologie_resultats").select("parametre, date_prelevement").eq("patient_id", patientId!),
          ]);
          existingAntecedents = new Set((ea.data ?? []).map((r) => `${r.type}|${(r.description ?? "").toLowerCase().trim()}`));
          existingComorb = new Set((ec.data ?? []).map((r) => (r.libelle ?? "").toLowerCase().trim()));
          existingAllergies = new Set((eal.data ?? []).map((r) => (r.substance ?? "").toLowerCase().trim()));
          existingTraitements = new Set((et.data ?? []).map((r) => (r.dci ?? "").toLowerCase().trim()));
          existingBio = new Set((eb.data ?? []).map((r) => `${(r.parametre ?? "").toLowerCase()}|${r.date_prelevement ?? ""}`));
        }

        const newAntecedents = item.antecedents.filter((a) => !existingAntecedents.has(`${a.type}|${a.description.toLowerCase().trim()}`));
        if (newAntecedents.length) {
          await supabase.from("antecedents").insert(newAntecedents.map((a) => ({
            patient_id: patientId!, type: a.type, description: a.description, date_evenement: a.date_evenement ?? null,
            source_document_id: sourceDocumentId,
          })) as never);
        }
        const newComorb = item.comorbidites.filter((c) => !existingComorb.has(c.libelle.toLowerCase().trim()));
        if (newComorb.length) {
          await supabase.from("comorbidites").insert(newComorb.map((c) => ({
            patient_id: patientId!, libelle: c.libelle, statut: c.statut,
            source_document_id: sourceDocumentId,
          })) as never);
        }
        const newAllergies = item.allergies.filter((a) => !existingAllergies.has(a.substance.toLowerCase().trim()));
        if (newAllergies.length) {
          await supabase.from("allergies").insert(newAllergies.map((a) => ({
            patient_id: patientId!, substance: a.substance, reaction: a.reaction ?? null, severite: a.severite ?? null,
            source_document_id: sourceDocumentId,
          })) as never);
        }
        const newBio = item.biologie.filter((b) => !existingBio.has(`${b.parametre.toLowerCase()}|${b.date_prelevement ?? ""}`));
        if (newBio.length) {
          await supabase.from("biologie_resultats").insert(newBio.map((b) => ({
            patient_id: patientId!, parametre: b.parametre, valeur: b.valeur ?? null, unite: b.unite ?? null,
            valeur_texte: b.valeur_texte ?? null, date_prelevement: b.date_prelevement ?? null, source: "pdf_import",
            source_document_id: sourceDocumentId,
          })) as never);
        }
        // Pas de fusion : chaque ordonnance contribue toutes ses lignes (une par occurrence).
        if (item.traitements.length) {
          const { data: insertedTraits, error: tErr } = await supabase.from("traitements_habituels").insert(item.traitements.map((t) => ({
            patient_id: patientId!, dci: t.dci, nom_commercial: t.nom_commercial ?? null, dosage: t.dosage ?? null,
            dosage_unite: t.dosage_unite ?? null, voie_administration: t.voie_administration ?? null,
            posologie_matin: t.posologie_matin ?? null, posologie_midi: t.posologie_midi ?? null,
            posologie_soir: t.posologie_soir ?? null, posologie_coucher: t.posologie_coucher ?? null,
            posologie_texte: t.posologie_texte ?? null,
            indication: t.indication ?? null, duree: t.duree ?? null,
            source: "pdf_import", actif: true,
            source_document_id: sourceDocumentId,
          })) as never).select("id");
          if (tErr) throw tErr;
          // Lien dans la table de jonction (multi-sources)
          if (sourceDocumentId && insertedTraits) {
            await supabase.from("traitement_sources").insert(
              (insertedTraits as { id: string }[]).map((row) => ({
                traitement_id: row.id,
                source_document_id: sourceDocumentId!,
              })) as never,
            );
          }
        }

        // Agréger prescriptions hospi pour ce patient
        const hasHospiSignal = item.document_type === "ordonnance_hospitaliere" || item.document_type === "lettre_admission" || (item.prescriptions_hospitalieres?.length ?? 0) > 0 || !!item.episode_context?.motif;
        if (data.auto_create_episode && hasHospiSignal && patientId) {
          const existing = hospiByPatient.get(patientId) ?? {
            patientId,
            prescriptions: [],
            context: { motif: null, service: null, date_admission: null },
            sourceDocumentId,
          };
          existing.prescriptions.push(...(item.prescriptions_hospitalieres ?? []));
          existing.sourceDocumentId = existing.sourceDocumentId ?? sourceDocumentId;
          if (item.episode_context) {
            existing.context.motif = existing.context.motif ?? item.episode_context.motif ?? null;
            existing.context.service = existing.context.service ?? item.episode_context.service ?? null;
            existing.context.date_admission = existing.context.date_admission ?? item.episode_context.date_admission ?? null;
          }
          hospiByPatient.set(patientId, existing);
        }
      } catch (e) {
        summary.failed.push({ name: displayName || item.source_file || "?", error: e instanceof Error ? e.message : String(e) });
      }
    }

    // Créer les épisodes + insérer prescriptions hospi
    for (const pending of hospiByPatient.values()) {
      if (pending.prescriptions.length === 0 && !pending.context.motif) continue;
      try {
        const { data: ep, error } = await supabase.from("episodes").insert({
          patient_id: pending.patientId,
          motif: pending.context.motif ?? "Hospitalisation – import PDF",
          service: pending.context.service ?? "Médecine",
          date_entree: pending.context.date_admission ? new Date(pending.context.date_admission).toISOString() : new Date().toISOString(),
        } as never).select("id").single();
        if (error || !ep) throw new Error(error?.message ?? "Création épisode échouée");
        const episodeId = (ep as { id: string }).id;

        // Lier le document source à l'épisode si possible
        if (pending.sourceDocumentId) {
          await supabase.from("documents_sources")
            .update({ episode_id: episodeId } as never)
            .eq("id", pending.sourceDocumentId);
        }

        // Dédup par medicament (lowercase)
        const seen = new Set<string>();
        const rows = pending.prescriptions
          .filter((p) => {
            const k = p.medicament.toLowerCase().trim();
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          })
          .map((p) => ({
            patient_id: pending.patientId,
            episode_id: episodeId,
            medicament: p.medicament,
            dosage: p.dosage ?? null,
            posologie: p.posologie ?? null,
            voie_administration: p.voie_administration ?? null,
            indication: p.indication ?? null,
            date_debut: p.date_debut ?? new Date().toISOString().slice(0, 10),
            date_fin: p.date_fin ?? null,
            actif: true,
            source_document_id: pending.sourceDocumentId,
          }));
        if (rows.length) {
          await supabase.from("prescriptions_hospitalieres").insert(rows as never);
        }
        summary.created_episode_ids.push(episodeId);
      } catch (e) {
        summary.failed.push({ name: `Épisode patient ${pending.patientId}`, error: e instanceof Error ? e.message : String(e) });
      }
    }

    return summary;
  });
