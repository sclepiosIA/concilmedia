// Server-only normalisation cascade BDPM.
// Renvoie CIS + DCI + ATC pour une dénomination libre.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normDci } from "@/lib/conciliation/normalize";

export type BdpmNormResult = {
  input: string;
  cis: number | null;
  dci: string | null;
  code_atc: string | null;
  forme: string | null;
  confidence: number; // 0..1
  source: "bdpm_exact" | "bdpm_substance" | "bdpm_trgm" | "legacy" | "none";
};

function clean(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

async function fetchAtcAndDci(cis: number): Promise<{ atc: string | null; dci: string | null; forme: string | null }> {
  const [{ data: spec }, { data: atc }, { data: compo }] = await Promise.all([
    supabaseAdmin.from("bdpm_specialites").select("forme").eq("cis", cis).maybeSingle(),
    supabaseAdmin.from("bdpm_atc").select("code_atc").eq("cis", cis).maybeSingle(),
    supabaseAdmin
      .from("bdpm_compositions")
      .select("denomination_substance, nature_composant")
      .eq("cis", cis)
      .limit(5),
  ]);
  const dci = (compo ?? [])
    .filter((c) => !c.nature_composant || /SA/i.test(c.nature_composant)) // Substance Active uniquement si renseigné
    .map((c) => c.denomination_substance)
    .filter((s): s is string => !!s)
    .join(" + ") || null;
  return {
    atc: (atc?.code_atc as string | null) ?? null,
    dci,
    forme: (spec?.forme as string | null) ?? null,
  };
}

export async function normalizeDrugBdpm(input: string): Promise<BdpmNormResult> {
  const raw = (input ?? "").trim();
  if (!raw) {
    return { input: raw, cis: null, dci: null, code_atc: null, forme: null, confidence: 0, source: "none" };
  }
  const q = clean(raw);

  // 1) Match exact dénomination (commence par)
  const escaped = `${q.replace(/[%_]/g, "\\$&")}%`;
  const { data: exact } = await supabaseAdmin
    .from("bdpm_specialites")
    .select("cis, denomination")
    .ilike("denomination", escaped)
    .limit(1);
  if (exact && exact.length > 0) {
    const { atc, dci, forme } = await fetchAtcAndDci(exact[0].cis as number);
    return {
      input: raw,
      cis: exact[0].cis as number,
      dci,
      code_atc: atc,
      forme,
      confidence: 0.95,
      source: "bdpm_exact",
    };
  }

  // 2) Match substance (l'entrée est déjà une DCI)
  const { data: subst } = await supabaseAdmin
    .from("bdpm_compositions")
    .select("cis, denomination_substance")
    .ilike("denomination_substance", `${q}%`)
    .limit(1);
  if (subst && subst.length > 0) {
    const { atc, dci, forme } = await fetchAtcAndDci(subst[0].cis as number);
    return {
      input: raw,
      cis: subst[0].cis as number,
      dci: dci ?? subst[0].denomination_substance ?? null,
      code_atc: atc,
      forme,
      confidence: 0.85,
      source: "bdpm_substance",
    };
  }

  // 3) Trigram (contient)
  const pattern = `%${q.split(/\s+/)[0]}%`;
  const { data: fuzzy } = await supabaseAdmin
    .from("bdpm_specialites")
    .select("cis, denomination")
    .ilike("denomination", pattern)
    .limit(1);
  if (fuzzy && fuzzy.length > 0) {
    const { atc, dci, forme } = await fetchAtcAndDci(fuzzy[0].cis as number);
    return {
      input: raw,
      cis: fuzzy[0].cis as number,
      dci,
      code_atc: atc,
      forme,
      confidence: 0.6,
      source: "bdpm_trgm",
    };
  }

  // 4) Legacy
  const legacy = normDci(raw);
  return {
    input: raw,
    cis: null,
    dci: legacy || null,
    code_atc: null,
    forme: null,
    confidence: legacy ? 0.3 : 0,
    source: legacy ? "legacy" : "none",
  };
}
