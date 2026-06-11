// Piste #10 v1 — Interopérabilité DMP / HMD (Historique de Médicaments Délivrés)
// L'accès réel DMP nécessite carte CPS + référencement ANS — non disponible en sandbox.
// v1 = (a) génération d'un HMD simulé à partir des traitements habituels actuels du patient,
//      (b) import manuel CSV/JSON pour les sites disposant d'un extrait DMP,
//      (c) rapprochement automatique avec les traitements habituels et propositions d'ajout.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface HmdLine {
  date_delivrance: string; // ISO yyyy-mm-dd
  dci: string;
  nom_commercial?: string | null;
  dosage?: string | null;
  forme?: string | null;
  quantite?: string | null;
  prescripteur?: string | null;
  pharmacie?: string | null;
  cip13?: string | null;
}

export interface HmdReconciliationItem {
  dci: string;
  derniere_delivrance: string;
  nb_delivrances_12m: number;
  present_habituels: boolean;
  proposition: "deja_present" | "a_ajouter" | "a_verifier";
  notes?: string;
}

function norm(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function reconcile(lines: HmdLine[], habituels: Array<{ dci: string | null; nom_commercial: string | null }>): {
  items: HmdReconciliationItem[];
  summary: { lignes_hmd: number; molecules_distinctes: number; a_ajouter: number; deja_present: number };
} {
  const byDci = new Map<string, HmdLine[]>();
  for (const l of lines) {
    const k = norm(l.dci);
    if (!k) continue;
    if (!byDci.has(k)) byDci.set(k, []);
    byDci.get(k)!.push(l);
  }
  const habSet = new Set(habituels.map((h) => norm(h.dci ?? h.nom_commercial ?? "")).filter(Boolean));

  const now = Date.now();
  const items: HmdReconciliationItem[] = [];
  for (const [k, ls] of byDci.entries()) {
    ls.sort((a, b) => (b.date_delivrance ?? "").localeCompare(a.date_delivrance ?? ""));
    const last = ls[0];
    const oneYearAgo = now - 365 * 86400000;
    const nb = ls.filter((l) => new Date(l.date_delivrance).getTime() >= oneYearAgo).length;
    const present = habSet.has(k);
    let proposition: HmdReconciliationItem["proposition"];
    if (present) proposition = "deja_present";
    else if (nb >= 3) proposition = "a_ajouter";
    else proposition = "a_verifier";
    items.push({
      dci: last.dci,
      derniere_delivrance: last.date_delivrance,
      nb_delivrances_12m: nb,
      present_habituels: present,
      proposition,
      notes:
        nb >= 6
          ? "Traitement chronique probable"
          : nb >= 3
          ? "Délivrances régulières"
          : "Délivrance ponctuelle",
    });
  }
  items.sort((a, b) => (a.proposition === "a_ajouter" ? -1 : 1) - (b.proposition === "a_ajouter" ? -1 : 1));
  return {
    items,
    summary: {
      lignes_hmd: lines.length,
      molecules_distinctes: byDci.size,
      a_ajouter: items.filter((i) => i.proposition === "a_ajouter").length,
      deja_present: items.filter((i) => i.proposition === "deja_present").length,
    },
  };
}

export const simulateHmdImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ patientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: pat } = await supabase
      .from("patients")
      .select("id, organization_id")
      .eq("id", data.patientId)
      .maybeSingle();
    if (!pat) throw new Error("Patient introuvable");

    const { data: habituels } = await supabase
      .from("traitements_habituels")
      .select("dci, nom_commercial, dosage, posologie_texte, voie_administration")
      .eq("patient_id", data.patientId)
      .eq("actif", true);

    // Génère un HMD plausible : 4 à 12 délivrances sur les 12 derniers mois
    // pour chaque traitement habituel + 1 ou 2 délivrances ponctuelles non listées
    // (pour illustrer le rapprochement).
    const today = new Date();
    const lines: HmdLine[] = [];
    for (const h of habituels ?? []) {
      const dci = h.dci ?? h.nom_commercial ?? "";
      if (!dci) continue;
      const nb = 8 + Math.floor(Math.random() * 4); // ~ délivrance mensuelle
      for (let i = 0; i < nb; i++) {
        const d = new Date(today);
        d.setMonth(d.getMonth() - i);
        lines.push({
          date_delivrance: d.toISOString().slice(0, 10),
          dci,
          nom_commercial: h.nom_commercial ?? undefined,
          dosage: h.dosage ?? undefined,
          forme: "comprimé",
          quantite: "1 boîte de 30",
          prescripteur: "Dr. Médecin Traitant",
          pharmacie: "Pharmacie Centrale",
        });
      }
    }
    // 1 ou 2 délivrances ponctuelles fictives (ex. AINS, ATB) si peu de traitements
    const ponctuels = [
      { dci: "Amoxicilline", dosage: "1 g", forme: "comprimé" },
      { dci: "Ibuprofène", dosage: "400 mg", forme: "comprimé" },
    ];
    for (const p of ponctuels) {
      const d = new Date(today);
      d.setMonth(d.getMonth() - Math.floor(Math.random() * 6));
      lines.push({
        date_delivrance: d.toISOString().slice(0, 10),
        dci: p.dci,
        dosage: p.dosage,
        forme: p.forme,
        quantite: "1 boîte",
        prescripteur: "Dr. Médecin Traitant",
        pharmacie: "Pharmacie Centrale",
      });
    }

    const periodStart = new Date(today);
    periodStart.setFullYear(periodStart.getFullYear() - 1);

    const recon = reconcile(lines, habituels ?? []);

    const { data: inserted, error } = await supabase
      .from("dmp_hmd_imports")
      .insert({
        patient_id: data.patientId,
        organization_id: pat.organization_id,
        source: "dmp_simule",
        imported_by: userId,
        period_start: periodStart.toISOString().slice(0, 10),
        period_end: today.toISOString().slice(0, 10),
        lines,
        reconciliation: recon,
        status: "a_rapprocher",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id, ...recon };
  });

const ImportManualInput = z.object({
  patientId: z.string().uuid(),
  source: z.enum(["csv_manuel", "json_manuel"]),
  lines: z
    .array(
      z.object({
        date_delivrance: z.string().min(8),
        dci: z.string().min(1).max(255),
        nom_commercial: z.string().max(255).optional().nullable(),
        dosage: z.string().max(100).optional().nullable(),
        forme: z.string().max(100).optional().nullable(),
        quantite: z.string().max(100).optional().nullable(),
        prescripteur: z.string().max(255).optional().nullable(),
        pharmacie: z.string().max(255).optional().nullable(),
        cip13: z.string().max(20).optional().nullable(),
      }),
    )
    .min(1)
    .max(2000),
});

export const importHmdManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ImportManualInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: pat } = await supabase
      .from("patients")
      .select("id, organization_id")
      .eq("id", data.patientId)
      .maybeSingle();
    if (!pat) throw new Error("Patient introuvable");
    const { data: habituels } = await supabase
      .from("traitements_habituels")
      .select("dci, nom_commercial")
      .eq("patient_id", data.patientId)
      .eq("actif", true);

    const dates = data.lines.map((l) => l.date_delivrance).sort();
    const recon = reconcile(data.lines as HmdLine[], habituels ?? []);
    const { data: inserted, error } = await supabase
      .from("dmp_hmd_imports")
      .insert({
        patient_id: data.patientId,
        organization_id: pat.organization_id,
        source: data.source,
        imported_by: userId,
        period_start: dates[0]?.slice(0, 10) ?? null,
        period_end: dates[dates.length - 1]?.slice(0, 10) ?? null,
        lines: data.lines,
        reconciliation: recon,
        status: "a_rapprocher",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id, ...recon };
  });

export const listHmdImports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ patientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("dmp_hmd_imports")
      .select("id, source, imported_at, period_start, period_end, lines, reconciliation, status, notes")
      .eq("patient_id", data.patientId)
      .order("imported_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const addHmdToTraitementsHabituels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      importId: z.string().uuid(),
      dcis: z.array(z.string().min(1).max(255)).min(1).max(50),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: imp, error: e1 } = await supabase
      .from("dmp_hmd_imports")
      .select("patient_id, lines")
      .eq("id", data.importId)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!imp) throw new Error("Import HMD introuvable");

    const lines = (imp.lines as HmdLine[]) ?? [];
    const wanted = new Set(data.dcis.map((d) => norm(d)));
    // Pour chaque DCI demandée, prendre la délivrance la plus récente
    const byDci = new Map<string, HmdLine>();
    for (const l of lines) {
      const k = norm(l.dci);
      if (!wanted.has(k)) continue;
      const cur = byDci.get(k);
      if (!cur || (l.date_delivrance ?? "") > (cur.date_delivrance ?? "")) byDci.set(k, l);
    }

    const inserts = Array.from(byDci.values()).map((l) => ({
      patient_id: imp.patient_id,
      dci: l.dci,
      nom_commercial: l.nom_commercial ?? null,
      dosage: l.dosage ?? null,
      voie_administration: null,
      actif: true,
      source: "DMP/HMD",
      indication: "Importé depuis HMD",
    }));
    if (inserts.length === 0) return { inserted: 0 };

    const { error: e2 } = await supabase.from("traitements_habituels").insert(inserts);
    if (e2) throw new Error(e2.message);

    await supabase
      .from("dmp_hmd_imports")
      .update({ status: "rapproche" })
      .eq("id", data.importId);

    return { inserted: inserts.length };
  });
