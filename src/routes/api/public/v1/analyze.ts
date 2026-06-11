// Piste #14 v1 — Endpoint: POST /api/public/v1/analyze
// Analyse minimaliste de traitements (détection de doublons par DCI/ATC) — pas d'appel LLM v1.
import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, logApiUsage, CORS_HEADERS, jsonResponse } from "@/lib/api/auth.server";

type InMed = { name?: string; cis?: string; dose?: string };

export const Route = createFileRoute("/api/public/v1/analyze")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),

      POST: async ({ request }) => {
        const t0 = Date.now();
        const ROUTE = "/api/public/v1/analyze";
        const auth = await authenticateApiKey(request, "analyze:write");
        if (!auth.ok) {
          await logApiUsage({ keyId: null, route: ROUTE, method: "POST", status: auth.status, latencyMs: Date.now() - t0 });
          return jsonResponse({ error: auth.error }, auth.status);
        }

        let payload: { medications?: InMed[] };
        try {
          payload = await request.json();
        } catch {
          await logApiUsage({ keyId: auth.ctx.keyId, route: ROUTE, method: "POST", status: 400, latencyMs: Date.now() - t0 });
          return jsonResponse({ error: "Invalid JSON" }, 400);
        }

        const meds = Array.isArray(payload?.medications) ? payload.medications : [];
        if (meds.length === 0 || meds.length > 100) {
          await logApiUsage({ keyId: auth.ctx.keyId, route: ROUTE, method: "POST", status: 400, latencyMs: Date.now() - t0 });
          return jsonResponse({ error: "medications: array of 1..100 required" }, 400);
        }

        // Détection de doublons par dénomination normalisée
        const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
        const groups = new Map<string, number[]>();
        meds.forEach((m, i) => {
          const k = norm(m.name ?? m.cis ?? `#${i}`);
          if (!k) return;
          if (!groups.has(k)) groups.set(k, []);
          groups.get(k)!.push(i);
        });
        const duplicates = Array.from(groups.entries())
          .filter(([, idx]) => idx.length > 1)
          .map(([key, idx]) => ({ key, indexes: idx, count: idx.length }));

        await logApiUsage({ keyId: auth.ctx.keyId, route: ROUTE, method: "POST", status: 200, latencyMs: Date.now() - t0 });
        return jsonResponse({
          input_count: meds.length,
          duplicates,
          summary: duplicates.length
            ? `${duplicates.length} groupe(s) de doublon(s) détecté(s).`
            : "Aucun doublon détecté.",
        });
      },
    },
  },
});
