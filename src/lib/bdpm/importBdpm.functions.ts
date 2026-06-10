import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BDPM_BASE = "https://base-donnees-publique.medicaments.gouv.fr/download/file/";

const FILES = {
  cis: "CIS_bdpm.txt",
  cip: "CIS_CIP_bdpm.txt",
  compo: "CIS_COMPO_bdpm.txt",
  atc: "CIS_ATC_bdpm.txt",
} as const;

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Accès refusé : rôle admin requis");
}

async function fetchAndDecode(filename: string): Promise<string[]> {
  const res = await fetch(BDPM_BASE + filename, {
    headers: { "User-Agent": "ConcilMed/1.0" },
  });
  if (!res.ok) throw new Error(`BDPM ${filename}: HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  const text = new TextDecoder("windows-1252").decode(buf);
  return text.split(/\r?\n/).filter((l) => l.length > 0);
}

function parseRow(line: string): string[] {
  return line.split("\t").map((c) => c.trim());
}

function toBigInt(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function toBool(v: string | undefined): boolean {
  return /^oui$/i.test(v ?? "");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function upsertChunks<T extends Record<string, any>>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  table: string,
  rows: T[],
  conflict: string,
  chunkSize = 1000,
): Promise<number> {
  let total = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const slice = rows.slice(i, i + chunkSize);
    const { error } = await client.from(table).upsert(slice, { onConflict: conflict });
    if (error) throw new Error(`${table}: ${error.message}`);
    total += slice.length;
  }
  return total;
}

export const importBdpm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: run, error: runErr } = await supabaseAdmin
      .from("bdpm_import_runs")
      .insert({ status: "running", triggered_by: context.userId })
      .select()
      .single();
    if (runErr) throw new Error(runErr.message);

    const filesProcessed: Record<string, number> = {};
    let rowsTotal = 0;

    try {
      // --- 1. Spécialités (CIS) ---
      const cisLines = await fetchAndDecode(FILES.cis);
      const cisRows = cisLines
        .map(parseRow)
        .filter((r) => r.length >= 11 && toBigInt(r[0]) !== null)
        .map((r) => ({
          cis: toBigInt(r[0])!,
          denomination: r[1] ?? "",
          forme: r[2] ?? null,
          voies: r[3] ?? null,
          statut_amm: r[4] ?? null,
          type_amm: r[5] ?? null,
          etat_commercialisation: r[6] ?? null,
          date_amm: r[7] ?? null,
          titulaire: r[10] ?? null,
          surveillance_renforcee: toBool(r[11]),
          updated_at: new Date().toISOString(),
        }));
      filesProcessed[FILES.cis] = await upsertChunks(
        supabaseAdmin,
        "bdpm_specialites",
        cisRows,
        "cis",
      );
      rowsTotal += filesProcessed[FILES.cis];

      // --- 2. ATC ---
      const atcLines = await fetchAndDecode(FILES.atc);
      const atcRows = atcLines
        .map(parseRow)
        .filter((r) => r.length >= 2 && toBigInt(r[0]) !== null)
        .map((r) => ({
          cis: toBigInt(r[0])!,
          code_atc: r[1],
          libelle_atc: r[2] ?? null,
        }));
      filesProcessed[FILES.atc] = await upsertChunks(
        supabaseAdmin,
        "bdpm_atc",
        atcRows,
        "cis",
      );
      rowsTotal += filesProcessed[FILES.atc];

      // --- 3. Présentations (CIP) ---
      const cipLines = await fetchAndDecode(FILES.cip);
      const cipRows = cipLines
        .map(parseRow)
        .filter((r) => r.length >= 7 && toBigInt(r[0]) !== null && toBigInt(r[6]) !== null)
        .map((r) => ({
          cip7: toBigInt(r[6])!,
          cip13: toBigInt(r[6]),
          cis: toBigInt(r[0])!,
          libelle: r[1] ?? null,
          statut_admin: r[2] ?? null,
          etat_commercialisation: r[3] ?? null,
          date_declaration_commerc: r[4] ?? null,
          agrement_collectivites: toBool(r[7]),
          taux_remboursement: r[8] ?? null,
          prix_eur: r[9] ? Number(r[9].replace(",", ".")) || null : null,
        }));
      filesProcessed[FILES.cip] = await upsertChunks(
        supabaseAdmin,
        "bdpm_presentations",
        cipRows,
        "cip7",
      );
      rowsTotal += filesProcessed[FILES.cip];

      // --- 4. Compositions ---
      // Wipe + insert (pas de clé naturelle simple)
      await supabaseAdmin.from("bdpm_compositions").delete().neq("id", -1);
      const compoLines = await fetchAndDecode(FILES.compo);
      const compoRows = compoLines
        .map(parseRow)
        .filter((r) => r.length >= 7 && toBigInt(r[0]) !== null)
        .map((r) => ({
          cis: toBigInt(r[0])!,
          designation_element_pharma: r[1] ?? null,
          code_substance: toBigInt(r[2]),
          denomination_substance: r[3] ?? null,
          dosage_substance: r[4] ?? null,
          reference_dosage: r[5] ?? null,
          nature_composant: r[6] ?? null,
        }));
      let compoInserted = 0;
      for (let i = 0; i < compoRows.length; i += 1000) {
        const slice = compoRows.slice(i, i + 1000);
        const { error } = await supabaseAdmin.from("bdpm_compositions").insert(slice);
        if (error) throw new Error(`bdpm_compositions: ${error.message}`);
        compoInserted += slice.length;
      }
      filesProcessed[FILES.compo] = compoInserted;
      rowsTotal += compoInserted;

      await supabaseAdmin
        .from("bdpm_import_runs")
        .update({
          status: "success",
          finished_at: new Date().toISOString(),
          files_processed: filesProcessed,
          rows_total: rowsTotal,
        })
        .eq("id", run.id);

      return { ok: true, runId: run.id, filesProcessed, rowsTotal };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabaseAdmin
        .from("bdpm_import_runs")
        .update({
          status: "error",
          finished_at: new Date().toISOString(),
          files_processed: filesProcessed,
          rows_total: rowsTotal,
          error: msg,
        })
        .eq("id", run.id);
      throw new Error(`Import BDPM échoué : ${msg}`);
    }
  });

export const getBdpmStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ count: specCount }, { count: atcCount }, { count: cipCount }, { data: lastRun }] =
      await Promise.all([
        supabaseAdmin.from("bdpm_specialites").select("*", { count: "exact", head: true }),
        supabaseAdmin.from("bdpm_atc").select("*", { count: "exact", head: true }),
        supabaseAdmin.from("bdpm_presentations").select("*", { count: "exact", head: true }),
        supabaseAdmin
          .from("bdpm_import_runs")
          .select("*")
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
    return {
      specialites: specCount ?? 0,
      atc: atcCount ?? 0,
      presentations: cipCount ?? 0,
      lastRun,
    };
  });
