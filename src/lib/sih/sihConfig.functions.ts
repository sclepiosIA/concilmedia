import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ConfigInput = z.object({
  organizationId: z.string().uuid(),
  fhirBaseUrl: z.string().url().max(500).nullable().optional(),
  authKind: z.enum(["none", "bearer", "hmac"]).default("none"),
  authSecret: z.string().max(1000).nullable().optional(),
  insOid: z.string().max(100).nullable().optional(),
  ippAuthorityOid: z.string().max(100).nullable().optional(),
  isActive: z.boolean().default(false),
});

export const getSihConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ organizationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("organization_sih_config")
      .select("organization_id, fhir_base_url, auth_kind, ins_oid, ipp_authority_oid, is_active, updated_at")
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { config: row };
  });

export const upsertSihConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ConfigInput.parse(d))
  .handler(async ({ data, context }) => {
    // is_org_admin RLS guards the write; explicit check for clearer error.
    const { data: isAdmin } = await context.supabase.rpc("is_org_admin", { _org_id: data.organizationId });
    if (!isAdmin) throw new Error("Admin de l'organisation requis.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Chiffrement déféré : pour simplifier la v2 et éviter une dépendance pgcrypto applicative,
    // on stocke le secret en clair côté table chiffrée bytea (encoding utf8). Une rotation via
    // pgp_sym_encrypt pourra être ajoutée v3 (clé master AI_PROVIDERS_ENCRYPTION_KEY déjà en place).
    const encoded = data.authSecret ? new TextEncoder().encode(data.authSecret) : null;

    const payload = {
      organization_id: data.organizationId,
      fhir_base_url: data.fhirBaseUrl ?? null,
      auth_kind: data.authKind,
      auth_secret_encrypted: encoded ? Buffer.from(encoded).toString("hex") : null,
      ins_oid: data.insOid ?? null,
      ipp_authority_oid: data.ippAuthorityOid ?? null,
      is_active: data.isActive,
    };

    const { error } = await supabaseAdmin
      .from("organization_sih_config")
      .upsert(payload, { onConflict: "organization_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testSihEndpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ organizationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_org_admin", { _org_id: data.organizationId });
    if (!isAdmin) throw new Error("Admin de l'organisation requis.");

    const { data: cfg, error } = await context.supabase
      .from("organization_sih_config")
      .select("fhir_base_url, auth_kind")
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!cfg?.fhir_base_url) return { ok: false, status: 0, message: "Aucune URL FHIR configurée." };

    const url = cfg.fhir_base_url.replace(/\/$/, "") + "/metadata";
    try {
      const res = await fetch(url, { headers: { Accept: "application/fhir+json" } });
      const text = await res.text();
      return {
        ok: res.ok,
        status: res.status,
        message: res.ok ? "CapabilityStatement reçu." : `HTTP ${res.status}`,
        excerpt: text.slice(0, 300),
      };
    } catch (e) {
      return { ok: false, status: 0, message: e instanceof Error ? e.message : "Erreur réseau" };
    }
  });
