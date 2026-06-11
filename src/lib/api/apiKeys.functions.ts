// Piste #14 v1 — Server functions admin: gestion des clés API
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SCOPES = ["bdpm:read", "analyze:write", "*"] as const;
type Scope = (typeof SCOPES)[number];

type SupabaseLike = { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown }> };
async function assertAdmin(supabase: SupabaseLike, userId: string) {
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!isAdmin) throw new Error("Forbidden: admin role required");
}

export const listApiKeys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("api_keys")
      .select("id, name, key_prefix, scopes, rate_limit_per_minute, status, expires_at, last_used_at, created_at, revoked_at, owner_user_id")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { keys: data ?? [] };
  });

export const createApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { name: string; scopes: Scope[]; rateLimitPerMinute?: number; expiresInDays?: number }) => {
    if (!d?.name || d.name.length < 2 || d.name.length > 100) throw new Error("name 2..100 required");
    if (!Array.isArray(d.scopes) || d.scopes.length === 0) throw new Error("scopes required");
    for (const s of d.scopes) if (!SCOPES.includes(s)) throw new Error(`Unknown scope: ${s}`);
    return d;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { generateApiKey } = await import("@/lib/api/auth.server");
    const { plain, prefix, hash } = generateApiKey();
    const expiresAt = data.expiresInDays
      ? new Date(Date.now() + data.expiresInDays * 86_400_000).toISOString()
      : null;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("api_keys")
      .insert({
        owner_user_id: context.userId,
        name: data.name,
        key_hash: hash,
        key_prefix: prefix,
        scopes: data.scopes,
        rate_limit_per_minute: Math.min(Math.max(data.rateLimitPerMinute ?? 60, 1), 1000),
        expires_at: expiresAt,
      })
      .select("id")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Failed to create key");

    await supabaseAdmin.rpc("append_audit_log", {
      _action: "api_key_create",
      _entity_type: "api_key",
      _entity_id: row.id,
      _payload: { name: data.name, scopes: data.scopes, prefix },
    });

    // Plain key returned ONCE
    return { id: row.id, plain, prefix };
  });

export const revokeApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => {
    if (!d?.id) throw new Error("id required");
    return d;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("api_keys")
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await supabaseAdmin.rpc("append_audit_log", {
      _action: "api_key_revoke",
      _entity_type: "api_key",
      _entity_id: data.id,
      _payload: {},
    });
    return { ok: true };
  });

export const getApiKeyUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { keyId: string }) => {
    if (!d?.keyId) throw new Error("keyId required");
    return d;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: logs, error } = await supabaseAdmin
      .from("api_usage_logs")
      .select("route, method, status_code, latency_ms, created_at")
      .eq("api_key_id", data.keyId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { logs: logs ?? [] };
  });
