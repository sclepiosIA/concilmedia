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
  base_url: z.string().url().nullable().optional(),
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
      .select("id, slug, label, description, model, current_version, updated_at, provider:ai_providers(id, name, kind)")
      .order("label", { ascending: true });
    if (error) throw new Error(error.message);
    return data || [];
  });

export const getTask = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ slug: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: task, error } = await supabaseAdmin
      .from("ai_tasks")
      .select("id, slug, label, description, model, system_prompt, temperature, max_tokens, current_version, provider_id, provider:ai_providers(id, name, kind)")
      .eq("slug", data.slug)
      .single();
    if (error) throw new Error(error.message);
    return task;
  });

const updateTaskSchema = z.object({
  slug: z.string(),
  provider_id: z.string().uuid().nullable(),
  model: z.string().min(1),
  system_prompt: z.string(),
  temperature: z.number().nullable().optional(),
  max_tokens: z.number().int().positive().nullable().optional(),
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

    const { error: upErr } = await supabaseAdmin
      .from("ai_tasks")
      .update({
        provider_id: data.provider_id,
        model: data.model,
        system_prompt: data.system_prompt,
        temperature: data.temperature ?? null,
        max_tokens: data.max_tokens ?? null,
        current_version: nextVersion,
      })
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
