import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Forbidden");
}

export const getShortagesStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("drug_shortages")
      .select("statut, imported_at, source_url")
      .order("imported_at", { ascending: false })
      .limit(1000);
    const list = rows ?? [];
    const lastImport = list[0]?.imported_at ?? null;
    const source = list[0]?.source_url ?? null;
    const total = list.length;
    const byStatus = list.reduce<Record<string, number>>((acc, r) => {
      const k = String(r.statut ?? "unknown");
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});
    return { total, byStatus, lastImport, source };
  });

export const triggerShortagesSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const base =
      process.env.PUBLIC_APP_URL ||
      "https://concilmedia.lovable.app";
    const url = `${base.replace(/\/$/, "")}/api/public/hooks/sync-ansm-shortages`;
    const resp = await fetch(url, { method: "POST" });
    const json = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
    if (!resp.ok) {
      throw new Error(typeof json.error === "string" ? json.error : `HTTP ${resp.status}`);
    }
    return json;
  });
