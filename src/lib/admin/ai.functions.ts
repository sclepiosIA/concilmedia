// Admin AI server functions: providers, tasks, versions, test.
// All gated by requireSupabaseAuth + an explicit admin role check.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error("Erreur lors de la vérification du rôle");
  if (!data) throw new Error("Accès refusé : rôle admin requis");
}

export const isAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    return { isAdmin: !!data };
  });

export const getDefaultSystemPrompt = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ slug: z.string().min(1).max(100) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { DEFAULT_SYSTEM_PROMPTS } = await import("./defaultPrompts.server");
    return { prompt: DEFAULT_SYSTEM_PROMPTS[data.slug] ?? "" };
  });

export const listProviders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("ai_providers")
      .select("id, name, kind, base_url, extra_config, is_active, api_key_encrypted, created_at, updated_at")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data || []).map((p) => ({
      ...p,
      has_key: !!p.api_key_encrypted,
      api_key_encrypted: undefined,
    }));
  });

const providerInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  kind: z.enum(["lovable", "openai", "azure_openai", "google", "anthropic", "openai_compatible"]),
  base_url: z.string().trim().url().or(z.literal("")).nullable().optional(),
  extra_config: z.record(z.string(), z.unknown()).optional(),
  is_active: z.boolean().optional(),
  api_key: z.string().optional(), // plain; set if provided
});

export const upsertProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => providerInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const masterKey = process.env.AI_PROVIDERS_ENCRYPTION_KEY;
    if (!masterKey) throw new Error("AI_PROVIDERS_ENCRYPTION_KEY manquante");

    let providerId = data.id;
    const row = {
      name: data.name,
      kind: data.kind,
      base_url: data.base_url ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      extra_config: (data.extra_config ?? {}) as any,
      is_active: data.is_active ?? true,
    };
    if (providerId) {
      const { error } = await supabaseAdmin.from("ai_providers").update(row).eq("id", providerId);
      if (error) throw new Error(error.message);
    } else {
      const { data: ins, error } = await supabaseAdmin
        .from("ai_providers")
        .insert(row)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      providerId = ins.id;
    }

    if (data.api_key !== undefined && data.api_key.trim().length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: rpcErr } = await (supabaseAdmin.rpc as any)("ai_provider_set_key", {
        _provider_id: providerId,
        _plain_key: data.api_key,
        _master_key: masterKey,
      });
      if (rpcErr) throw new Error("Erreur chiffrement clé : " + rpcErr.message);
    }
    return { id: providerId };
  });

export const deleteProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("ai_providers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("ai_tasks")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("id, slug, label, description, model, current_version, updated_at, execution_mode, provider:ai_providers(id, name, kind)" as any)
      .order("label", { ascending: true });
    if (error) throw new Error(error.message);
    return (data || []) as Array<{
      id: string; slug: string; label: string; description: string | null;
      model: string; current_version: number; updated_at: string;
      execution_mode?: "llm" | "ml" | "both";
      provider: { id: string; name: string; kind: string } | null;
    }>;
  });

export const getTask = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ slug: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: task, error } = await supabaseAdmin
      .from("ai_tasks")
      .select("id, slug, label, description, model, system_prompt, temperature, max_tokens, current_version, provider_id, execution_mode, provider:ai_providers(id, name, kind)")
      .eq("slug", data.slug)
      .single();
    if (error) throw new Error(error.message);
    const { data: extraRow } = await supabaseAdmin
      .from("ai_tasks")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("extra_config" as any)
      .eq("slug", data.slug)
      .single();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const extra = ((extraRow as any)?.extra_config ?? {}) as Record<string, unknown>;
    // Prompt effectif : DB si non vide, sinon le prompt par défaut codé en dur
    // (utilisé comme fallback runtime par les tâches). Permet à l'éditeur
    // d'afficher TOUJOURS le prompt courant, même si la colonne DB est vide.
    const { DEFAULT_SYSTEM_PROMPTS } = await import("./defaultPrompts.server");
    const dbPrompt = (task.system_prompt ?? "").trim();
    const hasDbPrompt = dbPrompt.length > 0;
    const effectivePrompt = hasDbPrompt
      ? task.system_prompt
      : (DEFAULT_SYSTEM_PROMPTS[data.slug] ?? "");
    return {
      ...task,
      system_prompt: effectivePrompt,
      has_db_prompt: hasDbPrompt,
      reasoning_effort: (extra.reasoning_effort as "low" | "medium" | "high" | null) ?? null,
    };
  });

const updateTaskSchema = z.object({
  slug: z.string(),
  provider_id: z.string().uuid().nullable(),
  model: z.string().min(1),
  system_prompt: z.string(),
  temperature: z.number().nullable().optional(),
  max_tokens: z.number().int().positive().nullable().optional(),
  execution_mode: z.enum(["llm", "ml", "both"]).optional(),
  reasoning_effort: z.enum(["low", "medium", "high"]).nullable().optional(),
  note: z.string().optional(),
});

export const updateTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateTaskSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: current, error: fetchErr } = await supabaseAdmin
      .from("ai_tasks")
      .select("id, current_version")
      .eq("slug", data.slug)
      .single();
    if (fetchErr) throw new Error(fetchErr.message);

    const nextVersion = (current.current_version || 1) + 1;

    const update: Record<string, unknown> = {
      provider_id: data.provider_id,
      model: data.model,
      system_prompt: data.system_prompt,
      temperature: data.temperature ?? null,
      max_tokens: data.max_tokens ?? null,
      current_version: nextVersion,
      extra_config: { reasoning_effort: data.reasoning_effort ?? null },
    };
    if (data.execution_mode) update.execution_mode = data.execution_mode;

    const { error: upErr } = await supabaseAdmin
      .from("ai_tasks")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(update as any)
      .eq("id", current.id);
    if (upErr) throw new Error(upErr.message);

    const { error: verErr } = await supabaseAdmin.from("ai_prompt_versions").insert({
      task_id: current.id,
      version: nextVersion,
      system_prompt: data.system_prompt,
      model: data.model,
      provider_id: data.provider_id,
      temperature: data.temperature ?? null,
      max_tokens: data.max_tokens ?? null,
      note: data.note ?? null,
      created_by: context.userId,
    });
    if (verErr) throw new Error(verErr.message);

    return { ok: true, version: nextVersion };
  });

const bulkUpdateSchema = z
  .object({
    slugs: z.array(z.string().min(1)).min(1).max(50),
    provider_id: z.string().uuid().nullable().optional(),
    model: z.string().min(1).max(255).optional(),
    note: z.string().max(500).optional(),
  })
  .refine((d) => d.provider_id !== undefined || d.model !== undefined, {
    message: "Au moins un champ doit être modifié",
  });

export const bulkUpdateTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => bulkUpdateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: tasks, error: fetchErr } = await supabaseAdmin
      .from("ai_tasks")
      .select("id, slug, current_version, provider_id, model, system_prompt, temperature, max_tokens")
      .in("slug", data.slugs);
    if (fetchErr) throw new Error(fetchErr.message);

    const errors: Array<{ slug: string; error: string }> = [];
    let updated = 0;

    for (const t of tasks ?? []) {
      try {
        const nextVersion = (t.current_version || 1) + 1;
        const nextProviderId =
          data.provider_id !== undefined ? data.provider_id : t.provider_id;
        const nextModel = data.model !== undefined ? data.model : t.model;

        const { error: upErr } = await supabaseAdmin
          .from("ai_tasks")
          .update({
            provider_id: nextProviderId,
            model: nextModel,
            current_version: nextVersion,
          })
          .eq("id", t.id);
        if (upErr) throw new Error(upErr.message);

        const { error: verErr } = await supabaseAdmin.from("ai_prompt_versions").insert({
          task_id: t.id,
          version: nextVersion,
          system_prompt: t.system_prompt,
          model: nextModel,
          provider_id: nextProviderId,
          temperature: t.temperature ?? null,
          max_tokens: t.max_tokens ?? null,
          note: data.note ?? "bulk update",
          created_by: context.userId,
        });
        if (verErr) throw new Error(verErr.message);

        updated += 1;
      } catch (e) {
        errors.push({
          slug: t.slug,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return { updated, errors, total: data.slugs.length };
  });

export const listTaskVersions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ slug: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: task } = await supabaseAdmin
      .from("ai_tasks")
      .select("id")
      .eq("slug", data.slug)
      .single();
    if (!task) return [];
    const { data: versions, error } = await supabaseAdmin
      .from("ai_prompt_versions")
      .select("id, version, system_prompt, model, provider_id, temperature, max_tokens, note, created_at, created_by")
      .eq("task_id", task.id)
      .order("version", { ascending: false });
    if (error) throw new Error(error.message);
    return versions || [];
  });

export const restoreTaskVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ slug: z.string(), versionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: v, error } = await supabaseAdmin
      .from("ai_prompt_versions")
      .select("system_prompt, model, provider_id, temperature, max_tokens")
      .eq("id", data.versionId)
      .single();
    if (error) throw new Error(error.message);
    // Reuse updateTask path (creates a new version with restored payload)
    const fakeCtx = { data: { slug: data.slug, ...v, note: "Restauration version antérieure" } as never };
    // call updateTask handler logic inline
    const { data: task, error: tErr } = await supabaseAdmin
      .from("ai_tasks").select("id, current_version").eq("slug", data.slug).single();
    if (tErr) throw new Error(tErr.message);
    const nextVersion = task.current_version + 1;
    await supabaseAdmin.from("ai_tasks").update({
      provider_id: v.provider_id,
      model: v.model,
      system_prompt: v.system_prompt,
      temperature: v.temperature,
      max_tokens: v.max_tokens,
      current_version: nextVersion,
    }).eq("id", task.id);
    await supabaseAdmin.from("ai_prompt_versions").insert({
      task_id: task.id,
      version: nextVersion,
      system_prompt: v.system_prompt,
      model: v.model,
      provider_id: v.provider_id,
      temperature: v.temperature,
      max_tokens: v.max_tokens,
      note: "Restauration",
      created_by: context.userId,
    });
    void fakeCtx;
    return { ok: true, version: nextVersion };
  });

export const testTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ slug: z.string(), prompt: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { runAITask } = await import("@/lib/ai/runAITask.server");
    const r = await runAITask(data.slug, {
      prompt: data.prompt,
      fallback: { systemPrompt: "Tu es un assistant utile." },
    });
    return r;
  });
