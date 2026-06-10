// Piste #9 v1 — Conciliation de sortie
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
        "id, patient_id, date_entree, date_sortie, service, motif, patients(id, nom, prenom, date_naissance, sexe, organization_id)",
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

    return {
      habituel: habRows,
      entree: entreeRows,
      sortie: sortieRows,
      changes,
      patient: ep.patients,
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
});

export const generateDischargeLetter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => GenerateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: epRaw, error: epErr } = await supabase
      .from("episodes")
      .select(
        "id, patient_id, date_entree, date_sortie, service, motif, patients(id, nom, prenom, date_naissance, sexe, organization_id)",
      )
      .eq("id", data.episodeId)
      .maybeSingle();
    if (epErr) throw new Error(epErr.message);
    if (!epRaw) throw new Error("Épisode introuvable");
    const ep = epRaw as unknown as EpisodeJoin;
    const orgId = ep.patients?.organization_id ?? null;

    const { data: habituels } = await supabase
      .from("traitements_habituels")
      .select(
        "dci, nom_commercial, dosage, voie_administration, indication, posologie_texte, posologie_matin, posologie_midi, posologie_soir, posologie_coucher",
      )
      .eq("patient_id", ep.patient_id)
      .eq("actif", true);

    const { data: prescs } = await supabase
      .from("prescriptions_hospitalieres")
      .select("medicament, dosage, posologie, voie_administration, indication, actif, date_fin")
      .eq("episode_id", ep.id);

    const dateSortie = ep.date_sortie ? new Date(ep.date_sortie) : new Date();
    const sortie = (prescs ?? []).filter(
      (p) => p.actif && (!p.date_fin || new Date(p.date_fin) >= dateSortie),
    );

    const p = ep.patients;
    const age = p?.date_naissance
      ? Math.floor((Date.now() - new Date(p.date_naissance).getTime()) / 31557600000)
      : null;

    const habituelLines = (habituels ?? [])
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

    const aiPrompt = `Tu rédiges une lettre de liaison médicamenteuse de sortie d'hospitalisation conforme aux recommandations HAS, à destination du médecin traitant et du pharmacien d'officine.

PATIENT : ${p?.nom?.toUpperCase() ?? ""} ${p?.prenom ?? ""}${age !== null ? `, ${age} ans` : ""}${p?.sexe ? `, ${p.sexe}` : ""}
SÉJOUR : du ${ep.date_entree} au ${ep.date_sortie ?? "(en cours)"}, service ${ep.service ?? "non précisé"}
MOTIF : ${ep.motif ?? "non précisé"}

TRAITEMENT HABITUEL (avant hospitalisation) :
${habituelLines || "(aucun)"}

ORDONNANCE DE SORTIE :
${sortieLines || "(aucun)"}

Produis une lettre HTML structurée (utilise <h2>, <p>, <ul>) avec :
1. Identification patient et séjour
2. Synthèse des modifications thérapeutiques (introductions, arrêts, modifications, traitements poursuivis)
3. Ordonnance de sortie complète
4. Recommandations pharmaceutiques (surveillance, interactions, observance)
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

    const { data: inserted, error: insErr } = await supabase
      .from("discharge_letters")
      .insert({
        episode_id: ep.id,
        patient_id: ep.patient_id,
        organization_id: orgId,
        comparison_json: {
          habituel: habituels ?? [],
          sortie,
          generated_at: new Date().toISOString(),
          model: result.modelId,
        },
        letter_html: letterHtml,
        letter_text: letterText,
        recipient_medecin_nom: data.recipientMedecinNom ?? null,
        recipient_medecin_mssante: data.recipientMedecinMssante ?? null,
        recipient_pharmacien_nom: data.recipientPharmacienNom ?? null,
        recipient_pharmacien_mssante: data.recipientPharmacienMssante ?? null,
        status: "brouillon",
        created_by: userId,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);

    await supabase
      .from("episodes")
      .update({ discharge_conciliation_completed_at: new Date().toISOString() })
      .eq("id", ep.id);

    return { id: inserted.id, letterHtml };
  });

export const listDischargeLetters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ episodeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("discharge_letters")
      .select("id, status, recipient_medecin_nom, recipient_pharmacien_nom, created_at, sent_at, letter_html")
      .eq("episode_id", data.episodeId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

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
