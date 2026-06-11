// Piste #14 v1 — Endpoint: GET /api/public/v1/bdpm/search?q=...
import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, logApiUsage, CORS_HEADERS, jsonResponse } from "@/lib/api/auth.server";

export const Route = createFileRoute("/api/public/v1/bdpm/search")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),

      GET: async ({ request }) => {
        const t0 = Date.now();
        const ROUTE = "/api/public/v1/bdpm/search";
        const auth = await authenticateApiKey(request, "bdpm:read");
        if (!auth.ok) {
          await logApiUsage({ keyId: null, route: ROUTE, method: "GET", status: auth.status, latencyMs: Date.now() - t0 });
          return jsonResponse({ error: auth.error }, auth.status);
        }

        const url = new URL(request.url);
        const q = (url.searchParams.get("q") ?? "").trim();
        const limit = Math.min(Number(url.searchParams.get("limit") ?? 20) || 20, 50);

        if (q.length < 2) {
          await logApiUsage({ keyId: auth.ctx.keyId, route: ROUTE, method: "GET", status: 400, latencyMs: Date.now() - t0 });
          return jsonResponse({ error: "Query parameter 'q' must be at least 2 characters" }, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("bdpm_specialites")
          .select("cis, denomination, forme_pharmaceutique, voies_administration, titulaire")
          .ilike("denomination", `%${q}%`)
          .limit(limit);

        if (error) {
          await logApiUsage({ keyId: auth.ctx.keyId, route: ROUTE, method: "GET", status: 500, latencyMs: Date.now() - t0 });
          return jsonResponse({ error: "Internal error" }, 500);
        }

        await logApiUsage({ keyId: auth.ctx.keyId, route: ROUTE, method: "GET", status: 200, latencyMs: Date.now() - t0 });
        return jsonResponse({ query: q, count: data?.length ?? 0, results: data ?? [] });
      },
    },
  },
});
