// Helpers serveur pour le volet médico-économique : recherche du prix BDPM
// pour chaque médicament du dossier et d'un éventuel générique moins cher
// (via la vue v_drug_cheapest_generic).

import type { SupabaseClient } from "@supabase/supabase-js";

export type EconomicsItem = {
  medicament: string;
  prix_unitaire_eur: number | null;
  cout_journalier_eur: number | null;
  generique_propose: { denomination: string; prix_eur: number; economie_eur_unite: number } | null;
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parsePosologieQuotidienne(row: Record<string, unknown>): number {
  const fields = ["posologie_matin", "posologie_midi", "posologie_soir", "posologie_coucher"];
  let total = 0;
  let any = false;
  for (const f of fields) {
    const v = row[f];
    const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v.replace(",", ".")) : NaN;
    if (Number.isFinite(n)) {
      total += n;
      any = true;
    }
  }
  if (!any) {
    const txt = (row.posologie_texte as string | undefined) || (row.posologie as string | undefined) || "";
    const m = /(\d+(?:[.,]\d+)?)\s*(?:cp|gel|comprime|gelule|dose|sachet)?\s*[xX*\/]\s*(\d+)/.exec(txt);
    if (m) return parseFloat(m[1].replace(",", ".")) * parseInt(m[2], 10);
    const single = /(\d+(?:[.,]\d+)?)/.exec(txt);
    if (single) return parseFloat(single[1].replace(",", "."));
    return 1;
  }
  return total;
}

export type EconomicsContext = {
  items: EconomicsItem[];
  cout_journalier_total_eur: number;
  economie_potentielle_eur_jour: number;
};

/**
 * Construit un contexte économique compact pour injection LLM. Best-effort :
 * en cas d'erreur ou de médicament inconnu, renvoie prix null.
 */
export async function buildEconomicsContext(
  supabase: SupabaseClient,
  medicaments: Array<Record<string, unknown>>,
): Promise<EconomicsContext> {
  const items: EconomicsItem[] = [];
  let totalCout = 0;
  let totalEconomie = 0;

  for (const med of medicaments.slice(0, 25)) {
    const label =
      (med.dci as string | null) ||
      (med.medicament as string | null) ||
      (med.nom_commercial as string | null) ||
      "";
    if (!label) continue;
    const search = normalize(label).split(" ")[0];
    if (!search || search.length < 3) {
      items.push({ medicament: label, prix_unitaire_eur: null, cout_journalier_eur: null, generique_propose: null });
      continue;
    }

    try {
      const { data: specs } = await supabase
        .from("bdpm_specialites")
        .select("cis, denomination")
        .ilike("denomination", `%${search}%`)
        .limit(1);
      const cis = specs?.[0]?.cis;
      if (!cis) {
        items.push({ medicament: label, prix_unitaire_eur: null, cout_journalier_eur: null, generique_propose: null });
        continue;
      }
      const { data: pres } = await supabase
        .from("bdpm_presentations")
        .select("prix_eur")
        .eq("cis", cis)
        .not("prix_eur", "is", null)
        .order("prix_eur", { ascending: true })
        .limit(1);
      const prix = pres?.[0]?.prix_eur ?? null;
      const posoJour = parsePosologieQuotidienne(med);
      const coutJour = prix != null ? Number((prix * posoJour).toFixed(2)) : null;

      let generique: EconomicsItem["generique_propose"] = null;
      const { data: cheaper } = await supabase
        .from("v_drug_cheapest_generic")
        .select("denomination_generique, prix_generique, economie_eur")
        .eq("cis", cis)
        .limit(1);
      if (cheaper && cheaper[0]) {
        const c = cheaper[0] as { denomination_generique: string; prix_generique: number; economie_eur: number };
        generique = {
          denomination: c.denomination_generique,
          prix_eur: c.prix_generique,
          economie_eur_unite: Number(c.economie_eur.toFixed(2)),
        };
        totalEconomie += c.economie_eur * posoJour;
      }
      if (coutJour != null) totalCout += coutJour;
      items.push({ medicament: label, prix_unitaire_eur: prix, cout_journalier_eur: coutJour, generique_propose: generique });
    } catch (e) {
      console.warn("[economics] lookup failed for", label, e);
      items.push({ medicament: label, prix_unitaire_eur: null, cout_journalier_eur: null, generique_propose: null });
    }
  }

  return {
    items,
    cout_journalier_total_eur: Number(totalCout.toFixed(2)),
    economie_potentielle_eur_jour: Number(totalEconomie.toFixed(2)),
  };
}
