// Whitelist de molécules à forte biodisponibilité orale (≥ ~80%) ou avec relais
// PO documenté (SPILF/SFAR/HAS). Sert au flag déterministe IV→PO.

export type IvPoCandidate = {
  dci: string;
  biodisponibilite_po: number; // 0..1
  posologie_po_equivalente?: string;
  source?: string;
};

export const IV_TO_PO_CANDIDATES: IvPoCandidate[] = [
  { dci: "levofloxacine", biodisponibilite_po: 0.99, posologie_po_equivalente: "500 mg PO 1×/j", source: "SPILF" },
  { dci: "ciprofloxacine", biodisponibilite_po: 0.7, posologie_po_equivalente: "500-750 mg PO 2×/j", source: "SPILF" },
  { dci: "moxifloxacine", biodisponibilite_po: 0.9, posologie_po_equivalente: "400 mg PO 1×/j", source: "SPILF" },
  { dci: "metronidazole", biodisponibilite_po: 0.99, posologie_po_equivalente: "500 mg PO 3×/j", source: "SPILF" },
  { dci: "linezolide", biodisponibilite_po: 1.0, posologie_po_equivalente: "600 mg PO 2×/j", source: "SPILF" },
  { dci: "fluconazole", biodisponibilite_po: 0.9, posologie_po_equivalente: "même dose PO", source: "SPILF" },
  { dci: "voriconazole", biodisponibilite_po: 0.96 },
  { dci: "rifampicine", biodisponibilite_po: 0.95 },
  { dci: "clindamycine", biodisponibilite_po: 0.9 },
  { dci: "doxycycline", biodisponibilite_po: 0.95 },
  { dci: "paracetamol", biodisponibilite_po: 0.9, posologie_po_equivalente: "1 g PO/IV équiv.", source: "HAS" },
  { dci: "omeprazole", biodisponibilite_po: 0.65 },
  { dci: "esomeprazole", biodisponibilite_po: 0.9 },
  { dci: "pantoprazole", biodisponibilite_po: 0.77 },
  { dci: "prednisone", biodisponibilite_po: 0.92 },
  { dci: "prednisolone", biodisponibilite_po: 0.9 },
  { dci: "methylprednisolone", biodisponibilite_po: 0.8 },
  { dci: "tramadol", biodisponibilite_po: 0.7 },
  { dci: "morphine", biodisponibilite_po: 0.3, posologie_po_equivalente: "Ratio IV:PO = 1:3" },
  { dci: "ondansetron", biodisponibilite_po: 0.6 },
];

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .trim();
}

const IV_ROUTES = ["iv", "ivl", "ivd", "perfusion", "intraveineuse", "intra veineuse"];

export function isIvRoute(voie: string | null | undefined): boolean {
  if (!voie) return false;
  const v = normalize(voie);
  return IV_ROUTES.some((r) => v.includes(r));
}

export function findIvPoCandidate(dciOrName: string | null | undefined): IvPoCandidate | null {
  if (!dciOrName) return null;
  const n = " " + normalize(dciOrName) + " ";
  for (const c of IV_TO_PO_CANDIDATES) {
    if (n.includes(" " + c.dci + " ")) return c;
  }
  return null;
}

export type IvPoFlag = {
  medicament: string;
  voie_actuelle: string;
  biodisponibilite_po: number;
  posologie_po_equivalente?: string;
  source?: string;
};

/** Filtre des prescriptions hospitalières les candidats IV→PO. */
export function detectIvPoCandidates(
  prescriptions: Array<Record<string, unknown>>,
): IvPoFlag[] {
  const out: IvPoFlag[] = [];
  for (const p of prescriptions) {
    const voie = (p.voie_administration as string | null) ?? null;
    if (!isIvRoute(voie)) continue;
    const name =
      (p.dci as string | null) ||
      (p.medicament as string | null) ||
      (p.nom_commercial as string | null) ||
      "";
    const cand = findIvPoCandidate(name);
    if (!cand) continue;
    out.push({
      medicament: name,
      voie_actuelle: voie ?? "IV",
      biodisponibilite_po: cand.biodisponibilite_po,
      posologie_po_equivalente: cand.posologie_po_equivalente,
      source: cand.source,
    });
  }
  return out;
}
