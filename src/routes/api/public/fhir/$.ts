// Endpoint FHIR R4 entrant — réception de Bundle authentifiée par HMAC d'organisation.
// Sécurité : signature HMAC-SHA256 du body avec le secret d'ingestion de l'organisation,
// transmise via le header X-ConcilMed-Signature ; l'ID d'organisation via X-ConcilMed-Org.

import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-ConcilMed-Org, X-ConcilMed-Signature",
};

function fhirOperationOutcome(severity: "fatal" | "error" | "warning" | "information", code: string, diagnostics: string, status: number) {
  return new Response(JSON.stringify({
    resourceType: "OperationOutcome",
    issue: [{ severity, code, diagnostics }],
  }), {
    status,
    headers: { "Content-Type": "application/fhir+json", ...CORS },
  });
}

function capabilityStatement() {
  return new Response(JSON.stringify({
    resourceType: "CapabilityStatement",
    status: "active",
    date: new Date().toISOString(),
    kind: "instance",
    software: { name: "ConcilMed", version: "1.0" },
    fhirVersion: "4.0.1",
    format: ["application/fhir+json"],
    rest: [{
      mode: "server",
      resource: [
        { type: "Bundle", interaction: [{ code: "create" }] },
        { type: "Patient", interaction: [{ code: "create" }] },
        { type: "MedicationStatement", interaction: [{ code: "create" }] },
        { type: "MedicationRequest", interaction: [{ code: "create" }] },
        { type: "AllergyIntolerance", interaction: [{ code: "create" }] },
        { type: "Condition", interaction: [{ code: "create" }] },
        { type: "Observation", interaction: [{ code: "create" }] },
      ],
    }],
  }), {
    status: 200,
    headers: { "Content-Type": "application/fhir+json", ...CORS },
  });
}

export const Route = createFileRoute("/api/public/fhir/$")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      GET: async ({ params }) => {
        if ((params._splat ?? "").toLowerCase() === "metadata") return capabilityStatement();
        return fhirOperationOutcome("error", "not-found", "Endpoint introuvable.", 404);
      },

      POST: async ({ request, params }) => {
        const splat = (params._splat ?? "").toLowerCase();
        if (splat !== "bundle") {
          return fhirOperationOutcome("error", "not-supported", `Ressource non supportée : ${splat}`, 404);
        }

        const orgId = request.headers.get("x-concilmed-org");
        const signature = request.headers.get("x-concilmed-signature");
        if (!orgId || !signature) {
          return fhirOperationOutcome("error", "security", "Headers X-ConcilMed-Org et X-ConcilMed-Signature requis.", 401);
        }

        const body = await request.text();
        if (body.length > 5_000_000) {
          return fhirOperationOutcome("error", "too-costly", "Bundle > 5 Mo refusé.", 413);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: org, error } = await supabaseAdmin
          .from("organizations")
          .select("id, fhir_ingest_secret_encrypted")
          .eq("id", orgId)
          .maybeSingle();
        if (error || !org?.fhir_ingest_secret_encrypted) {
          return fhirOperationOutcome("error", "security", "Organisation inconnue ou secret d'ingestion non configuré.", 401);
        }

        const secret = Buffer.from(String(org.fhir_ingest_secret_encrypted), "hex").toString("utf8");
        const expected = createHmac("sha256", secret).update(body).digest("hex");
        const sigBuf = Buffer.from(signature);
        const expBuf = Buffer.from(expected);
        if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
          return fhirOperationOutcome("error", "security", "Signature HMAC invalide.", 401);
        }

        let bundle: { resourceType?: string; entry?: unknown[] };
        try { bundle = JSON.parse(body); }
        catch { return fhirOperationOutcome("error", "invalid", "JSON invalide.", 400); }
        if (bundle?.resourceType !== "Bundle") {
          return fhirOperationOutcome("error", "invalid", 'resourceType doit être "Bundle".', 400);
        }

        const { fhirBundleToCsvRows } = await import("@/lib/dataIngest/fhirToConcilMed.server");
        const adapted = fhirBundleToCsvRows(bundle as { entry?: { resource?: { resourceType?: string } }[] });

        // Métrique
        await supabaseAdmin.from("conciliation_events").insert({
          organization_id: orgId,
          step: "open_patient", // pas de step dédié dans l'enum v1 ; metadata identifie l'origine
          kind: "action",
          metadata: {
            source: "fhir_ingest_endpoint",
            entries: bundle.entry?.length ?? 0,
            patients: adapted.patients.length,
            traitements: adapted.traitements.length,
            allergies: adapted.allergies.length,
            antecedents: adapted.antecedents.length,
            biologie: adapted.biologie.length,
          },
        });

        return new Response(JSON.stringify({
          resourceType: "OperationOutcome",
          issue: [{
            severity: "information",
            code: "informational",
            diagnostics: `Bundle reçu : ${bundle.entry?.length ?? 0} entrée(s), ${adapted.patients.length} patient(s), ${adapted.traitements.length} traitement(s).`,
          }],
        }), {
          status: 200,
          headers: { "Content-Type": "application/fhir+json", ...CORS },
        });
      },
    },
  },
});
