import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface OrgMember {
  user_id: string;
  role: "admin" | "pharmacien" | "observateur";
  service: string | null;
  display_name: string | null;
}

export const listOrgMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ organizationId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<OrgMember[]> => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("organization_members")
      .select("user_id, role, service, display_name")
      .eq("organization_id", data.organizationId);
    if (error) throw new Error(error.message);
    return (rows ?? []) as OrgMember[];
  });

export interface MyOrg {
  id: string;
  nom: string;
  role: string;
  service: string | null;
}

export const listMyOrganizations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyOrg[]> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("organization_members")
      .select("role, service, organizations(id, nom)")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return (data ?? [])
      .map((m) => {
        const o = m.organizations as { id: string; nom: string } | null;
        if (!o) return null;
        return { id: o.id, nom: o.nom, role: m.role as string, service: (m.service as string | null) ?? null };
      })
      .filter((x): x is MyOrg => x !== null);
  });

export const updateMemberService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      organizationId: z.string().uuid(),
      userId: z.string().uuid(),
      service: z.string().max(120).nullable(),
      displayName: z.string().max(120).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // verify caller is org admin
    const { data: me, error: meErr } = await supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", data.organizationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (meErr) throw new Error(meErr.message);
    if (!me || me.role !== "admin") throw new Error("Accès refusé : admin d'organisation requis.");
    const patch: Record<string, string | null> = { service: data.service };
    if (data.displayName !== undefined) patch.display_name = data.displayName;
    const { error } = await supabase
      .from("organization_members")
      .update(patch)
      .eq("organization_id", data.organizationId)
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
