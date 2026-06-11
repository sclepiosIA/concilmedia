// Recherche les tensions/ruptures d'approvisionnement déclarées (table
// drug_shortages, alimentée par cron ANSM) qui concernent les médicaments
// du dossier. Fallback : etat_commercialisation BDPM.

import type { SupabaseClient } from "@supabase/supabase-js";

export type ShortageFlag = {
  medicament: string;
  statut: "tension" | "rupture" | "arret" | "remise_a_disposition" | "non_commercialise";
  date_debut?: string | null;
  date_fin_prevue?: string | null;
  raison?: string | null;
  alternative?: string | null;
  source_url?: string | null;
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export async function lookupShortagesForDossier(
  supabase: SupabaseClient,
  medicaments: Array<Record<string, unknown>>,
): Promise<ShortageFlag[]> {
  const labels = new Map<string, string>(); // normalized -> original
  for (const m of medicaments) {
    const label =
      (m.dci as string | null) ||
      (m.medicament as string | null) ||
      (m.nom_commercial as string | null) ||
      "";
    if (!label) continue;
    const n = normalize(label).split(" ")[0];
    if (n.length >= 3) labels.set(n, label);
  }
  if (labels.size === 0) return [];

  const out: ShortageFlag[] = [];
  const tokens = Array.from(labels.keys());

  // 1) Tensions/ruptures déclarées ANSM
  try {
    const orFilter = tokens.map((t) => `denomination.ilike.%${t}%`).join(",");
    const { data } = await supabase
      .from("drug_shortages")
      .select("cis, denomination, statut, date_debut, date_fin_prevue, raison, alternative, source_url")
      .or(orFilter)
      .in("statut", ["tension", "rupture", "arret"])
      .limit(50);
    for (const row of data ?? []) {
      const denom = (row as { denomination: string }).denomination ?? "";
      const matchKey = tokens.find((t) => normalize(denom).includes(t));
      if (!matchKey) continue;
      out.push({
        medicament: labels.get(matchKey) ?? denom,
        statut: (row as { statut: ShortageFlag["statut"] }).statut,
        date_debut: (row as { date_debut: string | null }).date_debut,
        date_fin_prevue: (row as { date_fin_prevue: string | null }).date_fin_prevue,
        raison: (row as { raison: string | null }).raison,
        alternative: (row as { alternative: string | null }).alternative,
        source_url: (row as { source_url: string | null }).source_url,
      });
    }
  } catch (e) {
    console.warn("[shortages] drug_shortages lookup failed:", e);
  }

  // 2) Fallback BDPM : etat_commercialisation ≠ "Commercialisée"
  if (out.length < tokens.length) {
    try {
      const remaining = tokens.filter((t) => !out.some((o) => normalize(o.medicament).includes(t)));
      for (const t of remaining.slice(0, 10)) {
        const { data } = await supabase
          .from("bdpm_specialites")
          .select("denomination, etat_commercialisation")
          .ilike("denomination", `%${t}%`)
          .limit(1);
        const row = data?.[0];
        if (!row) continue;
        const etat = (row.etat_commercialisation ?? "").toString().toLowerCase();
        if (etat && !etat.includes("commerc")) {
          out.push({
            medicament: labels.get(t) ?? row.denomination,
            statut: etat.includes("arret") ? "arret" : "non_commercialise",
            raison: row.etat_commercialisation,
          });
        }
      }
    } catch (e) {
      console.warn("[shortages] BDPM fallback failed:", e);
    }
  }

  return out;
}
