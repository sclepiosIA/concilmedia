import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Play, Loader2, Download } from "lucide-react";
import { toast } from "sonner";
import { evaluateCohort, type EvaluateCohortResult } from "@/lib/cohort/evaluateCohort.functions";

function pct(x: number | null | undefined) {
  if (x == null) return "—";
  return `${(x * 100).toFixed(1)}%`;
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
    </Card>
  );
}

function downloadCsv(rows: EvaluateCohortResult["perPatient"]) {
  const headers = ["patient", "ia_divergences", "pharma_divergences", "tp", "fp", "fn", "precision", "recall", "f1", "ia_triage", "pharma_triage", "ml_triage", "ml_score"];
  const csv = [headers.join(",")].concat(
    rows.map((r) => [
      JSON.stringify(r.patient_name),
      r.ia_divergences, r.pharma_divergences,
      r.tp, r.fp, r.fn,
      r.precision.toFixed(3), r.recall.toFixed(3), r.f1.toFixed(3),
      r.ia_triage_complexe ?? "", r.pharma_triage_complexe ?? "", r.ml_triage_complexe ?? "",
      r.ml_triage_score?.toFixed(3) ?? "",
    ].join(",")),
  ).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `cohorte-evaluation.csv`; a.click();
  URL.revokeObjectURL(url);
}

export function CohortResultsTab({ cohortId }: { cohortId: string }) {
  const evalFn = useServerFn(evaluateCohort);
  const [result, setResult] = useState<EvaluateCohortResult | null>(null);
  const run = useMutation({
    mutationFn: async () => evalFn({ data: { cohortId } }),
    onSuccess: (r) => { setResult(r); toast.success("Évaluation calculée"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  return (
    <div className="space-y-6">
      <Card className="p-4 flex items-center gap-3 flex-wrap">
        <div className="flex-1">
          <h3 className="font-semibold">Corrélation IA vs Pharmacien + Benchmark LLM vs ML</h3>
          <p className="text-xs text-muted-foreground">Compare les divergences détectées par l'IA aux PDF pharmacien (gold standard) et calcule les baselines ML.</p>
        </div>
        <Button onClick={() => run.mutate()} disabled={run.isPending}>
          {run.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Play className="h-4 w-4 mr-1" />}
          Lancer l'évaluation
        </Button>
        {result && (
          <Button variant="outline" onClick={() => downloadCsv(result.perPatient)}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
        )}
      </Card>

      {!result && <p className="text-sm text-muted-foreground">Importez des fichiers patients, lancez la conciliation IA, uploadez les PDF pharmacien, puis lancez l'évaluation.</p>}

      {result && (
        <>
          <section>
            <h4 className="font-semibold mb-2">Détection des divergences (IA vs Pharmacien)</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Metric label="Precision" value={pct(result.metricsIA.precision)} hint={`TP=${result.metricsIA.tp} / TP+FP=${result.metricsIA.tp + result.metricsIA.fp}`} />
              <Metric label="Recall" value={pct(result.metricsIA.recall)} hint={`TP=${result.metricsIA.tp} / TP+FN=${result.metricsIA.tp + result.metricsIA.fn}`} />
              <Metric label="F1" value={pct(result.metricsIA.f1)} />
              <Metric label="Patients" value={`${result.metricsIA.patients_with_gold}/${result.metricsIA.patients}`} hint="avec gold standard" />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(result.metricsIA.par_type).map(([t, v]) => (
                <Badge key={t} variant="outline">{t}: TP {v.tp} · FP {v.fp} · FN {v.fn}</Badge>
              ))}
            </div>
          </section>

          <section>
            <h4 className="font-semibold mb-2">Triage patient complexe — LLM vs ML</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Card className="p-4">
                <div className="text-xs text-muted-foreground">LLM (IA basée sur ≥3 divergences)</div>
                <div className="mt-2 text-sm">Precision {pct(result.metricsIA.triage_ia.precision)} · Recall {pct(result.metricsIA.triage_ia.recall)} · F1 {pct(result.metricsIA.triage_ia.f1)}</div>
                <div className="text-xs text-muted-foreground mt-1">TP {result.metricsIA.triage_ia.tp} · FP {result.metricsIA.triage_ia.fp} · FN {result.metricsIA.triage_ia.fn} · TN {result.metricsIA.triage_ia.tn}</div>
              </Card>
              <Card className="p-4">
                <div className="text-xs text-muted-foreground">ML (logistique calibrée)</div>
                <div className="mt-2 text-sm">Precision {pct(result.metricsML.triage_ml.precision)} · Recall {pct(result.metricsML.triage_ml.recall)} · F1 {pct(result.metricsML.triage_ml.f1)}</div>
                <div className="text-xs text-muted-foreground mt-1">TP {result.metricsML.triage_ml.tp} · FP {result.metricsML.triage_ml.fp} · FN {result.metricsML.triage_ml.fn} · TN {result.metricsML.triage_ml.tn}</div>
              </Card>
            </div>
          </section>

          <section>
            <h4 className="font-semibold mb-2">Sévérité divergences — LLM vs ML</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Metric label="LLM accuracy" value={pct(result.metricsIA.severity_llm_accuracy)} hint={`${result.metricsIA.severity_pairs} paire(s) appariée(s)`} />
              <Metric label="ML accuracy (high vs low)" value={pct(result.metricsML.severity_ml_accuracy)} hint={`${result.metricsIA.severity_pairs} paire(s)`} />
            </div>
          </section>

          <section>
            <h4 className="font-semibold mb-2">Détail par patient</h4>
            <Card className="p-0 overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted text-xs">
                  <tr>
                    <th className="text-left p-2">Patient</th>
                    <th className="text-right p-2">IA</th>
                    <th className="text-right p-2">Pharma</th>
                    <th className="text-right p-2">TP/FP/FN</th>
                    <th className="text-right p-2">P</th>
                    <th className="text-right p-2">R</th>
                    <th className="text-right p-2">F1</th>
                    <th className="text-center p-2">Triage IA/Pharma/ML</th>
                  </tr>
                </thead>
                <tbody>
                  {result.perPatient.map((p) => (
                    <tr key={p.patient_id} className="border-t">
                      <td className="p-2 font-medium">{p.patient_name}</td>
                      <td className="p-2 text-right">{p.ia_divergences}</td>
                      <td className="p-2 text-right">{p.pharma_divergences}</td>
                      <td className="p-2 text-right">{p.tp}/{p.fp}/{p.fn}</td>
                      <td className="p-2 text-right">{pct(p.precision)}</td>
                      <td className="p-2 text-right">{pct(p.recall)}</td>
                      <td className="p-2 text-right">{pct(p.f1)}</td>
                      <td className="p-2 text-center text-xs">
                        {p.ia_triage_complexe ? "✓" : "·"} / {p.pharma_triage_complexe === null ? "?" : p.pharma_triage_complexe ? "✓" : "·"} / {p.ml_triage_complexe ? "✓" : "·"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
