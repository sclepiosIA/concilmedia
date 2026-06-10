// Backfill BDPM : enrichit les lignes traitements_habituels et
// prescriptions_hospitalieres existantes avec cis + code_atc via normalizeDrugBdpm.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Accès refusé : rôle admin requis");
}

export const backfillBdpmEnrichment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { normalizeDrugBdpm } = await import("@/lib/conciliation/normalizeBdpm.server");

    const summary = { traitements: { scanned: 0, updated: 0 }, prescriptions: { scanned: 0, updated: 0 } };

    // 1) traitements_habituels
    const { data: trts } = await supabaseAdmin
      .from("traitements_habituels")
      .select("id, dci, nom_commercial, cis, code_atc")
      .or("cis.is.null,code_atc.is.null")
      .limit(2000);
    for (const t of trts ?? []) {
      summary.traitements.scanned++;
      const q = (t.nom_commercial as string | null) || (t.dci as string | null) || "";
      if (!q) continue;
      const n = await normalizeDrugBdpm(q);
      if (!n.cis && !n.code_atc) continue;
      const patch: Record<string, unknown> = {};
      if (!t.cis && n.cis) patch.cis = n.cis;
      if (!t.code_atc && n.code_atc) patch.code_atc = n.code_atc;
      if (Object.keys(patch).length === 0) continue;
      const { error } = await supabaseAdmin
        .from("traitements_habituels")
        .update(patch as never)
        .eq("id", t.id);
      if (!error) summary.traitements.updated++;
    }

    // 2) prescriptions_hospitalieres
    const { data: rxs } = await supabaseAdmin
      .from("prescriptions_hospitalieres")
      .select("id, medicament, nom_commercial, cis, code_atc")
      .or("cis.is.null,code_atc.is.null")
      .limit(2000);
    for (const r of rxs ?? []) {
      summary.prescriptions.scanned++;
      const q = (r.nom_commercial as string | null) || (r.medicament as string | null) || "";
      if (!q) continue;
      const n = await normalizeDrugBdpm(q);
      if (!n.cis && !n.code_atc) continue;
      const patch: Record<string, unknown> = {};
      if (!r.cis && n.cis) patch.cis = n.cis;
      if (!r.code_atc && n.code_atc) patch.code_atc = n.code_atc;
      if (Object.keys(patch).length === 0) continue;
      const { error } = await supabaseAdmin
        .from("prescriptions_hospitalieres")
        .update(patch as never)
        .eq("id", r.id);
      if (!error) summary.prescriptions.updated++;
    }

    return summary;
  });
