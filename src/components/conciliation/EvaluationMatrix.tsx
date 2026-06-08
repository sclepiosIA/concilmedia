import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { EvaluationMetrics } from "@/lib/conciliation/evaluate.functions";

export function EvaluationMatrix({ m }: { m: EvaluationMetrics }) {
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Précision</CardTitle></CardHeader>
        <CardContent>
          <div className={`text-3xl font-bold ${m.precision >= 0.8 ? "text-green-600" : "text-amber-600"}`}>{pct(m.precision)}</div>
          <p className="text-xs text-muted-foreground mt-1">Cible mémoire ≥ 80%</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Rappel</CardTitle></CardHeader>
        <CardContent><div className="text-3xl font-bold">{pct(m.recall)}</div></CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">F1-score</CardTitle></CardHeader>
        <CardContent><div className="text-3xl font-bold">{pct(m.f1)}</div></CardContent>
      </Card>

      <Card className="md:col-span-3">
        <CardHeader className="pb-3"><CardTitle className="text-base">Matrice de confusion</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 text-center text-sm">
            <div className="p-3 rounded-md bg-green-50 border">
              <div className="text-xs text-muted-foreground">Vrais positifs</div>
              <div className="text-2xl font-bold text-green-700">{m.true_positives}</div>
            </div>
            <div className="p-3 rounded-md bg-amber-50 border">
              <div className="text-xs text-muted-foreground">Faux positifs</div>
              <div className="text-2xl font-bold text-amber-700">{m.false_positives}</div>
            </div>
            <div className="p-3 rounded-md bg-red-50 border">
              <div className="text-xs text-muted-foreground">Faux négatifs</div>
              <div className="text-2xl font-bold text-red-700">{m.false_negatives}</div>
            </div>
          </div>
          <div className="text-xs text-muted-foreground mt-3">
            Sur {m.episodes_evalues} épisode(s) — {m.total_truth_dnis} DNI attendues, {m.detected_dnis} détectées
          </div>
        </CardContent>
      </Card>

      <Card className="md:col-span-3">
        <CardHeader className="pb-3"><CardTitle className="text-base">Par type de divergence</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Object.keys(m.par_type).length === 0 && <p className="text-sm text-muted-foreground">Aucune donnée.</p>}
            {Object.entries(m.par_type).map(([type, v]) => {
              const prec = v.tp + v.fp === 0 ? 0 : v.tp / (v.tp + v.fp);
              return (
                <div key={type} className="flex items-center justify-between border rounded-md p-2">
                  <div className="font-medium text-sm">{type}</div>
                  <div className="flex gap-2 text-xs">
                    <Badge variant="outline" className="bg-green-50">VP {v.tp}</Badge>
                    <Badge variant="outline" className="bg-amber-50">FP {v.fp}</Badge>
                    <Badge variant="outline" className="bg-red-50">FN {v.fn}</Badge>
                    <Badge>{(prec * 100).toFixed(0)}%</Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
