// Piste #10 v2 — Analyse adhérence & détection des écarts à partir du HMD.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface AdherenceItem {
  dci: string;
  derniere_delivrance: string | null;
  nb_delivrances: number;
  intervalle_moyen_jours: number | null;
  mpr: number; // 0..1+
  statut: "bonne" | "partielle" | "rupture" | "surconsommation";
}
export interface DiscrepancyItem {
  type: "prescrit_non_delivre" | "delivre_non_declare" | "posologie_divergente";
  dci: string;
  details: string;
  severite: "info" | "warn" | "critique";
}

interface HmdLine {
  date_delivrance: string;
  dci: string;
  nom_commercial?: string | null;
  dosage?: string | null;
  posologie?: string | null;
}

function norm(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

async function logAudit(
  supabase: any,
  patientId: string,
  userId: string | null,
  action: string,
  details: Record<string, unknown> = {},
) {
  await supabase.from("dmp_access_audit").insert({
    patient_id: patientId,
    user_id: userId,
    action,
    details,
  });
}

async function requireConsent(supabase: any, patientId: string): Promise<void> {
  const { data: pat } = await supabase
    .from("patients")
    .select("consentement_dmp")
    .eq("id", patientId)
    .maybeSingle();
  if (!pat?.consentement_dmp) throw new Error("Consentement DMP requis avant toute opération.");
}

export const analyzeHmdAdherence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ patientId: z.string().uuid(), windowMonths: z.number().int().min(1).max(24).default(6) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireConsent(supabase, data.patientId);

    const { data: imports } = await supabase
      .from("dmp_hmd_imports")
      .select("id, lines, imported_at")
      .eq("patient_id", data.patientId)
      .order("imported_at", { ascending: false })
      .limit(1);
    const last = imports?.[0];
    if (!last) throw new Error("Aucun import HMD pour ce patient.");

    const { data: habituels } = await supabase
      .from("traitements_habituels")
      .select("dci, nom_commercial, posologie_texte")
      .eq("patient_id", data.patientId)
      .eq("actif", true);

    const windowMs = data.windowMonths * 30 * 86400000;
    const now = Date.now();
    const lines = ((last.lines as unknown) as HmdLine[]) ?? [];

    const byDci = new Map<string, HmdLine[]>();
    for (const l of lines) {
      const k = norm(l.dci);
      if (!k) continue;
      const t = new Date(l.date_delivrance).getTime();
      if (now - t > windowMs) continue;
      if (!byDci.has(k)) byDci.set(k, []);
      byDci.get(k)!.push(l);
    }

    const items: AdherenceItem[] = [];
    for (const [, ls] of byDci.entries()) {
      ls.sort((a, b) => a.date_delivrance.localeCompare(b.date_delivrance));
      const dates = ls.map((l) => new Date(l.date_delivrance).getTime());
      const last_d = dates[dates.length - 1];
      let intervalles: number[] = [];
      for (let i = 1; i < dates.length; i++) intervalles.push((dates[i] - dates[i - 1]) / 86400000);
      const avg = intervalles.length ? intervalles.reduce((a, b) => a + b, 0) / intervalles.length : null;
      // MPR simplifié : nb délivrances * 30 (boîte mensuelle supposée) / fenêtre en jours
      const days = data.windowMonths * 30;
      const mpr = (ls.length * 30) / days;
      let statut: AdherenceItem["statut"];
      if (mpr >= 1.3) statut = "surconsommation";
      else if (mpr >= 0.8) statut = "bonne";
      else if (mpr >= 0.4) statut = "partielle";
      else statut = "rupture";
      items.push({
        dci: ls[0].dci,
        derniere_delivrance: new Date(last_d).toISOString().slice(0, 10),
        nb_delivrances: ls.length,
        intervalle_moyen_jours: avg ? Math.round(avg) : null,
        mpr: Math.round(mpr * 100) / 100,
        statut,
      });
    }

    // Détection écarts
    const habSet = new Map<string, { dci: string; posologie: string | null }>();
    for (const h of habituels ?? []) {
      const k = norm(h.dci ?? h.nom_commercial ?? "");
      if (k) habSet.set(k, { dci: h.dci ?? h.nom_commercial ?? "", posologie: h.posologie_texte ?? null });
    }
    const discrepancies: DiscrepancyItem[] = [];
    // Prescrit mais jamais délivré sur 90j
    const ninety = 90 * 86400000;
    for (const [k, h] of habSet.entries()) {
      const ls = byDci.get(k);
      const recent = ls?.some((l) => now - new Date(l.date_delivrance).getTime() <= ninety);
      if (!recent) {
        discrepancies.push({
          type: "prescrit_non_delivre",
          dci: h.dci,
          details: "Aucune délivrance sur les 90 derniers jours.",
          severite: "critique",
        });
      }
    }
    // Délivré mais absent des habituels
    for (const [k, ls] of byDci.entries()) {
      if (!habSet.has(k) && ls.length >= 3) {
        discrepancies.push({
          type: "delivre_non_declare",
          dci: ls[0].dci,
          details: `${ls.length} délivrances sur la fenêtre — à ajouter aux traitements habituels.`,
          severite: "warn",
        });
      }
    }

    const summary = {
      molecules_analysees: items.length,
      adhesion_moyenne:
        items.length === 0 ? 0 : Math.round((items.reduce((a, b) => a + b.mpr, 0) / items.length) * 100) / 100,
      ruptures: items.filter((i) => i.statut === "rupture").length,
      surconsommations: items.filter((i) => i.statut === "surconsommation").length,
      ecarts_critiques: discrepancies.filter((d) => d.severite === "critique").length,
    };

    const { data: snap, error } = await supabase
      .from("hmd_adherence_snapshots")
      .insert({
        patient_id: data.patientId,
        import_id: last.id,
        window_months: data.windowMonths,
        items: items as unknown as any,
        discrepancies: discrepancies as unknown as any,
        summary: summary as unknown as any,
        created_by: userId,
      })
      .select("id, computed_at")
      .single();
    if (error) throw new Error(error.message);
    await logAudit(supabase, data.patientId, userId, "analyse_adherence", {
      snapshot_id: snap.id,
      window: data.windowMonths,
    });
    return { id: snap.id, computed_at: snap.computed_at, items, discrepancies, summary };
  });

export const listAdherenceSnapshots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ patientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("hmd_adherence_snapshots")
      .select("id, computed_at, window_months, items, discrepancies, summary")
      .eq("patient_id", data.patientId)
      .order("computed_at", { ascending: false })
      .limit(10);
    if (error) throw new Error(error.message);
    return { snapshots: rows ?? [] };
  });
