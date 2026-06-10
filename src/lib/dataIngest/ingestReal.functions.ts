import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseCsv, sha256Hex } from "./csv.server";
import { checkForbidden } from "./forbiddenColumns.server";
import { PatientCsvSchema, TraitementCsvSchema } from "./csvSchemas.server";
import {
  deriveOrgSalt, hashIpp, deriveDateOffsetDays, offsetDate, redactName,
} from "./pseudonymize.server";

type FileKind = "patients" | "traitements";

const PreviewInput = z.object({
  organizationId: z.string().uuid(),
  fileKind: z.enum(["patients", "traitements"]),
  csvText: z.string().min(1).max(5_000_000),
});

const ConfirmInput = PreviewInput;

interface Issue { line: number; message: string }
interface PreviewResult {
  ok: boolean;
  fileKind: FileKind;
  stats: { total: number; valid: number; rejected: number };
  sample: Record<string, unknown>[];
  errors: Issue[];
  forbiddenColumns: string[];
  sampleLeaks: { column: string; kind: string; sample: string }[];
  sha256: string;
}

async function assertOrgAdmin(supabase: ReturnType<typeof Object>, orgId: string, userId: string): Promise<void> {
  // @ts-expect-error supabase is the typed Database client from middleware
  const { data, error } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`Vérification d'organisation impossible : ${error.message}`);
  if (!data || data.role !== "admin") throw new Error("Accès refusé : admin de l'organisation requis.");
}

async function pseudonymizeRows(orgId: string, fileKind: FileKind, rows: Record<string, string>[]):
  Promise<{ valid: Array<Record<string, unknown>>; errors: Issue[]; orgSalt: string }> {
  const orgSalt = await deriveOrgSalt(orgId);
  const valid: Array<Record<string, unknown>> = [];
  const errors: Issue[] = [];
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    try {
      if (fileKind === "patients") {
        const p = PatientCsvSchema.parse(raw);
        const pseudo = await hashIpp(p.ipp_local, orgSalt);
        const offset = await deriveDateOffsetDays(p.ipp_local, orgSalt);
        valid.push({
          external_pseudo: pseudo,
          date_offset_days: offset,
          date_naissance: offsetDate(p.date_naissance, offset),
          sexe: p.sexe,
          nom: redactName("Patient"),
          prenom: redactName(pseudo),
          poids_kg: p.poids_kg,
          taille_cm: p.taille_cm,
        });
      } else {
        const t = TraitementCsvSchema.parse(raw);
        const pseudo = await hashIpp(t.ipp_local, orgSalt);
        valid.push({
          patient_external_pseudo: pseudo,
          dci: t.dci,
          dosage: t.dosage || null,
          dosage_unite: t.dosage_unite || null,
          voie_administration: t.voie_administration || null,
          posologie_texte: t.posologie_texte || null,
          indication: t.indication || null,
        });
      }
    } catch (e) {
      const msg = e instanceof z.ZodError
        ? e.issues.map((iss) => `${iss.path.join(".")}: ${iss.message}`).join("; ")
        : e instanceof Error ? e.message : "Erreur inconnue";
      errors.push({ line: i + 2, message: msg });
    }
  }
  return { valid, errors, orgSalt };
}

export const previewImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PreviewInput.parse(d))
  .handler(async ({ data, context }): Promise<PreviewResult> => {
    await assertOrgAdmin(context.supabase, data.organizationId, context.userId);
    const sha = await sha256Hex(data.csvText);
    const { headers, rows } = parseCsv(data.csvText);
    const forb = checkForbidden(headers, rows);
    if (!forb.ok) {
      return {
        ok: false, fileKind: data.fileKind,
        stats: { total: rows.length, valid: 0, rejected: rows.length },
        sample: [], errors: [{ line: 1, message: "Colonnes interdites ou valeurs identifiantes détectées." }],
        forbiddenColumns: forb.forbiddenColumns, sampleLeaks: forb.sampleLeaks, sha256: sha,
      };
    }
    const { valid, errors } = await pseudonymizeRows(data.organizationId, data.fileKind, rows);
    return {
      ok: errors.length === 0,
      fileKind: data.fileKind,
      stats: { total: rows.length, valid: valid.length, rejected: errors.length },
      sample: valid.slice(0, 50),
      errors: errors.slice(0, 50),
      forbiddenColumns: [],
      sampleLeaks: [],
      sha256: sha,
    };
  });

export const confirmImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ConfirmInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertOrgAdmin(context.supabase, data.organizationId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const sha = await sha256Hex(data.csvText);
    const { headers, rows } = parseCsv(data.csvText);
    const forb = checkForbidden(headers, rows);
    if (!forb.ok) throw new Error("Colonnes interdites détectées — import refusé.");

    // Crée la ligne d'audit en 'pending'
    const { data: imp, error: impErr } = await supabaseAdmin
      .from("data_imports")
      .insert({
        organization_id: data.organizationId,
        imported_by: context.userId,
        file_kind: data.fileKind,
        source_sha256: sha,
        rows_total: rows.length,
        rows_inserted: 0,
        rows_rejected: 0,
        status: "pending",
      })
      .select("id")
      .single();
    if (impErr || !imp) throw new Error(`Audit d'import impossible : ${impErr?.message}`);

    const { valid, errors } = await pseudonymizeRows(data.organizationId, data.fileKind, rows);

    let inserted = 0;
    try {
      if (data.fileKind === "patients") {
        // Upsert sur (organization_id, external_pseudo)
        const payload = valid.map((v) => ({
          organization_id: data.organizationId,
          data_source: "real_pseudonymized",
          imported_via: imp.id,
          created_by: context.userId,
          external_pseudo: v.external_pseudo as string,
          date_offset_days: v.date_offset_days as number,
          date_naissance: v.date_naissance as string | null,
          sexe: v.sexe as string,
          nom: v.nom as string,
          prenom: v.prenom as string,
          poids_kg: v.poids_kg as number | null,
          taille_cm: v.taille_cm as number | null,
          is_synthetic: false,
        }));
        if (payload.length > 0) {
          const { error: insErr, count } = await supabaseAdmin
            .from("patients")
            .upsert(payload, { onConflict: "organization_id,external_pseudo", count: "exact" });
          if (insErr) throw new Error(insErr.message);
          inserted = count ?? payload.length;
        }
      } else {
        // Pour traitements : on rattache au patient via (org, external_pseudo)
        const pseudos = Array.from(new Set(valid.map((v) => v.patient_external_pseudo as string)));
        const { data: pats, error: pErr } = await supabaseAdmin
          .from("patients")
          .select("id, external_pseudo")
          .eq("organization_id", data.organizationId)
          .in("external_pseudo", pseudos);
        if (pErr) throw new Error(pErr.message);
        const map = new Map((pats ?? []).map((p) => [p.external_pseudo as string, p.id]));
        const payload: Array<Record<string, unknown>> = [];
        for (const v of valid) {
          const pid = map.get(v.patient_external_pseudo as string);
          if (!pid) { errors.push({ line: 0, message: `Patient pseudo introuvable : ${v.patient_external_pseudo}` }); continue; }
          payload.push({
            patient_id: pid,
            dci: v.dci,
            dosage: v.dosage, dosage_unite: v.dosage_unite,
            voie_administration: v.voie_administration,
            posologie_texte: v.posologie_texte, indication: v.indication,
            source: "import_reel",
            actif: true,
          });
        }
        if (payload.length > 0) {
          const { error: insErr } = await supabaseAdmin.from("traitements_habituels").insert(payload);
          if (insErr) throw new Error(insErr.message);
          inserted = payload.length;
        }
      }

      await supabaseAdmin.from("data_imports").update({
        rows_inserted: inserted, rows_rejected: errors.length,
        status: "success", errors: errors.slice(0, 100) as never, finished_at: new Date().toISOString(),
      }).eq("id", imp.id);

      return { ok: true, importId: imp.id, inserted, rejected: errors.length };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur inconnue";
      await supabaseAdmin.from("data_imports").update({
        status: "error", errors: [{ line: 0, message: msg }] as never,
        finished_at: new Date().toISOString(),
      }).eq("id", imp.id);
      throw new Error(`Import échoué : ${msg}`);
    }
  });

export const listImports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ organizationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // @ts-expect-error typed client
    const { data: rows, error } = await context.supabase
      .from("data_imports")
      .select("id, file_kind, source_sha256, rows_total, rows_inserted, rows_rejected, status, started_at, finished_at")
      .eq("organization_id", data.organizationId)
      .order("started_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return { imports: rows ?? [] };
  });

export const listMyOrganizations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // @ts-expect-error typed client
    const { data, error } = await context.supabase
      .from("organization_members")
      .select("role, organization_id, organizations(id, nom, finess, hds_provider)")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return {
      orgs: (data ?? []).map((m: { role: string; organizations: { id: string; nom: string; finess: string | null; hds_provider: string | null } | null }) => ({
        id: m.organizations?.id ?? "", nom: m.organizations?.nom ?? "",
        finess: m.organizations?.finess ?? null, hds_provider: m.organizations?.hds_provider ?? null,
        role: m.role,
      })).filter((o) => o.id),
    };
  });

const CreateOrgInput = z.object({ nom: z.string().min(2).max(120), finess: z.string().max(20).optional() });
export const createOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateOrgInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: org, error } = await supabaseAdmin
      .from("organizations")
      .insert({ nom: data.nom, finess: data.finess || null })
      .select("id, nom")
      .single();
    if (error || !org) throw new Error(error?.message ?? "Création échouée");
    const { error: mErr } = await supabaseAdmin
      .from("organization_members")
      .insert({ organization_id: org.id, user_id: context.userId, role: "admin" });
    if (mErr) throw new Error(mErr.message);
    return { organization: org };
  });
