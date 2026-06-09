import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({ patientId: z.string().uuid() });

export const generatePatientSynthesisPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [{ data: patient }, ant, com, all, trt, bio, ai, eps] = await Promise.all([
      supabase.from("patients").select("*").eq("id", data.patientId).maybeSingle(),
      supabase.from("antecedents").select("*").eq("patient_id", data.patientId).eq("actif", true),
      supabase.from("comorbidites").select("*").eq("patient_id", data.patientId).eq("statut", "actif"),
      supabase.from("allergies").select("*").eq("patient_id", data.patientId),
      supabase.from("traitements_habituels").select("*").eq("patient_id", data.patientId).eq("actif", true),
      supabase.from("biologie_resultats").select("*").eq("patient_id", data.patientId).order("date_prelevement", { ascending: false, nullsFirst: false }).limit(50),
      supabase.from("conciliation_ai_analyses").select("*").eq("patient_id", data.patientId).is("episode_id", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("episodes").select("id").eq("patient_id", data.patientId),
    ]);
    if (!patient) throw new Error("Patient introuvable");

    const epIds = (eps.data ?? []).map((e) => e.id);
    const { data: divergences } = epIds.length
      ? await supabase.from("conciliation_medicaments").select("*").in("episode_id", epIds).neq("type_divergence", "aucune")
      : { data: [] as Array<{ type_divergence: string; gravite: string | null; medication_domicile: unknown; medication_hospitalisation: unknown }> };

    const bioLatest = new Map<string, { parametre: string; valeur: number | null; unite: string | null; valeur_texte: string | null; date_prelevement: string | null }>();
    for (const b of bio.data ?? []) { const k = b.parametre.toLowerCase(); if (!bioLatest.has(k)) bioLatest.set(k, b); }

    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

    let page = pdf.addPage([595, 842]); // A4
    let y = 800;
    const margin = 40;
    const lineH = 13;

    const newPageIfNeeded = (needed: number) => {
      if (y - needed < 40) { page = pdf.addPage([595, 842]); y = 800; }
    };
    const writeLine = (text: string, opts: { font?: typeof font; size?: number; color?: ReturnType<typeof rgb> } = {}) => {
      const f = opts.font ?? font;
      const size = opts.size ?? 10;
      const safe = sanitize(text);
      // wrap simple
      const maxW = 515;
      const words = safe.split(" ");
      let line = "";
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        if (f.widthOfTextAtSize(test, size) > maxW) {
          newPageIfNeeded(lineH);
          page.drawText(line, { x: margin, y, size, font: f, color: opts.color ?? rgb(0, 0, 0) });
          y -= lineH;
          line = w;
        } else line = test;
      }
      if (line) {
        newPageIfNeeded(lineH);
        page.drawText(line, { x: margin, y, size, font: f, color: opts.color ?? rgb(0, 0, 0) });
        y -= lineH;
      }
    };
    const section = (title: string) => { y -= 6; newPageIfNeeded(20); writeLine(title, { font: bold, size: 12, color: rgb(0.15, 0.25, 0.6) }); y -= 2; };

    // Header
    writeLine("FICHE DE SYNTHÈSE PATIENT", { font: bold, size: 16 });
    writeLine(`Édité le ${new Date().toLocaleDateString("fr-FR")}`, { size: 9, color: rgb(0.4, 0.4, 0.4) });
    y -= 8;
    writeLine(`${patient.nom?.toUpperCase() ?? ""} ${patient.prenom ?? ""}`, { font: bold, size: 13 });
    writeLine([
      patient.date_naissance ? `Né(e) le ${new Date(patient.date_naissance).toLocaleDateString("fr-FR")}` : null,
      patient.sexe,
      patient.poids_kg ? `${patient.poids_kg} kg` : null,
      patient.taille_cm ? `${patient.taille_cm} cm` : null,
    ].filter(Boolean).join(" • "));

    const allergiesSeveres = (all.data ?? []).filter((a) => a.severite === "severe" || a.severite === "anaphylaxie");
    if (allergiesSeveres.length) {
      y -= 4;
      writeLine(`⚠ ALLERGIES SÉVÈRES : ${allergiesSeveres.map((a) => a.substance).join(", ")}`, { font: bold, color: rgb(0.8, 0, 0), size: 10 });
    }

    section(`Antécédents (${ant.data?.length ?? 0})`);
    for (const a of ant.data ?? []) writeLine(`• [${a.type}] ${a.description}${a.date_evenement ? ` (${a.date_evenement})` : ""}`);

    section(`Comorbidités (${com.data?.length ?? 0})`);
    for (const c of com.data ?? []) writeLine(`• ${c.libelle}`);

    section(`Allergies (${all.data?.length ?? 0})`);
    for (const a of all.data ?? []) writeLine(`• ${a.substance}${a.reaction ? ` → ${a.reaction}` : ""}${a.severite ? ` (${a.severite})` : ""}`);

    section(`Biologie récente (${bioLatest.size})`);
    for (const b of bioLatest.values()) writeLine(`• ${b.parametre}: ${b.valeur ?? b.valeur_texte ?? "—"} ${b.unite ?? ""}${b.date_prelevement ? ` (${b.date_prelevement})` : ""}`);

    section(`Traitements habituels (${trt.data?.length ?? 0})`);
    for (const t of trt.data ?? []) {
      const poso = [t.posologie_matin, t.posologie_midi, t.posologie_soir, t.posologie_coucher].some((x) => x)
        ? [t.posologie_matin, t.posologie_midi, t.posologie_soir, t.posologie_coucher].map((x) => x ?? "0").join("-")
        : "";
      writeLine(`• ${t.dci} ${t.dosage ?? ""}${t.dosage_unite ?? ""} ${t.voie_administration ?? ""} ${poso ? `— ${poso}` : ""}${t.indication ? ` (${t.indication})` : ""}`);
    }

    // Comorbidités → calcul IMC + complexité
    const imcVal = patient.poids_kg && patient.taille_cm
      ? Number((patient.poids_kg / Math.pow(patient.taille_cm / 100, 2)).toFixed(1))
      : null;
    if (imcVal !== null) {
      section("Profil anthropométrique");
      const cat = imcVal < 18.5 ? "Maigreur" : imcVal < 25 ? "Normal" : imcVal < 30 ? "Surpoids" : imcVal < 35 ? "Obésité I" : imcVal < 40 ? "Obésité II" : "Obésité III";
      writeLine(`IMC : ${imcVal} kg/m² (${cat})`);
    }

    type AIPayload = {
      synthese: string; score_risque: number;
      interactions?: Array<{ dci_1: string; dci_2: string; severite: string; recommandation: string }>;
      contre_indications?: Array<{ medicament: string; raison: string; recommandation: string }>;
      doublons_therapeutiques?: Array<{ medicaments: string[]; classe: string }>;
      adaptations_posologiques?: Array<{ medicament: string; raison: string; recommandation: string }>;
      medicaments_haut_risque?: Array<{ medicament: string; classe: string; raison: string }>;
      allergies_croisees?: Array<{ allergene: string; medicament: string; risque: string }>;
      surveillance?: Array<{ parametre: string; frequence: string; justification: string }>;
      conclusion_clinique?: string;
    };
    const payload = ai.data?.payload as unknown as AIPayload | undefined;
    if (payload) {
      section(`Analyse pharmaceutique IA — Score ${payload.score_risque}/100`);
      writeLine(payload.synthese);
      if (payload.interactions?.length) { y -= 3; writeLine("Interactions :", { font: bold, size: 10 }); for (const i of payload.interactions) writeLine(`  • ${i.dci_1} ↔ ${i.dci_2} (${i.severite}) → ${i.recommandation}`); }
      if (payload.contre_indications?.length) { y -= 3; writeLine("Contre-indications :", { font: bold, size: 10 }); for (const c of payload.contre_indications) writeLine(`  • ${c.medicament} — ${c.raison} → ${c.recommandation}`); }
      if (payload.doublons_therapeutiques?.length) { y -= 3; writeLine("Doublons :", { font: bold, size: 10 }); for (const d of payload.doublons_therapeutiques) writeLine(`  • ${d.medicaments.join(" + ")} (${d.classe})`); }
      if (payload.adaptations_posologiques?.length) { y -= 3; writeLine("Adaptations posologiques :", { font: bold, size: 10 }); for (const a of payload.adaptations_posologiques) writeLine(`  • ${a.medicament} — ${a.raison} → ${a.recommandation}`); }
      if (payload.medicaments_haut_risque?.length) { y -= 3; writeLine("Médicaments à haut risque :", { font: bold, size: 10 }); for (const m of payload.medicaments_haut_risque) writeLine(`  • ${m.medicament} (${m.classe}) — ${m.raison}`); }
      if (payload.allergies_croisees?.length) { y -= 3; writeLine("Allergies croisées :", { font: bold, size: 10, color: rgb(0.8, 0, 0) }); for (const a of payload.allergies_croisees) writeLine(`  • ${a.allergene} ↔ ${a.medicament} — ${a.risque}`); }
      if (payload.surveillance?.length) { y -= 3; writeLine("Plan de surveillance :", { font: bold, size: 10 }); for (const s of payload.surveillance) writeLine(`  • ${s.parametre} (${s.frequence}) — ${s.justification}`); }
    }

    if (divergences && divergences.length) {
      section(`Divergences détectées (${divergences.length})`);
      for (const d of divergences) {
        const dom = (d.medication_domicile ?? {}) as { dci?: string; dosage?: string };
        const hosp = (d.medication_hospitalisation ?? null) as { dci?: string; dosage?: string } | null;
        const gr = d.gravite ? ` [${d.gravite}]` : "";
        writeLine(`• [${d.type_divergence}]${gr} ${dom.dci ?? "—"} ${dom.dosage ? `(${dom.dosage})` : ""}${hosp ? ` → hôpital: ${hosp.dci ?? "—"} ${hosp.dosage ?? ""}` : " → non prescrit"}`);
      }
    }

    if (payload?.conclusion_clinique) {
      section("Conclusion clinique");
      writeLine(payload.conclusion_clinique, { font: bold, size: 11 });
    }

    const bytes = await pdf.save();
    // Encode base64
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const base64 = btoa(bin);
    return { base64, filename: `synthese-${(patient.nom ?? "patient").toLowerCase()}-${(patient.prenom ?? "").toLowerCase()}.pdf` };
  });

const EpInput = z.object({ episodeId: z.string().uuid() });

export const generateEpisodeConciliationPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => EpInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: episode } = await supabase.from("episodes").select("*, patients(*)").eq("id", data.episodeId).maybeSingle();
    if (!episode) throw new Error("Épisode introuvable");
    const patient = episode.patients as { nom: string; prenom: string; date_naissance: string | null; sexe: string | null; poids_kg: number | null; taille_cm: number | null };
    const patientId = episode.patient_id;

    const [trt, presc, conc, ai, all, com] = await Promise.all([
      supabase.from("traitements_habituels").select("*").eq("patient_id", patientId).eq("actif", true),
      supabase.from("prescriptions_hospitalieres").select("*").eq("episode_id", data.episodeId).eq("actif", true),
      supabase.from("conciliation_medicaments").select("*").eq("episode_id", data.episodeId),
      supabase.from("conciliation_ai_analyses").select("*").eq("episode_id", data.episodeId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("allergies").select("*").eq("patient_id", patientId),
      supabase.from("comorbidites").select("*").eq("patient_id", patientId).eq("statut", "actif"),
    ]);
    const { computeComplexity, COMPLEXITY_LABEL, generateClinicalProfile, generateRecommendations, GRAVITE_LABEL } = await import("@/lib/clinical/complexityScore");
    const comLabels = (com.data ?? []).map((c) => c.libelle);
    const complexity = computeComplexity(comLabels);
    const profile = generateClinicalProfile(comLabels);
    const recs = generateRecommendations({
      comorbidities: comLabels,
      divergences: (conc.data ?? []).map((c) => ({
        dci: (c.medication_domicile as { dci?: string } | null)?.dci ?? "",
        classe: c.classe_atc ?? undefined,
        type: c.type_divergence,
      })),
    });

    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    let page = pdf.addPage([595, 842]);
    let y = 800;
    const margin = 40;
    const lineH = 13;

    const newPageIfNeeded = (needed: number) => { if (y - needed < 40) { page = pdf.addPage([595, 842]); y = 800; } };
    const writeLine = (text: string, opts: { font?: typeof font; size?: number; color?: ReturnType<typeof rgb> } = {}) => {
      const f = opts.font ?? font;
      const size = opts.size ?? 10;
      const safe = sanitize(text);
      const maxW = 515;
      const words = safe.split(" ");
      let line = "";
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        if (f.widthOfTextAtSize(test, size) > maxW) {
          newPageIfNeeded(lineH);
          page.drawText(line, { x: margin, y, size, font: f, color: opts.color ?? rgb(0, 0, 0) });
          y -= lineH;
          line = w;
        } else line = test;
      }
      if (line) { newPageIfNeeded(lineH); page.drawText(line, { x: margin, y, size, font: f, color: opts.color ?? rgb(0, 0, 0) }); y -= lineH; }
    };
    const section = (title: string) => { y -= 6; newPageIfNeeded(20); writeLine(title, { font: bold, size: 12, color: rgb(0.15, 0.25, 0.6) }); y -= 2; };

    writeLine("CONCILIATION MÉDICAMENTEUSE", { font: bold, size: 16 });
    writeLine(`Édité le ${new Date().toLocaleDateString("fr-FR")}`, { size: 9, color: rgb(0.4, 0.4, 0.4) });
    y -= 8;
    writeLine(`${patient.nom?.toUpperCase() ?? ""} ${patient.prenom ?? ""}`, { font: bold, size: 13 });
    writeLine([
      patient.date_naissance ? `Né(e) ${new Date(patient.date_naissance).toLocaleDateString("fr-FR")}` : null,
      patient.sexe, patient.poids_kg ? `${patient.poids_kg} kg` : null,
    ].filter(Boolean).join(" • "));
    writeLine(`Épisode : ${episode.motif ?? ""} — ${episode.service ?? ""}`, { font: bold });

    const allergSev = (all.data ?? []).filter((a) => a.severite === "severe" || a.severite === "anaphylaxie");
    if (allergSev.length) { y -= 4; writeLine(`⚠ ALLERGIES : ${allergSev.map((a) => a.substance).join(", ")}`, { font: bold, color: rgb(0.8, 0, 0) }); }

    section(`Traitements habituels — domicile (${trt.data?.length ?? 0})`);
    for (const t of trt.data ?? []) {
      const poso = [t.posologie_matin, t.posologie_midi, t.posologie_soir, t.posologie_coucher].some((x) => x)
        ? [t.posologie_matin, t.posologie_midi, t.posologie_soir, t.posologie_coucher].map((x) => x ?? "0").join("-") : "";
      writeLine(`• ${t.dci} ${t.dosage ?? ""}${t.dosage_unite ?? ""} ${t.voie_administration ?? ""} ${poso ? `— ${poso}` : ""}`);
    }

    section(`Prescriptions hospitalières (${presc.data?.length ?? 0})`);
    for (const p of presc.data ?? []) writeLine(`• ${p.medicament} ${p.dosage ?? ""} ${p.voie_administration ?? ""} ${p.posologie ? `— ${p.posologie}` : ""}${p.indication ? ` (${p.indication})` : ""}`);

    section(`Profil clinique — Complexité ${COMPLEXITY_LABEL[complexity.niveau]} (${complexity.score} pts)`);
    if (comLabels.length) writeLine(`Comorbidités : ${comLabels.join(", ")}`);
    writeLine(profile.profile);
    if (profile.vigilance.length) { writeLine("Facteurs de vigilance :", { font: bold }); for (const v of profile.vigilance) writeLine(`  • ${v}`); }
    if (recs.length) { y -= 3; writeLine("Recommandations cliniques :", { font: bold }); for (const r of recs) writeLine(`  • ${r}`); }

    section(`Divergences (${conc.data?.length ?? 0})`);
    for (const c of conc.data ?? []) {
      const gr = c.gravite ? ` [${GRAVITE_LABEL[c.gravite as keyof typeof GRAVITE_LABEL] ?? c.gravite}]` : "";
      writeLine(`• [${c.type_divergence}]${gr} ${c.intention} — ${c.statut}`, { font: bold });
      if (c.justification) writeLine(`    Justif: ${c.justification}`);
      if (c.action_corrective) writeLine(`    Action: ${c.action_corrective}`);
    }

    type AIPayload = {
      synthese: string; score_risque: number;
      interactions?: Array<{ dci_1: string; dci_2: string; severite: string; recommandation: string }>;
      contre_indications?: Array<{ medicament: string; raison: string; recommandation: string }>;
      doublons_therapeutiques?: Array<{ medicaments: string[]; classe: string }>;
      adaptations_posologiques?: Array<{ medicament: string; raison: string; recommandation: string }>;
    };
    const payload = ai.data?.payload as unknown as AIPayload | undefined;
    if (payload) {
      section(`Analyse pharmaceutique IA — Score ${payload.score_risque}/100`);
      writeLine(payload.synthese);
      if (payload.interactions?.length) { y -= 3; writeLine("Interactions :", { font: bold }); for (const i of payload.interactions) writeLine(`  • ${i.dci_1} ↔ ${i.dci_2} (${i.severite}) → ${i.recommandation}`); }
      if (payload.contre_indications?.length) { y -= 3; writeLine("Contre-indications :", { font: bold }); for (const c of payload.contre_indications) writeLine(`  • ${c.medicament} — ${c.raison} → ${c.recommandation}`); }
      if (payload.doublons_therapeutiques?.length) { y -= 3; writeLine("Doublons :", { font: bold }); for (const d of payload.doublons_therapeutiques) writeLine(`  • ${d.medicaments.join(" + ")} (${d.classe})`); }
      if (payload.adaptations_posologiques?.length) { y -= 3; writeLine("Adaptations posologiques :", { font: bold }); for (const a of payload.adaptations_posologiques) writeLine(`  • ${a.medicament} — ${a.raison} → ${a.recommandation}`); }
    }

    const bytes = await pdf.save();
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return { base64: btoa(bin), filename: `conciliation-${(patient.nom ?? "patient").toLowerCase()}-${data.episodeId.slice(0, 8)}.pdf` };
  });

// Strip characters not in Helvetica's WinAnsi encoding
function sanitize(s: string): string {
  return s
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2014/g, "-")
    .replace(/\u2013/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/[^\x00-\xFF]/g, "?");
}
