// Piste #14 v1 — Endpoint: GET /api/public/v1/openapi.json
import { createFileRoute } from "@tanstack/react-router";
import { CORS_HEADERS } from "@/lib/api/auth.server";

const spec = {
  openapi: "3.0.3",
  info: {
    title: "ConcilMed Public API",
    version: "1.0.0",
    description: "API publique ConcilMed — recherche BDPM et analyse de traitements. Authentification par clé API (Bearer).",
  },
  servers: [{ url: "/api/public/v1" }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer" },
    },
    schemas: {
      Medication: {
        type: "object",
        properties: {
          name: { type: "string" },
          cis: { type: "string" },
          dose: { type: "string" },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    "/health": {
      get: {
        security: [],
        summary: "Health check",
        responses: { "200": { description: "Service status" } },
      },
    },
    "/bdpm/search": {
      get: {
        summary: "Recherche dans la base BDPM",
        parameters: [
          { name: "q", in: "query", required: true, schema: { type: "string", minLength: 2 } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 50, default: 20 } },
        ],
        responses: {
          "200": { description: "Résultats" },
          "401": { description: "Clé API invalide" },
          "403": { description: "Scope insuffisant (requiert bdpm:read)" },
          "429": { description: "Rate limit dépassé" },
        },
      },
    },
    "/analyze": {
      post: {
        summary: "Analyse rapide d'une liste de traitements (détection doublons)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["medications"],
                properties: {
                  medications: {
                    type: "array",
                    minItems: 1,
                    maxItems: 100,
                    items: { $ref: "#/components/schemas/Medication" },
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Analyse" },
          "400": { description: "Payload invalide" },
          "401": { description: "Clé API invalide" },
          "403": { description: "Scope insuffisant (requiert analyze:write)" },
          "429": { description: "Rate limit dépassé" },
        },
      },
    },
  },
} as const;

export const Route = createFileRoute("/api/public/v1/openapi")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      GET: async () =>
        new Response(JSON.stringify(spec), {
          status: 200,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        }),
    },
  },
});
