// Server-only. Pour une DCI/nom commercial extrait par OCR, retourne le statut de match BDPM
// + jusqu'à 3 suggestions (DCI canonique, CIS, code ATC, score).
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type BdpmMatchStatus = "exact" | "fuzzy" | "inconnu";

export interface BdpmSuggestion {
  dci: string;
  nom: string;
  cis: number;
  code_atc: string | null;
  score: number; // 0..1
}

export interface BdpmCrossCheck {
  match_status: BdpmMatchStatus;
  bdpm_confidence: number; // 0..1
  cis: number | null;
  code_atc: string | null;
  canonical_dci: string | null;
  suggestions: BdpmSuggestion[];
}

function clean(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

async function fetchDciAtc(cis: number): Promise<{ dci: string | null; code_atc: string | null }> {
  const [{ data: atc }, { data: compo }] = await Promise.all([
    supabaseAdmin.from("bdpm_atc").select("code_atc").eq("cis", cis).maybeSingle(),
    supabaseAdmin
      .from("bdpm_compositions")
      .select("denomination_substance, nature_composant")
      .eq("cis", cis)
      .limit(5),
  ]);
  const dci = (compo ?? [])
    .filter((c) => !c.nature_composant || /SA/i.test(c.nature_composant))
    .map((c) => c.denomination_substance)
    .filter((s): s is string => !!s)
    .join(" + ") || null;
  return { dci, code_atc: (atc?.code_atc as string | null) ?? null };
}

export async function crossCheckBdpm(query: string): Promise<BdpmCrossCheck> {
  const raw = (query ?? "").trim();
  if (!raw) {
    return { match_status: "inconnu", bdpm_confidence: 0, cis: null, code_atc: null, canonical_dci: null, suggestions: [] };
  }
  const q = clean(raw);

  // 1) Match exact (commence par) sur spécialité
  const escaped = `${q.replace(/[%_]/g, "\\$&")}%`;
  const { data: exact } = await supabaseAdmin
    .from("bdpm_specialites")
    .select("cis, denomination")
    .ilike("denomination", escaped)
    .limit(1);

  if (exact && exact.length > 0) {
    const cis = exact[0].cis as number;
    const meta = await fetchDciAtc(cis);
    return {
      match_status: "exact",
      bdpm_confidence: 0.95,
      cis,
      code_atc: meta.code_atc,
      canonical_dci: meta.dci,
      suggestions: [{ dci: meta.dci ?? exact[0].denomination as string, nom: exact[0].denomination as string, cis, code_atc: meta.code_atc, score: 0.95 }],
    };
  }

  // 2) Match substance exact
  const { data: subst } = await supabaseAdmin
    .from("bdpm_compositions")
    .select("cis, denomination_substance")
    .ilike("denomination_substance", `${q}%`)
    .limit(1);
  if (subst && subst.length > 0) {
    const cis = subst[0].cis as number;
    const meta = await fetchDciAtc(cis);
    return {
      match_status: "exact",
      bdpm_confidence: 0.9,
      cis,
      code_atc: meta.code_atc,
      canonical_dci: meta.dci ?? (subst[0].denomination_substance as string),
      suggestions: [{ dci: meta.dci ?? subst[0].denomination_substance as string, nom: subst[0].denomination_substance as string, cis, code_atc: meta.code_atc, score: 0.9 }],
    };
  }

  // 3) Fuzzy : top-3 par ilike contient sur le premier mot
  const firstWord = q.split(/\s+/)[0];
  const pattern = `%${firstWord}%`;
  const { data: fuzzy } = await supabaseAdmin
    .from("bdpm_specialites")
    .select("cis, denomination")
    .ilike("denomination", pattern)
    .limit(3);
  if (fuzzy && fuzzy.length > 0) {
    const sugg: BdpmSuggestion[] = [];
    for (const row of fuzzy) {
      const meta = await fetchDciAtc(row.cis as number);
      sugg.push({
        dci: meta.dci ?? (row.denomination as string),
        nom: row.denomination as string,
        cis: row.cis as number,
        code_atc: meta.code_atc,
        score: 0.55,
      });
    }
    const top = sugg[0];
    return {
      match_status: "fuzzy",
      bdpm_confidence: 0.55,
      cis: top.cis,
      code_atc: top.code_atc,
      canonical_dci: top.dci,
      suggestions: sugg,
    };
  }

  return { match_status: "inconnu", bdpm_confidence: 0, cis: null, code_atc: null, canonical_dci: null, suggestions: [] };
}
