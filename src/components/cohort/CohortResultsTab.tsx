import { useState, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Play, Loader2, Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { evaluateCohort, type EvaluateCohortResult } from "@/lib/cohort/evaluateCohort.functions";
import { listCohortRuns } from "@/lib/cohort/runCohortMultiModel.functions";

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

function downloadCsv(rows: EvaluateCohortResult["perPatient"], modelLabel?: string | null) {
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
  const suffix = modelLabel ? `-${modelLabel.replace(/\s+/g, "_")}` : "";
  a.href = url; a.download = `cohorte-evaluation${suffix}.csv`; a.click();
  URL.revokeObjectURL(url);
}

export function CohortResultsTab({ cohortId }: { cohortId: string }) {
  const evalFn = useServerFn(evaluateCohort);
  const runsFn = useServerFn(listCohortRuns);

  const runs = useQuery({
    queryKey: ["cohortRuns", cohortId],
    queryFn: () => runsFn({ data: { cohortId } }),
  });

  // Map clé "runTag|modelLabel" -> résultat
  const [results, setResults] = useState<Record<string, EvaluateCohortResult>>({});

  const multiRuns = useMemo(() => {
    const all = runs.data?.runs ?? [];
    // On distingue: runs taggés (multi-modèles) et legacy (run_tag null)
    return all;
  }, [runs.data]);

  const evalAll = useMutation({
    mutationFn: async () => {
      const out: Record<string, EvaluateCohortResult> = {};
      if (multiRuns.length === 0) {
        // Aucun run → on lance l'éval globale (legacy, sans filtre)
        const r = await evalFn({ data: { cohortId } });
        out["__global__"] = r;
        return out;
      }
      for (const run of multiRuns) {
        const key = `${run.runTag ?? ""}|${run.modelLabel ?? ""}`;
        try {
          const r = await evalFn({
            data: {
              cohortId,
              ...(run.runTag ? { runTag: run.runTag } : {}),
              ...(run.modelLabel ? { modelLabel: run.modelLabel } : {}),
            },
          });
          out[key] = r;
        } catch (e) {
          console.warn("eval failed for", key, e);
        }
      }
      return out;
    },
    onSuccess: (r) => { setResults(r); toast.success("Évaluations calculées"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  const entries = Object.entries(results);
  const isMulti = entries.length > 1;

  return (
    <div className="space-y-6">
      <Card className="p-4 flex items-center gap-3 flex-wrap">
        <div className="flex-1">
          <h3 className="font-semibold">Corrélation IA vs Pharmacien — Comparaison multi-modèles</h3>
          <p className="text-xs text-muted-foreground">
            {multiRuns.length === 0
              ? "Aucun run détecté — lancez d'abord la conciliation IA."
              : `${multiRuns.length} run(s) / modèle(s) disponible(s) dans cette cohorte.`}
          </p>
        </div>
        <Button onClick={() => runs.refetch()} variant="ghost" size="sm" disabled={runs.isFetching}>
          <RefreshCw className={`h-4 w-4 mr-1 ${runs.isFetching ? "animate-spin" : ""}`} /> Rafraîchir
        </Button>
        <Button onClick={() => evalAll.mutate()} disabled={evalAll.isPending}>
          {evalAll.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Play className="h-4 w-4 mr-1" />}
          Évaluer tous les modèles
        </Button>
      </Card>

      {multiRuns.length > 0 && (
        <Card className="p-4">
          <h4 className="text-sm font-semibold mb-2">Runs détectés</h4>
          <div className="flex flex-wrap gap-2">
            {multiRuns.map((r, i) => (
              <Badge key={i} variant="outline" className="font-mono text-xs">
                {r.modelLabel ?? "(legacy)"} — {r.runTag?.slice(0, 30) ?? "no-tag"} ({r.count})
              </Badge>
            ))}
          </div>
        </Card>
      )}

      {entries.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Cliquez sur « Évaluer tous les modèles » pour calculer les métriques par LLM et les comparer.
        </p>
      )}

      {isMulti && (
        <section>
          <h4 className="font-semibold mb-2">Tableau comparatif des modèles</h4>
          <Card className="p-0 overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-xs">
                <tr>
                  <th className="text-left p-2">Modèle</th>
                  <th className="text-right p-2">Précision</th>
                  <th className="text-right p-2">Rappel</th>
                  <th className="text-right p-2">F1</th>
                  <th className="text-right p-2">TP / FP / FN</th>
                  <th className="text-right p-2">Triage F1</th>
                  <th className="text-right p-2">Sévérité acc.</th>
                  <th className="text-right p-2">Patients avec gold</th>
                </tr>
              </thead>
              <tbody>
                {entries
                  .sort(([, a], [, b]) => (b.metricsIA.f1 - a.metricsIA.f1))
                  .map(([key, r]) => {
                    const label = r.modelLabel ?? key.split("|")[1] ?? "(par défaut)";
                    return (
                      <tr key={key} className="border-t">
                        <td className="p-2 font-medium">{label}</td>
                        <td className="p-2 text-right">{pct(r.metricsIA.precision)}</td>
                        <td className="p-2 text-right">{pct(r.metricsIA.recall)}</td>
                        <td className="p-2 text-right font-semibold">{pct(r.metricsIA.f1)}</td>
                        <td className="p-2 text-right text-xs">{r.metricsIA.tp}/{r.metricsIA.fp}/{r.metricsIA.fn}</td>
                        <td className="p-2 text-right">{pct(r.metricsIA.triage_ia.f1)}</td>
                        <td className="p-2 text-right">{pct(r.metricsIA.severity_llm_accuracy)}</td>
                        <td className="p-2 text-right">{r.metricsIA.patients_with_gold}/{r.metricsIA.patients}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </Card>
        </section>
      )}

      {entries.map(([key, result]) => {
        const label = result.modelLabel ?? key.split("|")[1] ?? "Résultat";
        return (
          <details key={key} className="border rounded-lg" open={!isMulti}>
            <summary className="cursor-pointer p-3 font-semibold text-sm flex items-center gap-2">
              <span>{label}</span>
              <Badge variant="outline">F1 {pct(result.metricsIA.f1)}</Badge>
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); downloadCsv(result.perPatient, label); }}
                className="ml-auto inline-flex items-center text-xs text-primary hover:underline"
              >
                <Download className="h-3 w-3 mr-1" /> CSV
              </button>
            </summary>
            <div className="p-4 space-y-4">
              <section>
                <h5 className="font-semibold mb-2 text-sm">Détection des divergences</h5>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Metric label="Precision" value={pct(result.metricsIA.precision)} hint={`TP=${result.metricsIA.tp}`} />
                  <Metric label="Recall" value={pct(result.metricsIA.recall)} hint={`FN=${result.metricsIA.fn}`} />
                  <Metric label="F1" value={pct(result.metricsIA.f1)} />
                  <Metric label="Patients" value={`${result.metricsIA.patients_with_gold}/${result.metricsIA.patients}`} hint="avec gold" />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {Object.entries(result.metricsIA.par_type).map(([t, v]) => (
                    <Badge key={t} variant="outline">{t}: TP {v.tp} · FP {v.fp} · FN {v.fn}</Badge>
                  ))}
                </div>
              </section>

              <section>
                <h5 className="font-semibold mb-2 text-sm">Triage LLM vs ML</h5>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Card className="p-3">
                    <div className="text-xs text-muted-foreground">LLM</div>
                    <div className="text-sm mt-1">P {pct(result.metricsIA.triage_ia.precision)} · R {pct(result.metricsIA.triage_ia.recall)} · F1 {pct(result.metricsIA.triage_ia.f1)}</div>
                  </Card>
                  <Card className="p-3">
                    <div className="text-xs text-muted-foreground">ML (logistique)</div>
                    <div className="text-sm mt-1">P {pct(result.metricsML.triage_ml.precision)} · R {pct(result.metricsML.triage_ml.recall)} · F1 {pct(result.metricsML.triage_ml.f1)}</div>
                  </Card>
                </div>
              </section>

              <section>
                <h5 className="font-semibold mb-2 text-sm">Sévérité — LLM vs ML</h5>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Metric label="LLM accuracy" value={pct(result.metricsIA.severity_llm_accuracy)} hint={`${result.metricsIA.severity_pairs} paire(s)`} />
                  <Metric label="ML accuracy" value={pct(result.metricsML.severity_ml_accuracy)} hint={`${result.metricsIA.severity_pairs} paire(s)`} />
                </div>
              </section>

              <section>
                <h5 className="font-semibold mb-2 text-sm">Détail par patient</h5>
                <Card className="p-0 overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted text-xs">
                      <tr>
                        <th className="text-left p-2">Patient</th>
                        <th className="text-right p-2">IA</th>
                        <th className="text-right p-2">Pharma</th>
                        <th className="text-right p-2">TP/FP/FN</th>
                        <th className="text-right p-2">F1</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.perPatient.map((p) => (
                        <tr key={p.patient_id} className="border-t">
                          <td className="p-2 font-medium">{p.patient_name}</td>
                          <td className="p-2 text-right">{p.ia_divergences}</td>
                          <td className="p-2 text-right">{p.pharma_divergences}</td>
                          <td className="p-2 text-right">{p.tp}/{p.fp}/{p.fn}</td>
                          <td className="p-2 text-right">{pct(p.f1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              </section>
            </div>
          </details>
        );
      })}
    </div>
  );
}
