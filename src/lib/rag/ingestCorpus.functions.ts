// Ingestion des corpus RAG : STOPP/START, Laroche, et un sous-ensemble BDPM.
// Toutes les fonctions sont admin-only (vérification de rôle).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { STOPP_RULES } from "@/lib/conciliation/stoppStart";

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

/** Insère un document + ses chunks (avec embeddings). Réutilisé par tous les ingesteurs. */
async function persistDocument(opts: {
  source: string;
  titre: string;
  version?: string | null;
  url?: string | null;
  licence?: string | null;
  chunks: Array<{ content: string; metadata?: Record<string, unknown> }>;
  /** Si fourni, remplace tout document existant pour ce (source, titre). */
  replace?: boolean;
}): Promise<{ documentId: string; inserted: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { embedTexts, toPgVector } = await import("./embed.server");
  const { estimateTokens } = await import("./chunk.server");

  if (opts.replace) {
    await supabaseAdmin
      .from("rag_documents")
      .delete()
      .eq("source", opts.source)
      .eq("titre", opts.titre);
  }

  const { data: doc, error: docErr } = await supabaseAdmin
    .from("rag_documents")
    .insert({
      source: opts.source,
      titre: opts.titre,
      version: opts.version ?? null,
      url: opts.url ?? null,
      licence: opts.licence ?? null,
    })
    .select()
    .single();
  if (docErr || !doc) throw new Error(docErr?.message ?? "Insertion rag_documents échouée");

  if (opts.chunks.length === 0) return { documentId: doc.id as string, inserted: 0 };

  const embeddings = await embedTexts(opts.chunks.map((c) => c.content));
  const rows = opts.chunks.map((c, i) => ({
    document_id: doc.id as string,
    ord: i,
    content: c.content,
    tokens: estimateTokens(c.content),
    embedding: toPgVector(embeddings[i]) as unknown as string,
    metadata: (c.metadata ?? {}) as never,
  }));

  // Insert par batch de 100 pour éviter les payloads trop gros
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const slice = rows.slice(i, i + 100);
    const { error } = await supabaseAdmin.from("rag_chunks").insert(slice as never);
    if (error) throw new Error(`rag_chunks: ${error.message}`);
    inserted += slice.length;
  }
  return { documentId: doc.id as string, inserted };
}

// ─────────────────────────────────────────────────────────────────────────────
// STOPP/START v2
// ─────────────────────────────────────────────────────────────────────────────

export const ingestStoppStart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const chunks = STOPP_RULES.map((rule) => ({
      content: `${rule.id} — ${rule.label}.
Classe ATC visée : ${rule.appliesClass}.
Gravité : ${rule.gravite}.${rule.minAge ? `\nÂge minimum : ${rule.minAge} ans.` : ""}${
        rule.comorbiditeKeywords && rule.comorbiditeKeywords.length > 0
          ? `\nDéclencheurs comorbidités : ${rule.comorbiditeKeywords.join(", ")}.`
          : ""
      }
Source : STOPP/START version 2 (O'Mahony et al., Age Ageing 2015).
Recommandation : revoir l'indication de ce traitement chez ce patient et envisager déprescription ou alternative.`,
      metadata: { rule_id: rule.id, classe: rule.appliesClass, gravite: rule.gravite },
    }));
    return persistDocument({
      source: "STOPP/START v2",
      titre: "Critères STOPP/START (gériatrie ≥ 65 ans)",
      version: "v2-2015",
      url: "https://doi.org/10.1093/ageing/afu145",
      licence: "Académique — usage clinique",
      chunks,
      replace: true,
    });
  });

// ─────────────────────────────────────────────────────────────────────────────
// Liste de Laroche — médicaments potentiellement inappropriés sujet âgé
// ─────────────────────────────────────────────────────────────────────────────

const LAROCHE_CRITERIA: Array<{ id: string; titre: string; texte: string; classe: string }> = [
  {
    id: "LAR-01",
    classe: "anticholinergique",
    titre: "Antidépresseurs imipraminiques (amitriptyline, clomipramine, imipramine)",
    texte:
      "Chez le sujet âgé ≥ 75 ans, les antidépresseurs imipraminiques exposent à un rapport bénéfice/risque défavorable (effets anticholinergiques marqués : confusion, rétention urinaire, hypotension orthostatique, troubles du rythme). Alternatives préférées : ISRS (sertraline, escitalopram) ou ISRSNa avec ajustement posologique.",
  },
  {
    id: "LAR-02",
    classe: "anticholinergique",
    titre: "Antihistaminiques H1 de 1ère génération (hydroxyzine, alimemazine)",
    texte:
      "À éviter chez le sujet âgé en raison de leurs effets anticholinergiques (somnolence diurne, confusion, rétention urinaire, glaucome) et de leur demi-vie longue. Préférer un antihistaminique de 2ème génération non sédatif (cétirizine, loratadine).",
  },
  {
    id: "LAR-03",
    classe: "antispasmodique",
    titre: "Antispasmodiques anticholinergiques (oxybutynine, trospium)",
    texte:
      "Rapport bénéfice/risque défavorable chez le sujet âgé ≥ 75 ans (effets centraux : confusion, troubles cognitifs ; effets périphériques : constipation, sécheresse). Discuter rééducation périnéale ou alternative non anticholinergique (mirabégron).",
  },
  {
    id: "LAR-04",
    classe: "benzodiazepine",
    titre: "Benzodiazépines à demi-vie longue (diazépam, bromazépam, clobazam)",
    texte:
      "À éviter chez le sujet âgé : risque accru de chutes, fractures, somnolence diurne, troubles mnésiques. Préférer benzodiazépine à demi-vie courte (oxazépam, lorazépam) et limiter la durée à 4 semaines maximum, avec déprescription progressive.",
  },
  {
    id: "LAR-05",
    classe: "vasodilatateur",
    titre: "Vasodilatateurs cérébraux (naftidrofuryl, vincamine, piracétam)",
    texte:
      "Service médical rendu insuffisant. Pas de bénéfice démontré dans les troubles cognitifs ou les vertiges du sujet âgé. À déprescrire systématiquement.",
  },
  {
    id: "LAR-06",
    classe: "ains",
    titre: "AINS au long cours chez sujet âgé ≥ 75 ans",
    texte:
      "Les AINS exposent au sujet âgé à un risque hémorragique digestif majoré, à une insuffisance rénale aiguë (surtout si IEC/ARA2/diurétique associés), à une décompensation d'insuffisance cardiaque et à une HTA. Préférer paracétamol en 1ère intention, et limiter les AINS à une cure courte avec IPP.",
  },
  {
    id: "LAR-07",
    classe: "alpha1-bloquant",
    titre: "Alpha-1-bloquants centraux (prazosine, alfuzosine en HTA)",
    texte:
      "Risque majeur d'hypotension orthostatique et de chutes chez le sujet âgé. Pour l'HTA, préférer IEC, ARA2, thiazidique ou inhibiteur calcique. Pour l'HBP, possible en monothérapie urologique avec surveillance TA debout/couché.",
  },
  {
    id: "LAR-08",
    classe: "antiarythmique",
    titre: "Digoxine à dose > 0,125 mg/j chez sujet âgé",
    texte:
      "Marge thérapeutique étroite et clairance rénale diminuée chez le sujet âgé. Cible digoxinémie 0,5-0,9 ng/mL. Doses > 0,125 mg/j exposent au risque toxique (troubles du rythme, troubles digestifs, troubles visuels).",
  },
  {
    id: "LAR-09",
    classe: "neuroleptique",
    titre: "Neuroleptiques au long cours chez patient dément",
    texte:
      "Sur-mortalité documentée (toutes causes, dont AVC) chez les patients déments traités par neuroleptiques. Limiter aux symptômes psycho-comportementaux sévères, à la dose minimale efficace, durée < 3 mois, avec réévaluation systématique.",
  },
  {
    id: "LAR-10",
    classe: "ipp",
    titre: "IPP au long cours sans indication claire",
    texte:
      "Au-delà de 8 semaines sans indication validée (RGO compliqué, prévention ulcère sous AINS/antiagrégant, syndrome de Zollinger-Ellison), envisager une déprescription progressive (risque d'hypomagnésémie, infections digestives, fractures, démence).",
  },
];

export const ingestLaroche = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const chunks = LAROCHE_CRITERIA.map((c) => ({
      content: `${c.id} — ${c.titre}\n\n${c.texte}\n\nSource : Liste de Laroche (médicaments potentiellement inappropriés chez le sujet âgé ≥ 75 ans), version 2015.`,
      metadata: { rule_id: c.id, classe: c.classe },
    }));
    return persistDocument({
      source: "Laroche",
      titre: "Liste de Laroche — sujet âgé ≥ 75 ans",
      version: "2015",
      url: "https://www.has-sante.fr",
      licence: "Académique — usage clinique",
      chunks,
      replace: true,
    });
  });

// ─────────────────────────────────────────────────────────────────────────────
// BDPM — top spécialités (mini-RCP synthétique)
// ─────────────────────────────────────────────────────────────────────────────

const BdpmInput = z.object({ limit: z.number().int().min(10).max(2000).default(200) });

export const ingestRcpFromBdpm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BdpmInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: specs, error } = await supabaseAdmin
      .from("bdpm_specialites")
      .select("cis, denomination, forme, voies, statut_amm, titulaire, surveillance_renforcee")
      .eq("statut_amm", "Autorisation active")
      .order("cis", { ascending: true })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    if (!specs || specs.length === 0) {
      throw new Error("Aucune spécialité BDPM trouvée. Lancez d'abord la synchro BDPM.");
    }

    const cisList = specs.map((s) => s.cis as number);
    const [atcRes, compoRes] = await Promise.all([
      supabaseAdmin.from("bdpm_atc").select("cis, code_atc, libelle_atc").in("cis", cisList),
      supabaseAdmin
        .from("bdpm_compositions")
        .select("cis, denomination_substance, dosage_substance, nature_composant")
        .in("cis", cisList),
    ]);

    const atcByCis = new Map<number, { code_atc: string; libelle_atc: string | null }>();
    for (const a of atcRes.data ?? []) {
      atcByCis.set(a.cis as number, {
        code_atc: a.code_atc as string,
        libelle_atc: (a.libelle_atc as string | null) ?? null,
      });
    }
    const compoByCis = new Map<number, Array<{ subst: string; dosage: string | null }>>();
    for (const c of compoRes.data ?? []) {
      const cis = c.cis as number;
      const nature = (c.nature_composant as string | null) ?? "";
      if (nature && !/SA/i.test(nature)) continue;
      const list = compoByCis.get(cis) ?? [];
      list.push({
        subst: (c.denomination_substance as string | null) ?? "",
        dosage: (c.dosage_substance as string | null) ?? null,
      });
      compoByCis.set(cis, list);
    }

    const chunks = specs.map((s) => {
      const cis = s.cis as number;
      const atc = atcByCis.get(cis);
      const compo = compoByCis.get(cis) ?? [];
      const dci = compo.map((c) => `${c.subst}${c.dosage ? ` ${c.dosage}` : ""}`).join(" + ") || "—";
      const content = `${s.denomination} (CIS ${cis})
DCI : ${dci}
Forme : ${s.forme ?? "—"}
Voies : ${s.voies ?? "—"}
Code ATC : ${atc?.code_atc ?? "—"}${atc?.libelle_atc ? ` (${atc.libelle_atc})` : ""}
Titulaire : ${s.titulaire ?? "—"}
Statut AMM : ${s.statut_amm ?? "—"}
Surveillance renforcée : ${s.surveillance_renforcee ? "OUI" : "non"}
Source : Base de Données Publique des Médicaments (ANSM), référentiel officiel français.`;
      return {
        content,
        metadata: { cis, code_atc: atc?.code_atc ?? null },
      };
    });

    return persistDocument({
      source: "BDPM",
      titre: `BDPM — Top ${data.limit} spécialités`,
      version: new Date().toISOString().slice(0, 10),
      url: "https://base-donnees-publique.medicaments.gouv.fr",
      licence: "Open data — Licence ouverte Etalab",
      chunks,
      replace: true,
    });
  });

// ─────────────────────────────────────────────────────────────────────────────
// Import manuel (texte collé) — pour ANSM/HAS/SPILF/etc.
// ─────────────────────────────────────────────────────────────────────────────

const ManualInput = z.object({
  source: z.string().min(1).max(100),
  titre: z.string().min(1).max(300),
  version: z.string().max(50).optional(),
  url: z.string().url().max(500).optional(),
  licence: z.string().max(200).optional(),
  text: z.string().min(50).max(500_000),
});

export const ingestText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ManualInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { chunk } = await import("./chunk.server");
    const pieces = chunk(data.text, { maxChars: 1200, overlap: 200 });
    return persistDocument({
      source: data.source,
      titre: data.titre,
      version: data.version ?? null,
      url: data.url ?? null,
      licence: data.licence ?? null,
      chunks: pieces.map((p) => ({ content: p })),
      replace: false,
    });
  });

// ─────────────────────────────────────────────────────────────────────────────
// Statut + recherche test
// ─────────────────────────────────────────────────────────────────────────────

export const getRagStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ count: docs }, { count: chunks }, { data: bySource }] = await Promise.all([
      supabaseAdmin.from("rag_documents").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("rag_chunks").select("*", { count: "exact", head: true }),
      supabaseAdmin
        .from("rag_documents")
        .select("source, titre, version, ingested_at")
        .order("ingested_at", { ascending: false })
        .limit(20),
    ]);
    return {
      documents: docs ?? 0,
      chunks: chunks ?? 0,
      bySource: bySource ?? [],
    };
  });

const SearchInput = z.object({
  q: z.string().min(2).max(500),
  topK: z.number().int().min(1).max(20).default(6),
});

export const searchRag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SearchInput.parse(d))
  .handler(async ({ data }) => {
    const { retrieveContext } = await import("./retrieve.server");
    return retrieveContext(data.q, data.topK);
  });
