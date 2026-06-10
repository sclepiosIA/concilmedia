import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Trash2, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { evaluatePrecision, type EvaluationMetrics } from "@/lib/conciliation/evaluate.functions";
import { EvaluationMatrix } from "./EvaluationMatrix";
import { toast } from "sonner";

const BASELINE_KEY = "concilmedia:eval:baseline";

type Baseline = { metrics: EvaluationMetrics; capturedAt: string; label: string };

export function BeforeAfterEvaluation() {
  const run = useServerFn(evaluatePrecision);
  const [loading, setLoading] = useState(false);
  const [current, setCurrent] = useState<EvaluationMetrics | null>(null);
  const [baseline, setBaseline] = useState<Baseline | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(BASELINE_KEY);
      if (raw) setBaseline(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  const handleRun = async () => {
    setLoading(true);
    try {
      const m = await run({ data: {} });
      setCurrent(m);
    } catch (e) {
      toast.error("Échec de l'évaluation", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  };

  const saveBaseline = (label: string) => {
    if (!current) return;
    const b: Baseline = { metrics: current, capturedAt: new Date().toISOString(), label };
    localStorage.setItem(BASELINE_KEY, JSON.stringify(b));
    setBaseline(b);
    toast.success(`Baseline « ${label} » enregistrée`);
  };

  const clearBaseline = () => {
    localStorage.removeItem(BASELINE_KEY);
    setBaseline(null);
    toast.success("Baseline supprimée");
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Évaluation avant/après — Matching DCI</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Lance <code>evaluatePrecision</code> sur l'ensemble des patients synthétiques. Sauvegarde un instantané « avant » (par ex. avant le Bloc&nbsp;3 normDci/parseDose), modifie le code, puis relance pour mesurer le gain.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleRun} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Lancer l'évaluation
            </Button>
            {current && (
              <>
                <Button variant="outline" onClick={() => saveBaseline("Avant Bloc 3")}>
                  <Save className="h-4 w-4 mr-2" /> Enregistrer comme « Avant »
                </Button>
                <Button variant="outline" onClick={() => saveBaseline("Après Bloc 3")}>
                  <Save className="h-4 w-4 mr-2" /> Enregistrer comme « Après »
                </Button>
              </>
            )}
            {baseline && (
              <Button variant="ghost" onClick={clearBaseline}>
                <Trash2 className="h-4 w-4 mr-2" /> Effacer baseline
              </Button>
            )}
          </div>
          {baseline && (
            <div className="text-xs text-muted-foreground">
              Baseline active : <Badge variant="secondary">{baseline.label}</Badge>{" "}
              capturée le {new Date(baseline.capturedAt).toLocaleString("fr-FR")} —{" "}
              P {(baseline.metrics.precision * 100).toFixed(1)}% · R {(baseline.metrics.recall * 100).toFixed(1)}% · F1 {(baseline.metrics.f1 * 100).toFixed(1)}%
            </div>
          )}
        </CardContent>
      </Card>

      {current && baseline && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Delta vs baseline « {baseline.label} »</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <DeltaTile label="Précision" before={baseline.metrics.precision} after={current.precision} />
              <DeltaTile label="Rappel" before={baseline.metrics.recall} after={current.recall} />
              <DeltaTile label="F1-score" before={baseline.metrics.f1} after={current.f1} />
            </div>
          </CardContent>
        </Card>
      )}

      {current && (
        <div>
          <h3 className="text-sm font-semibold mb-2">Résultats courants</h3>
          <EvaluationMatrix m={current} />
        </div>
      )}
    </div>
  );
}

function DeltaTile({ label, before, after }: { label: string; before: number; after: number }) {
  const delta = after - before;
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const Icon = delta > 0.001 ? TrendingUp : delta < -0.001 ? TrendingDown : Minus;
  const color = delta > 0.001 ? "text-green-600" : delta < -0.001 ? "text-red-600" : "text-muted-foreground";
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="flex items-baseline gap-2 mt-1">
        <span className="text-2xl font-bold">{pct(after)}</span>
        <span className={`text-sm font-medium inline-flex items-center gap-1 ${color}`}>
          <Icon className="h-3.5 w-3.5" />
          {delta >= 0 ? "+" : ""}{(delta * 100).toFixed(1)} pts
        </span>
      </div>
      <div className="text-xs text-muted-foreground mt-1">Avant : {pct(before)}</div>
    </div>
  );
}
