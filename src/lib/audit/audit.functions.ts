// Piste #13 v1+v2 — Journal d'audit réglementaire append-only (hash chain).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ACTION_MAX = 120;
const ENTITY_MAX = 120;

async function assertAdmin(supabase: any, userId: string) {
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!isAdmin) throw new Error("Forbidden");
}

export const recordAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        action: z.string().min(1).max(ACTION_MAX),
        entityType: z.string().max(ENTITY_MAX).optional(),
        entityId: z.string().max(ENTITY_MAX).optional(),
        payload: z.record(z.string(), z.any()).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: id, error } = await supabase.rpc("append_audit_log", {
      _action: data.action,
      _entity_type: data.entityType ?? undefined,
      _entity_id: data.entityId ?? undefined,
      _payload: data.payload ?? {},
    });
    if (error) throw new Error(error.message);
    return { id: id as string };
  });

export const listAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        limit: z.number().int().min(1).max(500).optional(),
        action: z.string().max(ACTION_MAX).optional(),
        entityType: z.string().max(ENTITY_MAX).optional(),
        entityId: z.string().max(ENTITY_MAX).optional(),
        userId: z.string().uuid().optional(),
        since: z.string().datetime().optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    let q = supabase
      .from("audit_log")
      .select("id, created_at, user_id, action, entity_type, entity_id, payload, prev_hash, hash, retention_class")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 200);
    if (data.action) q = q.eq("action", data.action);
    if (data.entityType) q = q.eq("entity_type", data.entityType);
    if (data.entityId) q = q.eq("entity_id", data.entityId);
    if (data.userId) q = q.eq("user_id", data.userId);
    if (data.since) q = q.gte("created_at", data.since);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { entries: rows ?? [] };
  });

export const verifyAuditChain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ limit: z.number().int().min(10).max(2000).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { data: rows, error } = await supabase
      .from("audit_log")
      .select("id, created_at, user_id, action, entity_type, entity_id, payload, prev_hash, hash, seq")
      .order("seq", { ascending: true })
      .limit(data.limit ?? 1000);
    if (error) throw new Error(error.message);

    const list = rows ?? [];
    let valid = true;
    let firstBreakAt: string | null = null;
    let expectedPrev: string | null = null;

    for (const r of list) {
      if ((r.prev_hash ?? null) !== expectedPrev) {
        valid = false;
        firstBreakAt = r.id;
        break;
      }
      expectedPrev = r.hash;
    }

    return { count: list.length, valid, firstBreakAt };
  });

// Sérialisation JSON canonique : clés triées récursivement.
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalize(obj[k])).join(",") + "}";
}

async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const exportAuditSigned = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        since: z.string().datetime().optional(),
        until: z.string().datetime().optional(),
        limit: z.number().int().min(1).max(5000).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    let q = supabase
      .from("audit_log")
      .select("id, seq, created_at, user_id, action, entity_type, entity_id, payload, prev_hash, hash, retention_class")
      .order("seq", { ascending: true })
      .limit(data.limit ?? 5000);
    if (data.since) q = q.gte("created_at", data.since);
    if (data.until) q = q.lte("created_at", data.until);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const entries = rows ?? [];

    const firstHash = entries[0]?.prev_hash ?? null;
    const lastHash = entries[entries.length - 1]?.hash ?? null;
    const exportedAt = new Date().toISOString();

    const manifestBasis = canonicalize({
      count: entries.length,
      since: data.since ?? null,
      until: data.until ?? null,
      firstHash,
      lastHash,
      exportedAt,
      exportedBy: userId,
    });
    const exportHash = await sha256Hex(manifestBasis);

    // Auto-trace l'export (best-effort, ne bloque pas)
    try {
      await supabase.rpc("append_audit_log", {
        _action: "audit_export_signed",
        _entity_type: "admin",
        _entity_id: undefined,
        _payload: { count: entries.length, exportHash, since: data.since ?? null, until: data.until ?? null },
      });
    } catch {
      /* noop */
    }

    return {
      entries,
      manifest: {
        count: entries.length,
        since: data.since ?? null,
        until: data.until ?? null,
        firstHash,
        lastHash,
        exportHash,
        exportedAt,
        exportedBy: userId,
      },
    };
  });

export const getAuditRetentionStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { data, error } = await supabase
      .from("audit_log")
      .select("retention_class, created_at")
      .order("created_at", { ascending: true })
      .limit(50000);
    if (error) throw new Error(error.message);

    const byClass: Record<string, number> = { standard: 0, sensitive: 0, permanent: 0 };
    let oldest: string | null = null;
    for (const r of data ?? []) {
      const k = (r.retention_class as string) ?? "standard";
      byClass[k] = (byClass[k] ?? 0) + 1;
      if (!oldest) oldest = r.created_at as string;
    }
    return { byClass, oldest, total: (data ?? []).length };
  });
