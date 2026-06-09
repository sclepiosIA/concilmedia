import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({
  patientId: z.string().uuid(),
  fileBase64: z.string().min(10).optional(),
  mimeType: z.string().optional(),
  storagePath: z.string().optional(),
});

export interface ExtractedLettreAdmission {
  nom?: string;
  prenom?: string;
  date_naissance?: string; // YYYY-MM-DD
  sexe?: "M" | "F" | "Autre";
  poids_kg?: number;
  taille_cm?: number;
  nir?: string;
  motif_admission?: string;
  allergies?: Array<{ substance: string; reaction?: string; severite?: string }>;
  antecedents?: Array<{ type?: string; description: string }>;
  comorbidites?: Array<{ libelle: string; code_cim10?: string }>;
}

export interface ApplyResult {
  extracted: ExtractedLettreAdmission;
  patient_updated: boolean;
  allergies_inserted: number;
  antecedents_inserted: number;
  comorbidites_inserted: number;
}

export const analyzeLettreAdmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }): Promise<ApplyResult> => {
    const { supabase } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY manquante");

    // Resolve file: prefer base64 from client; otherwise download from storage
    let fileBase64 = data.fileBase64;
    let mimeType = data.mimeType ?? "application/pdf";
    if (!fileBase64) {
      let path = data.storagePath;
      if (!path) {
        const { data: doc } = await supabase
          .from("documents_sources")
          .select("storage_path, mime_type")
          .eq("patient_id", data.patientId)
          .eq("document_type", "lettre_admission")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!doc?.storage_path) throw new Error("Aucune lettre d'admission trouvée");
        path = doc.storage_path;
        if (doc.mime_type) mimeType = doc.mime_type;
      }
      const { data: blob, error: dlErr } = await supabase.storage.from("ordonnances").download(path);
      if (dlErr || !blob) throw new Error("Téléchargement impossible : " + (dlErr?.message ?? "vide"));
      const buf = new Uint8Array(await blob.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
      fileBase64 = btoa(bin);
    }

    const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
    const { generateText } = await import("ai");
    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-3-flash-preview");

    const systemPrompt = `Tu es un assistant médical. Analyse cette lettre d'admission hospitalière française et extrais les informations du profil patient.
Réponds STRICTEMENT en JSON valide selon ce schéma (omets les champs absents) :
{
  "nom": "NOM de famille",
  "prenom": "Prénom",
  "date_naissance": "YYYY-MM-DD",
  "sexe": "M" | "F" | "Autre",
  "poids_kg": nombre,
  "taille_cm": nombre,
  "nir": "numéro de sécurité sociale 13 ou 15 chiffres",
  "motif_admission": "motif principal d'hospitalisation",
  "allergies": [{ "substance": "...", "reaction": "...", "severite": "legere|moderee|severe|anaphylaxie" }],
  "antecedents": [{ "type": "medical|chirurgical|familial|allergique", "description": "..." }],
  "comorbidites": [{ "libelle": "...", "code_cim10": "..." }]
}
Règles :
- N'invente RIEN. Omets les champs non explicitement présents.
- Le poids doit être en kg, la taille en cm.
- N'inclus que les vraies allergies médicamenteuses ou alimentaires (pas les intolérances vagues).
- Réponds UNIQUEMENT avec le JSON, sans texte autour.`;

    const result = await generateText({
      model,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Voici la lettre d'admission à analyser." },
            {
              type: "file",
              data: `data:${mimeType};base64,${fileBase64}`,
              mediaType: mimeType,
            },
          ],
        },
      ],
    });

    const raw = result.text
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "");
    let parsed: ExtractedLettreAdmission;
    try {
      parsed = JSON.parse(raw) as ExtractedLettreAdmission;
    } catch {
      throw new Error("Impossible d'analyser la réponse IA.");
    }

    // Fetch current patient to only fill empty fields
    const { data: current } = await supabase
      .from("patients")
      .select("*")
      .eq("id", data.patientId)
      .maybeSingle();

    const patientUpdate: Record<string, unknown> = {};
    if (current) {
      if (parsed.nom && !current.nom) patientUpdate.nom = parsed.nom;
      if (parsed.prenom && !current.prenom) patientUpdate.prenom = parsed.prenom;
      if (parsed.date_naissance && !current.date_naissance) patientUpdate.date_naissance = parsed.date_naissance;
      if (parsed.sexe && !current.sexe) patientUpdate.sexe = parsed.sexe;
      if (typeof parsed.poids_kg === "number" && !current.poids_kg) patientUpdate.poids_kg = parsed.poids_kg;
      if (typeof parsed.taille_cm === "number" && !current.taille_cm) patientUpdate.taille_cm = parsed.taille_cm;
      if (parsed.nir && !current.nir) patientUpdate.nir = parsed.nir;
      if (parsed.motif_admission) {
        const prefix = `Motif d'admission : ${parsed.motif_admission}`;
        patientUpdate.notes = current.notes ? `${prefix}\n\n${current.notes}` : prefix;
      }
    }

    let patient_updated = false;
    if (Object.keys(patientUpdate).length > 0) {
      const { error } = await supabase.from("patients").update(patientUpdate as never).eq("id", data.patientId);
      if (!error) patient_updated = true;
    }

    // Insert allergies (avoid duplicates on substance)
    let allergies_inserted = 0;
    if (parsed.allergies?.length) {
      const { data: existing } = await supabase
        .from("allergies")
        .select("substance")
        .eq("patient_id", data.patientId);
      const existingSet = new Set((existing ?? []).map((a) => a.substance.toLowerCase()));
      const rows = parsed.allergies
        .filter((a) => a.substance && !existingSet.has(a.substance.toLowerCase()))
        .map((a) => ({
          patient_id: data.patientId,
          substance: a.substance,
          reaction: a.reaction ?? null,
          severite: a.severite ?? null,
        }));
      if (rows.length) {
        const { error } = await supabase.from("allergies").insert(rows as never);
        if (!error) allergies_inserted = rows.length;
      }
    }

    // Insert antécédents
    let antecedents_inserted = 0;
    if (parsed.antecedents?.length) {
      const { data: existing } = await supabase
        .from("antecedents")
        .select("description")
        .eq("patient_id", data.patientId);
      const existingSet = new Set((existing ?? []).map((a) => a.description.toLowerCase()));
      const rows = parsed.antecedents
        .filter((a) => a.description && !existingSet.has(a.description.toLowerCase()))
        .map((a) => ({
          patient_id: data.patientId,
          type: a.type ?? "medical",
          description: a.description,
          actif: true,
        }));
      if (rows.length) {
        const { error } = await supabase.from("antecedents").insert(rows as never);
        if (!error) antecedents_inserted = rows.length;
      }
    }

    // Insert comorbidités
    let comorbidites_inserted = 0;
    if (parsed.comorbidites?.length) {
      const { data: existing } = await supabase
        .from("comorbidites")
        .select("libelle")
        .eq("patient_id", data.patientId);
      const existingSet = new Set((existing ?? []).map((c) => c.libelle.toLowerCase()));
      const rows = parsed.comorbidites
        .filter((c) => c.libelle && !existingSet.has(c.libelle.toLowerCase()))
        .map((c) => ({
          patient_id: data.patientId,
          libelle: c.libelle,
          code_cim10: c.code_cim10 ?? null,
          statut: "actif",
        }));
      if (rows.length) {
        const { error } = await supabase.from("comorbidites").insert(rows as never);
        if (!error) comorbidites_inserted = rows.length;
      }
    }

    return { extracted: parsed, patient_updated, allergies_inserted, antecedents_inserted, comorbidites_inserted };
  });
