// Piste #9 v1+v2 — Conciliation de sortie
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface DischargeMedRow {
  source: "habituel" | "entree" | "sortie";
  id: string;
  medicament: string;
  nom_commercial?: string | null;
  dosage?: string | null;
  posologie?: string | null;
  voie_administration?: string | null;
  indication?: string | null;
}

export interface DischargeComparison {
  habituel: DischargeMedRow[];
  entree: DischargeMedRow[];
  sortie: DischargeMedRow[];
  changes: Array<{
    medicament: string;
    en_habituel: boolean;
    en_entree: boolean;
    en_sortie: boolean;
    statut: "poursuivi" | "introduit" | "arrete" | "repris" | "modifie" | "inchange";
    detail?: string;
  }>;
  patient: {
    id: string;
    nom: string;
    prenom: string;
    date_naissance: string | null;
    sexe: string | null;
    organization_id: string | null;
    medecin_traitant_nom: string | null;
    medecin_traitant_mssante: string | null;
    pharmacien_officine_nom: string | null;
    pharmacien_officine_mssante: string | null;
    allergies: Array<{ substance: string | null; severite: string | null; reaction: string | null }>;
    comorbidites: Array<{ libelle: string | null }>;
  } | null;
  episode: {
    id: string;
    date_entree: string;
    date_sortie: string | null;
    service: string | null;
    motif: string | null;
  };
}

function norm(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function buildPosologie(row: {
  posologie_texte?: string | null;
  posologie_matin?: string | null;
  posologie_midi?: string | null;
  posologie_soir?: string | null;
  posologie_coucher?: string | null;
}): string | null {
  if (row.posologie_texte) return row.posologie_texte;
  const parts: string[] = [];
  if (row.posologie_matin) parts.push(`matin: ${row.posologie_matin}`);
  if (row.posologie_midi) parts.push(`midi: ${row.posologie_midi}`);
  if (row.posologie_soir) parts.push(`soir: ${row.posologie_soir}`);
  if (row.posologie_coucher) parts.push(`coucher: ${row.posologie_coucher}`);
  return parts.length ? parts.join(", ") : null;
}

interface EpisodeJoin {
  id: string;
  patient_id: string;
  date_entree: string;
  date_sortie: string | null;
  service: string | null;
  motif: string | null;
  patients: {
    id: string;
    nom: string;
    prenom: string;
    date_naissance: string | null;
    sexe: string | null;
    organization_id: string | null;
    medecin_traitant_nom: string | null;
    medecin_traitant_mssante: string | null;
    pharmacien_officine_nom: string | null;
    pharmacien_officine_mssante: string | null;
  } | null;
}

export const compareDischargeMedications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ episodeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<DischargeComparison> => {
    const { supabase } = context;

    const { data: epRaw, error: epErr } = await supabase
      .from("episodes")
      .select(
        "id, patient_id, date_entree, date_sortie, service, motif, patients(id, nom, prenom, date_naissance, sexe, organization_id, medecin_traitant_nom, medecin_traitant_mssante, pharmacien_officine_nom, pharmacien_officine_mssante)",
      )
      .eq("id", data.episodeId)
      .maybeSingle();
    if (epErr) throw new Error(epErr.message);
    if (!epRaw) throw new Error("Épisode introuvable");
    const ep = epRaw as unknown as EpisodeJoin;

    const { data: habituelsRaw } = await supabase
      .from("traitements_habituels")
      .select(
        "id, dci, nom_commercial, dosage, voie_administration, indication, posologie_texte, posologie_matin, posologie_midi, posologie_soir, posologie_coucher",
      )
      .eq("patient_id", ep.patient_id)
      .eq("actif", true);

    const { data: prescsRaw } = await supabase
      .from("prescriptions_hospitalieres")
      .select(
        "id, medicament, nom_commercial, dosage, posologie, voie_administration, indication, actif, date_debut, date_fin",
      )
      .eq("episode_id", ep.id);

    const [{ data: allergiesRaw }, { data: comorbiditesRaw }] = await Promise.all([
      supabase
        .from("allergies")
        .select("substance, severite, reaction")
        .eq("patient_id", ep.patient_id),
      supabase
        .from("comorbidites")
        .select("libelle")
        .eq("patient_id", ep.patient_id)
        .eq("statut", "actif"),
    ]);

    const habRows: DischargeMedRow[] = (habituelsRaw ?? []).map((h) => ({
      source: "habituel" as const,
      id: h.id,
      medicament: h.dci ?? h.nom_commercial ?? "",
      nom_commercial: h.nom_commercial,
      dosage: h.dosage,
      posologie: buildPosologie(h),
      voie_administration: h.voie_administration,
      indication: h.indication,
    }));

    const dateEntree = new Date(ep.date_entree);
    const dateSortie = ep.date_sortie ? new Date(ep.date_sortie) : new Date();
    const entreeRows: DischargeMedRow[] = [];
    const sortieRows: DischargeMedRow[] = [];
    for (const p of prescsRaw ?? []) {
      const row: DischargeMedRow = {
        source: "entree",
        id: p.id,
        medicament: p.medicament,
        nom_commercial: p.nom_commercial,
        dosage: p.dosage,
        posologie: p.posologie,
        voie_administration: p.voie_administration,
        indication: p.indication,
      };
      const start = p.date_debut ? new Date(p.date_debut) : dateEntree;
      const end = p.date_fin ? new Date(p.date_fin) : null;
      if (start.getTime() - dateEntree.getTime() <= 48 * 3600 * 1000) {
        entreeRows.push({ ...row, source: "entree" });
      }
      if (p.actif && (!end || end.getTime() >= dateSortie.getTime())) {
        sortieRows.push({ ...row, source: "sortie" });
      }
    }

    const keys = new Set<string>([
      ...habRows.map((r) => norm(r.medicament)),
      ...entreeRows.map((r) => norm(r.medicament)),
      ...sortieRows.map((r) => norm(r.medicament)),
    ]);

    const changes: DischargeComparison["changes"] = [];
    for (const k of keys) {
      if (!k) continue;
      const inHab = habRows.some((r) => norm(r.medicament) === k);
      const inEntr = entreeRows.some((r) => norm(r.medicament) === k);
      const inSort = sortieRows.some((r) => norm(r.medicament) === k);
      let statut: DischargeComparison["changes"][number]["statut"] = "inchange";
      let detail: string | undefined;
      if (inHab && inSort) statut = "poursuivi";
      if (!inHab && inSort) statut = "introduit";
      if (inHab && !inSort) statut = "arrete";
      if (inHab && !inEntr && inSort) statut = "repris";
      const h = habRows.find((r) => norm(r.medicament) === k);
      const s = sortieRows.find((r) => norm(r.medicament) === k);
      if (h && s && (norm(h.posologie) !== norm(s.posologie) || norm(h.dosage) !== norm(s.dosage))) {
        statut = "modifie";
        detail = `Habituel: ${h.dosage ?? ""} ${h.posologie ?? ""} → Sortie: ${s.dosage ?? ""} ${s.posologie ?? ""}`;
      }
      const label =
        s?.medicament ?? h?.medicament ?? entreeRows.find((r) => norm(r.medicament) === k)?.medicament ?? k;
      changes.push({
        medicament: label,
        en_habituel: inHab,
        en_entree: inEntr,
        en_sortie: inSort,
        statut,
        detail,
      });
    }

    changes.sort((a, b) => {
      const order = { introduit: 0, arrete: 1, modifie: 2, repris: 3, poursuivi: 4, inchange: 5 } as const;
      return order[a.statut] - order[b.statut];
    });

    const patientOut = ep.patients
      ? {
          ...ep.patients,
          allergies: (allergiesRaw ?? []).map((a) => ({
            substance: a.substance,
            severite: a.severite,
            reaction: a.reaction,
          })),
          comorbidites: (comorbiditesRaw ?? []).map((c) => ({ libelle: c.libelle })),
        }
      : null;

    return {
      habituel: habRows,
      entree: entreeRows,
      sortie: sortieRows,
      changes,
      patient: patientOut,
      episode: {
        id: ep.id,
        date_entree: ep.date_entree,
        date_sortie: ep.date_sortie,
        service: ep.service,
        motif: ep.motif,
      },
    };
  });

const GenerateInput = z.object({
  episodeId: z.string().uuid(),
  recipientMedecinNom: z.string().max(200).optional().nullable(),
  recipientMedecinMssante: z.string().max(200).optional().nullable(),
  recipientPharmacienNom: z.string().max(200).optional().nullable(),
  recipientPharmacienMssante: z.string().max(200).optional().nullable(),
  parentLetterId: z.string().uuid().optional().nullable(),
});

async function buildAndInsertLetter(
  supabase: ReturnType<typeof Object>,
  args: {
    episodeId: string;
    userId: string;
    recipients: {
      medecinNom: string | null;
      medecinMss: string | null;
      pharmaNom: string | null;
      pharmaMss: string | null;
    };
    parentLetterId: string | null;
  },
): Promise<{ id: string; letterHtml: string }> {
  // typed inner alias
  const sb = supabase as unknown as ReturnType<typeof Object> & {
    from: (t: string) => {
      select: (s: string) => {
        eq: (c: string, v: unknown) => {
          maybeSingle?: () => Promise<{ data: unknown; error: { message: string } | null }>;
          eq?: (c: string, v: unknown) => Promise<{ data: unknown[] | null }>;
          order?: (c: string, o: { ascending: boolean }) => {
            limit: (n: number) => Promise<{ data: unknown[] | null }>;
          };
        };
      };
      insert: (r: unknown) => { select: (s: string) => { single: () => Promise<{ data: { id: string }; error: { message: string } | null }> } };
      update: (r: unknown) => { eq: (c: string, v: unknown) => Promise<{ error: { message: string } | null }> };
    };
  };
  void sb;
  const { data: epRaw, error: epErr } = await (supabase as any)
    .from("episodes")
    .select(
      "id, patient_id, date_entree, date_sortie, service, motif, patients(id, nom, prenom, date_naissance, sexe, organization_id)",
    )
    .eq("id", args.episodeId)
    .maybeSingle();
  if (epErr) throw new Error(epErr.message);
  if (!epRaw) throw new Error("Épisode introuvable");
  const ep = epRaw as unknown as EpisodeJoin;
  const orgId = ep.patients?.organization_id ?? null;

  const [habRes, prescRes, allRes, comRes] = await Promise.all([
    (supabase as any)
      .from("traitements_habituels")
      .select(
        "dci, nom_commercial, dosage, voie_administration, indication, posologie_texte, posologie_matin, posologie_midi, posologie_soir, posologie_coucher",
      )
      .eq("patient_id", ep.patient_id)
      .eq("actif", true),
    (supabase as any)
      .from("prescriptions_hospitalieres")
      .select("medicament, dosage, posologie, voie_administration, indication, actif, date_fin")
      .eq("episode_id", ep.id),
    (supabase as any)
      .from("allergies")
      .select("substance, severite, reaction")
      .eq("patient_id", ep.patient_id),
    (supabase as any)
      .from("comorbidites")
      .select("libelle")
      .eq("patient_id", ep.patient_id)
      .eq("statut", "actif"),
  ]);

  const habituels = (habRes.data ?? []) as Array<{
    dci: string | null;
    nom_commercial: string | null;
    dosage: string | null;
    voie_administration: string | null;
    indication: string | null;
    posologie_texte: string | null;
    posologie_matin: string | null;
    posologie_midi: string | null;
    posologie_soir: string | null;
    posologie_coucher: string | null;
  }>;
  const prescs = (prescRes.data ?? []) as Array<{
    medicament: string;
    dosage: string | null;
    posologie: string | null;
    voie_administration: string | null;
    indication: string | null;
    actif: boolean;
    date_fin: string | null;
  }>;
  const allergies = (allRes.data ?? []) as Array<{ substance: string | null; severite: string | null; reaction: string | null }>;
  const comorbidites = (comRes.data ?? []) as Array<{ libelle: string | null }>;

  const dateSortie = ep.date_sortie ? new Date(ep.date_sortie) : new Date();
  const sortie = prescs.filter((p) => p.actif && (!p.date_fin || new Date(p.date_fin) >= dateSortie));

  const p = ep.patients;
  const age = p?.date_naissance
    ? Math.floor((Date.now() - new Date(p.date_naissance).getTime()) / 31557600000)
    : null;

  const habituelLines = habituels
    .map((h) => {
      const name = h.dci ?? h.nom_commercial ?? "";
      const poso = buildPosologie(h);
      return `- ${name}${h.dosage ? ` ${h.dosage}` : ""}${poso ? `, ${poso}` : ""}${h.indication ? ` (${h.indication})` : ""}`;
    })
    .join("\n");

  const sortieLines = sortie
    .map(
      (s) =>
        `- ${s.medicament}${s.dosage ? ` ${s.dosage}` : ""}${s.posologie ? `, ${s.posologie}` : ""}${s.indication ? ` (${s.indication})` : ""}`,
    )
    .join("\n");

  const allergiesLines = allergies
    .filter((a) => a.substance)
    .map((a) => `- ${a.substance}${a.severite ? ` (${a.severite})` : ""}${a.reaction ? ` — ${a.reaction}` : ""}`)
    .join("\n");

  const comorbiditesLines = comorbidites
    .filter((c) => c.libelle)
    .map((c) => `- ${c.libelle}`)
    .join("\n");

  const aiPrompt = `Tu rédiges une lettre de liaison médicamenteuse de sortie d'hospitalisation conforme aux recommandations HAS, à destination du médecin traitant et du pharmacien d'officine.

PATIENT : ${p?.nom?.toUpperCase() ?? ""} ${p?.prenom ?? ""}${age !== null ? `, ${age} ans` : ""}${p?.sexe ? `, ${p.sexe}` : ""}
SÉJOUR : du ${ep.date_entree} au ${ep.date_sortie ?? "(en cours)"}, service ${ep.service ?? "non précisé"}
MOTIF : ${ep.motif ?? "non précisé"}

ALLERGIES CONNUES :
${allergiesLines || "(aucune renseignée)"}

COMORBIDITÉS ACTIVES :
${comorbiditesLines || "(aucune renseignée)"}

TRAITEMENT HABITUEL (avant hospitalisation) :
${habituelLines || "(aucun)"}

ORDONNANCE DE SORTIE :
${sortieLines || "(aucun)"}

Produis une lettre HTML structurée (utilise <h2>, <p>, <ul>) avec :
1. Identification patient et séjour
2. Synthèse des modifications thérapeutiques (introductions, arrêts, modifications, traitements poursuivis)
3. Ordonnance de sortie complète
4. Recommandations pharmaceutiques (surveillance, interactions, observance) — personnalisées en fonction des allergies et comorbidités listées
5. Formule de politesse

Pas de markdown, uniquement HTML simple. Pas de <html>/<body>, juste le contenu.`;

  const { runAITask } = await import("@/lib/ai/runAITask.server");
  const result = await runAITask("discharge_letter", {
    prompt: aiPrompt,
    fallback: {
      systemPrompt:
        "Tu es un pharmacien hospitalier expert en conciliation médicamenteuse. Tu rédiges des lettres de liaison de sortie HAS-compliant, claires, professionnelles, en HTML simple.",
      providerKind: "lovable",
      model: "google/gemini-2.5-flash",
    },
  });

  const letterHtml = result.text;
  const letterText = letterHtml.replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n").trim();

  // Determine version
  const { data: versions } = await (supabase as any)
    .from("discharge_letters")
    .select("version")
    .eq("episode_id", ep.id)
    .order("version", { ascending: false })
    .limit(1);
  const nextVersion = ((versions ?? [])[0]?.version ?? 0) + 1;

  const { data: inserted, error: insErr } = await (supabase as any)
    .from("discharge_letters")
    .insert({
      episode_id: ep.id,
      patient_id: ep.patient_id,
      organization_id: orgId,
      version: nextVersion,
      parent_letter_id: args.parentLetterId,
      comparison_json: {
        habituel: habituels,
        sortie,
        allergies,
        comorbidites,
        generated_at: new Date().toISOString(),
        model: result.modelId,
      },
      letter_html: letterHtml,
      letter_text: letterText,
      recipient_medecin_nom: args.recipients.medecinNom,
      recipient_medecin_mssante: args.recipients.medecinMss,
      recipient_pharmacien_nom: args.recipients.pharmaNom,
      recipient_pharmacien_mssante: args.recipients.pharmaMss,
      status: "brouillon",
      created_by: args.userId,
    })
    .select("id")
    .single();
  if (insErr) throw new Error(insErr.message);

  // Close parent if any
  if (args.parentLetterId) {
    await (supabase as any)
      .from("discharge_letters")
      .update({ status: "clos" })
      .eq("id", args.parentLetterId);
  }

  await (supabase as any)
    .from("episodes")
    .update({ discharge_conciliation_completed_at: new Date().toISOString() })
    .eq("id", ep.id);

  return { id: inserted.id, letterHtml };
}

export const generateDischargeLetter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => GenerateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    return buildAndInsertLetter(supabase, {
      episodeId: data.episodeId,
      userId,
      recipients: {
        medecinNom: data.recipientMedecinNom ?? null,
        medecinMss: data.recipientMedecinMssante ?? null,
        pharmaNom: data.recipientPharmacienNom ?? null,
        pharmaMss: data.recipientPharmacienMssante ?? null,
      },
      parentLetterId: data.parentLetterId ?? null,
    });
  });

export const regenerateDischargeLetter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ letterId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: current, error } = await (supabase as any)
      .from("discharge_letters")
      .select("episode_id, recipient_medecin_nom, recipient_medecin_mssante, recipient_pharmacien_nom, recipient_pharmacien_mssante")
      .eq("id", data.letterId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!current) throw new Error("Lettre introuvable");
    return buildAndInsertLetter(supabase, {
      episodeId: current.episode_id,
      userId,
      recipients: {
        medecinNom: current.recipient_medecin_nom,
        medecinMss: current.recipient_medecin_mssante,
        pharmaNom: current.recipient_pharmacien_nom,
        pharmaMss: current.recipient_pharmacien_mssante,
      },
      parentLetterId: data.letterId,
    });
  });

export const listDischargeLetters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ episodeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("discharge_letters")
      .select(
        "id, status, version, parent_letter_id, recipient_medecin_nom, recipient_medecin_mssante, recipient_pharmacien_nom, recipient_pharmacien_mssante, created_at, sent_at, validated_at, delivery_channel, delivery_log, letter_html",
      )
      .eq("episode_id", data.episodeId)
      .order("version", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const updateDischargeLetterContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      letterId: z.string().uuid(),
      letterHtml: z.string().min(1).max(200000),
      recipientMedecinNom: z.string().max(200).optional().nullable(),
      recipientMedecinMssante: z.string().max(200).optional().nullable(),
      recipientPharmacienNom: z.string().max(200).optional().nullable(),
      recipientPharmacienMssante: z.string().max(200).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: cur } = await (supabase as any)
      .from("discharge_letters")
      .select("status")
      .eq("id", data.letterId)
      .maybeSingle();
    if (!cur) throw new Error("Lettre introuvable");
    if (cur.status !== "brouillon")
      throw new Error("Seules les lettres en brouillon peuvent être modifiées");
    const letterText = data.letterHtml.replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n").trim();
    const { error } = await (supabase as any)
      .from("discharge_letters")
      .update({
        letter_html: data.letterHtml,
        letter_text: letterText,
        recipient_medecin_nom: data.recipientMedecinNom ?? null,
        recipient_medecin_mssante: data.recipientMedecinMssante ?? null,
        recipient_pharmacien_nom: data.recipientPharmacienNom ?? null,
        recipient_pharmacien_mssante: data.recipientPharmacienMssante ?? null,
      })
      .eq("id", data.letterId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const validateDischargeLetter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ letterId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await (supabase as any)
      .from("discharge_letters")
      .update({
        status: "prete",
        validated_by: userId,
        validated_at: new Date().toISOString(),
      })
      .eq("id", data.letterId)
      .eq("status", "brouillon");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendDischargeLetterMSSante = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ letterId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: cur, error: e1 } = await (supabase as any)
      .from("discharge_letters")
      .select("status, recipient_medecin_mssante, recipient_pharmacien_mssante, delivery_log")
      .eq("id", data.letterId)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!cur) throw new Error("Lettre introuvable");
    if (cur.status !== "prete")
      throw new Error("La lettre doit être validée (statut « prête ») avant envoi");
    const recipients = [cur.recipient_medecin_mssante, cur.recipient_pharmacien_mssante].filter(
      (x): x is string => typeof x === "string" && x.length > 0,
    );
    if (recipients.length === 0)
      throw new Error("Aucune adresse MSSanté renseignée");

    const newEntries = recipients.map((r) => ({
      at: new Date().toISOString(),
      by: userId,
      channel: "mssante",
      recipient: r,
      status: "simule",
      message: "Envoi MSSanté simulé (intégration ANS hors v2)",
    }));
    const log = Array.isArray(cur.delivery_log) ? cur.delivery_log : [];
    const { error: e2 } = await (supabase as any)
      .from("discharge_letters")
      .update({
        status: "envoyee",
        sent_at: new Date().toISOString(),
        sent_by: userId,
        delivery_channel: "mssante",
        delivery_log: [...log, ...newEntries],
      })
      .eq("id", data.letterId);
    if (e2) throw new Error(e2.message);
    return { ok: true, recipients: recipients.length };
  });

export const exportDischargeLetterPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ letterId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await (supabase as any)
      .from("discharge_letters")
      .select(
        "letter_html, letter_text, version, created_at, recipient_medecin_nom, recipient_medecin_mssante, recipient_pharmacien_nom, recipient_pharmacien_mssante, patients(nom, prenom, date_naissance), episodes(date_entree, date_sortie, service)",
      )
      .eq("id", data.letterId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Lettre introuvable");

    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    let page = pdf.addPage([595, 842]);
    let y = 800;
    const margin = 45;
    const lineH = 13;

    const sanitize = (t: string) =>
      t
        .replace(/\u2019/g, "'")
        .replace(/[\u2013\u2014]/g, "-")
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[^\x00-\xff]/g, "?");

    const newPageIfNeeded = (need: number) => {
      if (y - need < 50) { page = pdf.addPage([595, 842]); y = 800; }
    };
    const writeLine = (text: string, o: { font?: typeof font; size?: number; color?: ReturnType<typeof rgb> } = {}) => {
      const f = o.font ?? font;
      const size = o.size ?? 10;
      const maxW = 505;
      const safe = sanitize(text);
      const words = safe.split(" ");
      let line = "";
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        if (f.widthOfTextAtSize(test, size) > maxW) {
          newPageIfNeeded(lineH);
          page.drawText(line, { x: margin, y, size, font: f, color: o.color ?? rgb(0, 0, 0) });
          y -= lineH;
          line = w;
        } else line = test;
      }
      if (line) {
        newPageIfNeeded(lineH);
        page.drawText(line, { x: margin, y, size, font: f, color: o.color ?? rgb(0, 0, 0) });
        y -= lineH;
      }
    };

    const patient = row.patients as { nom: string; prenom: string; date_naissance: string | null } | null;
    const ep = row.episodes as { date_entree: string; date_sortie: string | null; service: string | null } | null;
    writeLine("LETTRE DE LIAISON MÉDICAMENTEUSE DE SORTIE", { font: bold, size: 14 });
    writeLine(`Version ${row.version} — édité le ${new Date().toLocaleDateString("fr-FR")}`, {
      size: 9,
      color: rgb(0.4, 0.4, 0.4),
    });
    y -= 6;
    if (patient) {
      writeLine(`${patient.nom?.toUpperCase() ?? ""} ${patient.prenom ?? ""}`, { font: bold, size: 12 });
      if (patient.date_naissance)
        writeLine(`Né(e) le ${new Date(patient.date_naissance).toLocaleDateString("fr-FR")}`, { size: 9 });
    }
    if (ep) {
      writeLine(
        `Séjour du ${ep.date_entree}${ep.date_sortie ? ` au ${ep.date_sortie}` : " (en cours)"}${ep.service ? ` — ${ep.service}` : ""}`,
        { size: 9, color: rgb(0.3, 0.3, 0.3) },
      );
    }
    y -= 6;
    if (row.recipient_medecin_nom || row.recipient_medecin_mssante) {
      writeLine(
        `Destinataire médecin : ${row.recipient_medecin_nom ?? ""}${row.recipient_medecin_mssante ? ` <${row.recipient_medecin_mssante}>` : ""}`,
        { size: 9 },
      );
    }
    if (row.recipient_pharmacien_nom || row.recipient_pharmacien_mssante) {
      writeLine(
        `Destinataire pharmacien : ${row.recipient_pharmacien_nom ?? ""}${row.recipient_pharmacien_mssante ? ` <${row.recipient_pharmacien_mssante}>` : ""}`,
        { size: 9 },
      );
    }
    y -= 8;

    // Render letter content paragraph by paragraph from HTML
    const raw = (row.letter_html as string | null) ?? row.letter_text ?? "";
    const blocks = raw
      .replace(/<\/?(h[1-6])>/gi, "\n§§\n")
      .replace(/<li[^>]*>/gi, "• ")
      .replace(/<\/li>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .split(/\n/)
      .map((s) => s.trim());
    let nextBold = false;
    for (const block of blocks) {
      if (block === "§§") { nextBold = true; y -= 4; continue; }
      if (!block) { y -= 4; continue; }
      writeLine(block, nextBold ? { font: bold, size: 11, color: rgb(0.12, 0.22, 0.55) } : {});
      nextBold = false;
    }

    const bytes = await pdf.save();
    const b64 = Buffer.from(bytes).toString("base64");
    const filename = `lettre-liaison-v${row.version}-${new Date(row.created_at as string).toISOString().slice(0, 10)}.pdf`;
    return { base64: b64, filename };
  });

// Backward compat
export const updateDischargeLetterStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      letterId: z.string().uuid(),
      status: z.enum(["brouillon", "prete", "envoyee"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: { status: string; sent_at?: string } = { status: data.status };
    if (data.status === "envoyee") patch.sent_at = new Date().toISOString();
    const { error } = await supabase.from("discharge_letters").update(patch).eq("id", data.letterId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
