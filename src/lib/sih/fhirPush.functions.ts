import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHmac } from "crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  organizationId: z.string().uuid(),
  validationId: z.string().uuid(),
});

interface BundleResource { resourceType?: string }
interface FhirBundle { entry?: { resource?: BundleResource }[] }

function countResources(bundle: FhirBundle): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of bundle.entry ?? []) {
    const t = e.resource?.resourceType ?? "Unknown";
    counts[t] = (counts[t] ?? 0) + 1;
  }
  return counts;
}

export const pushConciliationToSih = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_org_admin", { _org_id: data.organizationId });
    if (!isAdmin) throw new Error("Admin de l'organisation requis.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: cfg } = await supabaseAdmin
      .from("organization_sih_config")
      .select("fhir_base_url, auth_kind, auth_secret_encrypted, is_active")
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (!cfg || !cfg.is_active || !cfg.fhir_base_url) {
      throw new Error("Configuration SIH inactive ou URL absente.");
    }

    const { exportConciliationFhir } = await import("./fhirExport.functions");
    const { bundle } = await exportConciliationFhir({ data: { validationId: data.validationId } });

    const body = JSON.stringify(bundle);
    const headers: Record<string, string> = {
      "Content-Type": "application/fhir+json",
      Accept: "application/fhir+json",
    };

    if (cfg.auth_kind === "bearer" && cfg.auth_secret_encrypted) {
      const secret = Buffer.from(String(cfg.auth_secret_encrypted), "hex").toString("utf8");
      headers["Authorization"] = `Bearer ${secret}`;
    } else if (cfg.auth_kind === "hmac" && cfg.auth_secret_encrypted) {
      const secret = Buffer.from(String(cfg.auth_secret_encrypted), "hex").toString("utf8");
      headers["X-ConcilMed-Signature"] = createHmac("sha256", secret).update(body).digest("hex");
    }

    const url = String(cfg.fhir_base_url).replace(/\/$/, "");
    let status = 0;
    let ok = false;
    let excerpt = "";
    try {
      const res = await fetch(url, { method: "POST", headers, body });
      status = res.status;
      ok = res.ok;
      excerpt = (await res.text()).slice(0, 1000);
    } catch (e) {
      excerpt = e instanceof Error ? e.message : "Erreur réseau";
    }

    const counts = countResources(bundle as FhirBundle);
    await supabaseAdmin.from("fhir_push_logs").insert({
      organization_id: data.organizationId,
      validation_id: data.validationId,
      endpoint_url: url,
      status_code: status || null,
      ok,
      response_excerpt: excerpt,
      resource_counts: counts,
      pushed_by: context.userId,
    });

    if (!ok) throw new Error(`Push échoué (HTTP ${status}). Détails dans le journal.`);
    return { ok, status, counts };
  });

export const listFhirPushLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ organizationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("fhir_push_logs")
      .select("id, endpoint_url, status_code, ok, response_excerpt, resource_counts, created_at, validation_id")
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return { logs: rows ?? [] };
  });
