import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GitCompareArrows, Home, Hospital, ArrowRight, AlertTriangle, CheckCircle2, Plus, Minus } from "lucide-react";

type Row = {
  dci: string;
  domicile: { dosage?: string | null; posologie?: string | null } | null;
  hopital: { dosage?: string | null; posologie?: string | null } | null;
};

function buildPosoDomicile(t: {
  posologie_matin?: number | string | null;
  posologie_midi?: number | string | null;
  posologie_soir?: number | string | null;
  posologie_coucher?: number | string | null;
}) {
  const parts = [
    t.posologie_matin && `${t.posologie_matin} M`,
    t.posologie_midi && `${t.posologie_midi} Mi`,
    t.posologie_soir && `${t.posologie_soir} S`,
    t.posologie_coucher && `${t.posologie_coucher} C`,
  ].filter(Boolean);
  return parts.length ? parts.join(" / ") : null;
}

function normalizeDci(s: string | null | undefined) {
  return (s ?? "").toLowerCase().replace(/\(.*?\)/g, "").trim();
}

export function ComparaisonTable({ episodeId, patientId }: { episodeId: string; patientId: string }) {
  const { data: traitements = [] } = useQuery({
    queryKey: ["traitements", patientId],
    queryFn: async () =>
      (await supabase.from("traitements_habituels").select("*").eq("patient_id", patientId).eq("actif", true)).data ?? [],
  });
  const { data: prescriptions = [] } = useQuery({
    queryKey: ["prescriptions", episodeId],
    queryFn: async () =>
      (await supabase.from("prescriptions_hospitalieres").select("*").eq("episode_id", episodeId).eq("actif", true)).data ?? [],
  });

  // Build map by normalized DCI
  const map = new Map<string, Row>();
  for (const t of traitements) {
    const dciRaw = t.dci || t.nom_commercial || "Inconnu";
    const key = normalizeDci(dciRaw);
    map.set(key, {
      dci: dciRaw,
      domicile: {
        dosage: t.dosage ? `${t.dosage}${t.dosage_unite ? " " + t.dosage_unite : ""}` : null,
        posologie: buildPosoDomicile(t),
      },
      hopital: null,
    });
  }
  for (const p of prescriptions) {
    const dciRaw = p.medicament ?? "Inconnu";
    const key = normalizeDci(dciRaw);
    const existing = map.get(key);
    // Try fuzzy match: any traitement DCI contained in or containing the prescription
    const fuzzyKey = !existing
      ? [...map.keys()].find((k) => k && (k.includes(key) || key.includes(k)))
      : null;
    if (existing) {
      existing.hopital = { dosage: p.dosage, posologie: p.posologie };
    } else if (fuzzyKey) {
      map.get(fuzzyKey)!.hopital = { dosage: p.dosage, posologie: p.posologie };
    } else {
      map.set(key, {
        dci: dciRaw,
        domicile: null,
        hopital: { dosage: p.dosage, posologie: p.posologie },
      });
    }
  }

  const rows = [...map.values()].sort((a, b) => a.dci.localeCompare(b.dci));

  const statusFor = (r: Row) => {
    if (r.domicile && !r.hopital) return { label: "Omission", icon: Minus, cls: "bg-destructive/15 text-destructive border-destructive/30" };
    if (!r.domicile && r.hopital) return { label: "Ajout", icon: Plus, cls: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30" };
    const sameDose = (r.domicile?.dosage ?? "").trim().toLowerCase() === (r.hopital?.dosage ?? "").trim().toLowerCase();
    if (!sameDose) return { label: "Dose modifiée", icon: AlertTriangle, cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30" };
    return { label: "Identique", icon: CheckCircle2, cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" };
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <GitCompareArrows className="h-4 w-4 text-primary" />
          Comparaison Domicile ↔ Hôpital ({rows.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground p-4">Aucun médicament à comparer.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left p-3 font-semibold">DCI</th>
                  <th className="text-left p-3 font-semibold">
                    <span className="inline-flex items-center gap-1"><Home className="h-3 w-3" /> Domicile — Dosage</span>
                  </th>
                  <th className="text-left p-3 font-semibold">Domicile — Posologie</th>
                  <th className="w-6 p-0"></th>
                  <th className="text-left p-3 font-semibold">
                    <span className="inline-flex items-center gap-1"><Hospital className="h-3 w-3" /> Hôpital — Dosage</span>
                  </th>
                  <th className="text-left p-3 font-semibold">Hôpital — Posologie</th>
                  <th className="text-left p-3 font-semibold">Divergence</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r, i) => {
                  const s = statusFor(r);
                  const Icon = s.icon;
                  return (
                    <tr key={i} className="hover:bg-muted/30">
                      <td className="p-3 font-medium">{r.dci}</td>
                      <td className="p-3 text-muted-foreground">{r.domicile?.dosage ?? <span className="opacity-40">—</span>}</td>
                      <td className="p-3 text-muted-foreground">{r.domicile?.posologie ?? <span className="opacity-40">—</span>}</td>
                      <td className="p-0 text-muted-foreground"><ArrowRight className="h-3.5 w-3.5 mx-auto opacity-50" /></td>
                      <td className="p-3 text-muted-foreground">{r.hopital?.dosage ?? <span className="opacity-40">—</span>}</td>
                      <td className="p-3 text-muted-foreground">{r.hopital?.posologie ?? <span className="opacity-40">—</span>}</td>
                      <td className="p-3">
                        <Badge variant="outline" className={`text-[10px] ${s.cls}`}>
                          <Icon className="h-3 w-3 mr-1" /> {s.label}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
