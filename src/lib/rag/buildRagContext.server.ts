// Construit le contexte RAG à injecter dans le prompt LLM à partir du dossier patient.
// Stratégie : génère N requêtes ciblées (interactions de classes ATC présentes,
// comorbidités majeures, DCI haut risque, âge élevé) → fusionne les passages
// récupérés → formate la section "Références opposables".

import { retrieveContext, type RagHit } from "./retrieve.server";
import { classifyDci, classifyByAtc, HIGH_RISK_CLASSES, ATC_LABELS, type AtcClassKey } from "@/lib/conciliation/atcInteractions";

export interface RagPassage {
  ref: string; // ex: "S1"
  source: string;
  titre: string;
  version: string | null;
  content: string;
  similarity: number;
}

export interface RagContextBuilt {
  passages: RagPassage[];
  asPromptSection: string;
}

interface DossierLite {
  patient: { age?: number | null; sexe?: string | null };
  comorbidites: Array<{ libelle?: string | null }>;
  traitements_habituels: Array<{ dci?: string | null; medicament?: string | null; nom_commercial?: string | null; code_atc?: string | null }>;
  prescriptions_hospitalieres: Array<{ dci?: string | null; medicament?: string | null; nom_commercial?: string | null; code_atc?: string | null }>;
}

function dedupe<T>(arr: T[], key: (x: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const v of arr) {
    const k = key(v);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

function buildQueries(dossier: DossierLite): string[] {
  const queries: string[] = [];
  const meds = [...dossier.traitements_habituels, ...dossier.prescriptions_hospitalieres];

  // 1) Une query par DCI haut risque
  const classes = new Set<AtcClassKey>();
  const dcis: string[] = [];
  for (const m of meds) {
    const dci = (m.dci || m.medicament || m.nom_commercial || "").trim();
    if (!dci) continue;
    dcis.push(dci);
    const cls = m.code_atc ? classifyByAtc(m.code_atc, dci) : classifyDci(dci);
    classes.add(cls);
    if (HIGH_RISK_CLASSES.includes(cls)) {
      queries.push(`Précautions et adaptation posologique du ${dci} (${ATC_LABELS[cls]})`);
    }
  }

  // 2) Une query par paire de classes co-présentes (interaction potentielle)
  const classArr = Array.from(classes);
  for (let i = 0; i < classArr.length; i++) {
    for (let j = i + 1; j < classArr.length; j++) {
      queries.push(`Interaction médicamenteuse ${ATC_LABELS[classArr[i]]} et ${ATC_LABELS[classArr[j]]}`);
    }
  }

  // 3) Comorbidités majeures
  for (const c of dossier.comorbidites) {
    const libelle = (c.libelle ?? "").trim();
    if (!libelle) continue;
    if (/insuffisance rénale|ckd|dfg|néphropathie/i.test(libelle)) {
      queries.push(`Médicaments à adapter en cas d'insuffisance rénale (${libelle})`);
    } else if (/insuffisance hépatique|cirrhose|child/i.test(libelle)) {
      queries.push(`Médicaments à éviter en cas d'insuffisance hépatique (${libelle})`);
    } else if (/insuffisance cardiaque|hf|nyha/i.test(libelle)) {
      queries.push(`Précautions médicamenteuses en cas d'insuffisance cardiaque`);
    } else if (/dément|alzheimer|trouble cognitif/i.test(libelle)) {
      queries.push(`Médicaments à éviter chez le patient dément (sur-mortalité)`);
    }
  }

  // 4) Âge élevé → Laroche / STOPP
  if ((dossier.patient.age ?? 0) >= 75 && dcis.length > 0) {
    queries.push(`Médicaments potentiellement inappropriés chez sujet âgé ≥ 75 ans (Laroche, STOPP/START)`);
  }

  // Plafond + déduplication exacte
  const unique = Array.from(new Set(queries.map((q) => q.trim()))).filter(Boolean);
  return unique.slice(0, 8);
}

export async function buildRagContext(dossier: DossierLite, options?: { episodeId?: string }): Promise<RagContextBuilt> {
  const queries = buildQueries(dossier);
  if (queries.length === 0) return { passages: [], asPromptSection: "" };

  // Lance les retrievals en parallèle (1 par query, top-3 chacun)
  const settled = await Promise.allSettled(
    queries.map((q) => retrieveContext(q, 3, { episodeId: options?.episodeId })),
  );
  const allHits: RagHit[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled") allHits.push(...r.value.hits);
  }
  // Trie par similarité décroissante, dédup par chunk id, garde top 12
  const sorted = [...allHits].sort((a, b) => b.similarity - a.similarity);
  const unique = dedupe(sorted, (h) => h.id).slice(0, 12);

  const passages: RagPassage[] = unique.map((h, i) => ({
    ref: `S${i + 1}`,
    source: h.source,
    titre: h.titre,
    version: h.version,
    content: h.content,
    similarity: h.similarity,
  }));

  const lines = passages.map(
    (p) =>
      `[${p.ref}] ${p.source}${p.version ? ` (${p.version})` : ""} — ${p.titre}\n${p.content}`,
  );
  const asPromptSection = passages.length === 0
    ? ""
    : `# Références opposables (à citer dans le champ \"reference\" de chaque alerte)\n\n${lines.join("\n\n---\n\n")}\n`;

  return { passages, asPromptSection };
}
