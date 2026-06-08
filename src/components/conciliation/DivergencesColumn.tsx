import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { MedicationConciliation } from "@/hooks/useMedicationReconciliation";
import { GRAVITE_LABEL, GRAVITE_COLOR, type Gravite } from "@/lib/clinical/complexityScore";

const typeLabel: Record<string, string> = {
  omission: "Omission",
  ajout: "Ajout",
  modification_dose: "Dose modifiée",
  modification_freq: "Fréquence",
  duplication: "Duplication",
  aucune: "—",
};

export function DivergencesColumn({ conciliations }: { conciliations: MedicationConciliation[] }) {
  const open = conciliations.filter((c) => c.statut !== "resolu");
  const resolved = conciliations.filter((c) => c.statut === "resolu");

  return (
    <Card className="border-amber-200/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Divergences ({conciliations.length})
          </span>
          {resolved.length > 0 && (
            <span className="text-xs font-normal text-emerald-600 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> {resolved.length} résolue(s)
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {conciliations.length === 0 && (
          <p className="text-xs text-muted-foreground py-2">
            Aucune divergence détectée. Importez une ordonnance pour démarrer l'analyse.
          </p>
        )}
        {open.map((c) => (
          <div key={c.id} className="border rounded-md p-2 bg-amber-50/40 dark:bg-amber-950/10">
            <div className="flex items-center gap-1 flex-wrap mb-1">
              {c.gravite && (
                <Badge variant="outline" className={`text-[10px] ${GRAVITE_COLOR[c.gravite as Gravite]}`}>
                  {GRAVITE_LABEL[c.gravite as Gravite]}
                </Badge>
              )}
              <Badge variant="destructive" className="text-[10px]">{typeLabel[c.type_divergence] ?? c.type_divergence}</Badge>
            </div>
            <div className="font-medium text-sm leading-tight">{c.medication_domicile.dci}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {c.type_divergence === "omission"
                ? "Non prescrit à l'hôpital"
                : c.medication_hospitalisation
                  ? `${c.medication_domicile.dosage ?? "?"} → ${c.medication_hospitalisation.dosage ?? "?"}`
                  : null}
            </div>
          </div>
        ))}
        {resolved.map((c) => (
          <div key={c.id} className="border rounded-md p-2 opacity-60">
            <div className="flex items-center gap-1 flex-wrap mb-1">
              <Badge variant="secondary" className="text-[10px]">
                <CheckCircle2 className="h-3 w-3 mr-1" /> Résolue
              </Badge>
              <Badge variant="outline" className="text-[10px]">{typeLabel[c.type_divergence]}</Badge>
            </div>
            <div className="text-sm">{c.medication_domicile.dci}</div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
