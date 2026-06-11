// Piste #14 v1 — Authentification clé API pour /api/public/v1/*
import { createHash } from "crypto";

export type ApiKeyContext = {
  keyId: string;
  ownerUserId: string;
  scopes: string[];
};

export function hashApiKey(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

export function generateApiKey(): { plain: string; prefix: string; hash: string } {
  // 32 bytes random base64url
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const raw = Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const plain = `cm_${raw}`;
  const prefix = plain.slice(0, 10);
  const hash = hashApiKey(plain);
  return { plain, prefix, hash };
}

export type AuthResult =
  | { ok: true; ctx: ApiKeyContext }
  | { ok: false; status: number; error: string };

export async function authenticateApiKey(
  request: Request,
  requiredScope: string,
): Promise<AuthResult> {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Missing Bearer token" };
  }
  const plain = auth.slice(7).trim();
  if (!plain) return { ok: false, status: 401, error: "Empty token" };

  const hash = hashApiKey(plain);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: key, error } = await supabaseAdmin
    .from("api_keys")
    .select("id, owner_user_id, scopes, status, expires_at, rate_limit_per_minute")
    .eq("key_hash", hash)
    .maybeSingle();

  if (error || !key) return { ok: false, status: 401, error: "Invalid API key" };
  if (key.status !== "active") return { ok: false, status: 401, error: "Key revoked" };
  if (key.expires_at && new Date(key.expires_at) < new Date()) {
    return { ok: false, status: 401, error: "Key expired" };
  }
  if (!key.scopes.includes(requiredScope) && !key.scopes.includes("*")) {
    return { ok: false, status: 403, error: `Scope ${requiredScope} required` };
  }

  // Rate limit: count usage in last 60s
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await supabaseAdmin
    .from("api_usage_logs")
    .select("id", { count: "exact", head: true })
    .eq("api_key_id", key.id)
    .gte("created_at", since);

  if ((count ?? 0) >= key.rate_limit_per_minute) {
    return { ok: false, status: 429, error: "Rate limit exceeded" };
  }

  return {
    ok: true,
    ctx: { keyId: key.id, ownerUserId: key.owner_user_id, scopes: key.scopes },
  };
}

export async function logApiUsage(params: {
  keyId: string | null;
  route: string;
  method: string;
  status: number;
  latencyMs: number;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("api_usage_logs").insert({
    api_key_id: params.keyId,
    route: params.route,
    method: params.method,
    status_code: params.status,
    latency_ms: params.latencyMs,
  });
  if (params.keyId) {
    await supabaseAdmin
      .from("api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", params.keyId);
  }
}

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
} as const;

export function jsonResponse(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS, ...extra },
  });
}
