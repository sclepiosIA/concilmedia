import { Card, CardContent } from "@/components/ui/card";
import { GitCompare, PackageMinus, PlusCircle, Sliders, Clock } from "lucide-react";
import type { MedicationConciliation } from "@/hooks/useMedicationReconciliation";

const TYPE_META: Record<string, { label: string; icon: typeof PackageMinus; tone: string }> = {
  omission: { label: "Manquants", icon: PackageMinus, tone: "bg-red-50 border-red-200 text-red-900" },
  ajout: { label: "Ajoutés", tone: "bg-blue-50 border-blue-200 text-blue-900", icon: PlusCircle },
  modification_dose: { label: "Dosage différent", icon: Sliders, tone: "bg-amber-50 border-amber-200 text-amber-900" },
  modification_freq: { label: "Fréquence différente", icon: Clock, tone: "bg-amber-50 border-amber-200 text-amber-900" },
  duplication: { label: "Doublons", icon: GitCompare, tone: "bg-orange-50 border-orange-200 text-orange-900" },
};

export function DivergencesSummaryCard({ conciliations }: { conciliations: MedicationConciliation[] }) {
  const counts: Record<string, number> = {};
  let critiques = 0, modere = 0, mineur = 0;
  for (const c of conciliations) {
    if (!c.type_divergence || c.type_divergence === "aucune") continue;
    counts[c.type_divergence] = (counts[c.type_divergence] ?? 0) + 1;
    if (c.gravite === "critique" || c.gravite === "majeur") critiques++;
    else if (c.gravite === "modere") modere++;
    else mineur++;
  }
  const total = critiques + modere + mineur;
  const statusTone = total === 0
    ? "bg-green-50 border-green-300 text-green-900"
    : critiques > 0 ? "bg-red-50 border-red-300 text-red-900"
    : "bg-amber-50 border-amber-300 text-amber-900";
  const statusLabel = total === 0
    ? "Aucune divergence détectée"
    : critiques > 0 ? `${critiques} divergence(s) critique(s) à traiter`
    : `${total} divergence(s) à évaluer`;

  return (
    <Card className={`border-2 ${statusTone}`}>
      <CardContent className="py-3 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <GitCompare className="h-4 w-4" /> Détection des divergences
          </div>
          <div className="text-sm font-medium">{statusLabel}</div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {Object.entries(TYPE_META).map(([key, meta]) => {
            const Icon = meta.icon;
            const n = counts[key] ?? 0;
            return (
              <div key={key} className={`rounded-md border p-2 flex items-center gap-2 ${n > 0 ? meta.tone : "bg-white text-muted-foreground"}`}>
                <Icon className="h-4 w-4 shrink-0" />
                <div className="min-w-0">
                  <div className="text-lg font-bold leading-none">{n}</div>
                  <div className="text-[11px] leading-tight">{meta.label}</div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-2 flex-wrap text-xs">
          <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-200">● Critique : {critiques}</span>
          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">● Modérée : {modere}</span>
          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">● Mineure : {mineur}</span>
        </div>
      </CardContent>
    </Card>
  );
}
