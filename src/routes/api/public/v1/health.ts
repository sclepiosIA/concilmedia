// Piste #14 v1 — Endpoint: GET /api/public/v1/health
import { createFileRoute } from "@tanstack/react-router";
import { CORS_HEADERS, jsonResponse } from "@/lib/api/auth.server";

export const Route = createFileRoute("/api/public/v1/health")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      GET: async () =>
        jsonResponse({
          status: "ok",
          service: "ConcilMed Public API",
          version: "v1",
          time: new Date().toISOString(),
        }),
    },
  },
});
