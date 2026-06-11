// Piste #13 v1 — Journal d'audit réglementaire append-only (hash chain).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ACTION_MAX = 120;
const ENTITY_MAX = 120;

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
      _entity_type: data.entityType ?? null,
      _entity_id: data.entityId ?? null,
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
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");

    let q = supabase
      .from("audit_log")
      .select("id, created_at, user_id, action, entity_type, entity_id, payload, prev_hash, hash")
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
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");

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
