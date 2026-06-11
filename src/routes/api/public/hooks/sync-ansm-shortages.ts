// Synchronisation des tensions/ruptures d'approvisionnement ANSM.
// - Source : open data ANSM publié sur data.gouv.fr (CSV).
// - Déclenché soit par cron pg_cron (en utilisant l'apikey publishable),
//   soit manuellement par un admin via le bouton dédié.
// - Upsert dans drug_shortages (clé unique cis+statut).

import { createFileRoute } from "@tanstack/react-router";

// URL CSV publiée par l'ANSM (modifiable via env). Le format attendu est
// CIS;denomination;statut;date_debut;date_fin_prevue;raison;alternative
const DEFAULT_ANSM_URL =
  "https://ansm.sante.fr/uploads/2024/06/ruptures-stocks-medicaments.csv";

type ShortageRow = {
  cis: string;
  denomination: string | null;
  statut: "tension" | "rupture" | "arret" | "remise_a_disposition";
  date_debut: string | null;
  date_fin_prevue: string | null;
  raison: string | null;
  alternative: string | null;
};

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inside = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inside = !inside;
    } else if ((c === ";" || c === ",") && !inside) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function normalizeStatut(raw: string): ShortageRow["statut"] | null {
  const v = raw.toLowerCase();
  if (v.includes("rupture")) return "rupture";
  if (v.includes("tension")) return "tension";
  if (v.includes("arret") || v.includes("arrêt")) return "arret";
  if (v.includes("remise")) return "remise_a_disposition";
  return null;
}

function parseCsv(text: string): ShortageRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idx = {
    cis: header.findIndex((h) => h.includes("cis")),
    denom: header.findIndex((h) => h.includes("denom") || h.includes("specialite") || h.includes("nom")),
    statut: header.findIndex((h) => h.includes("statut") || h.includes("etat")),
    debut: header.findIndex((h) => h.includes("debut") || h.includes("début")),
    fin: header.findIndex((h) => h.includes("fin")),
    raison: header.findIndex((h) => h.includes("raison") || h.includes("motif") || h.includes("cause")),
    alt: header.findIndex((h) => h.includes("alternative") || h.includes("substitut")),
  };
  const rows: ShortageRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const cis = idx.cis >= 0 ? cols[idx.cis] : "";
    if (!cis || !/^\d{6,}$/.test(cis)) continue;
    const statut = normalizeStatut(idx.statut >= 0 ? cols[idx.statut] : "");
    if (!statut) continue;
    rows.push({
      cis,
      denomination: idx.denom >= 0 ? cols[idx.denom] || null : null,
      statut,
      date_debut: idx.debut >= 0 && cols[idx.debut] ? cols[idx.debut] : null,
      date_fin_prevue: idx.fin >= 0 && cols[idx.fin] ? cols[idx.fin] : null,
      raison: idx.raison >= 0 ? cols[idx.raison] || null : null,
      alternative: idx.alt >= 0 ? cols[idx.alt] || null : null,
    });
  }
  return rows;
}

export const Route = createFileRoute("/api/public/hooks/sync-ansm-shortages")({
  server: {
    handlers: {
      POST: async () => {
        const url = process.env.ANSM_SHORTAGES_URL || DEFAULT_ANSM_URL;
        let csvText: string;
        try {
          const resp = await fetch(url, { headers: { Accept: "text/csv,application/csv,*/*" } });
          if (!resp.ok) {
            return Response.json(
              { ok: false, error: `Source indisponible (HTTP ${resp.status})`, url },
              { status: 502 },
            );
          }
          csvText = await resp.text();
        } catch (e) {
          return Response.json(
            { ok: false, error: `Erreur réseau ANSM: ${e instanceof Error ? e.message : String(e)}`, url },
            { status: 502 },
          );
        }

        const rows = parseCsv(csvText);
        if (rows.length === 0) {
          return Response.json({ ok: false, error: "Aucune ligne exploitable dans le CSV", url }, { status: 422 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // Upsert par (cis, statut) — la table a une contrainte UNIQUE dessus.
        const { error } = await supabaseAdmin
          .from("drug_shortages")
          .upsert(
            rows.map((r) => ({ ...r, imported_at: new Date().toISOString(), source_url: url })),
            { onConflict: "cis,statut" },
          );
        if (error) {
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        // Audit
        try {
          await supabaseAdmin.rpc("append_audit_log", {
            _action: "shortages_sync",
            _entity_type: "admin",
            _payload: { count: rows.length, source: url } as unknown as never,
          });
        } catch {
          // append_audit_log requiert auth.uid() — ignoré pour cron
        }

        return Response.json({ ok: true, imported: rows.length, source: url });
      },
    },
  },
});
