import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listDatasets, buildDniDataset } from "@/lib/eval/dataset.functions";
import {
  runEvaluation,
  listRuns,
  getRunDetail,
  compareToBaseline,
} from "@/lib/eval/runner.functions";
import { listProviders } from "@/lib/admin/ai.functions";

export const Route = createFileRoute("/_authenticated/admin/ai/eval")({
  component: AdminAiEval,
  head: () => ({ meta: [{ title: "Banc d'essai LLM — ConcilMed" }] }),
});

const LOVABLE_MODELS = [
  "google/gemini-3-flash-preview",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-pro",
  "openai/gpt-5-mini",
  "openai/gpt-5",
];

function AdminAiEval() {
  const qc = useQueryClient();
  const listDatasetsFn = useServerFn(listDatasets);
  const buildDniFn = useServerFn(buildDniDataset);
  const runEvalFn = useServerFn(runEvaluation);
  const listRunsFn = useServerFn(listRuns);
  const listProvidersFn = useServerFn(listProviders);
  const getRunDetailFn = useServerFn(getRunDetail);
  const compareFn = useServerFn(compareToBaseline);

  const datasetsQ = useQuery({ queryKey: ["eval-datasets"], queryFn: () => listDatasetsFn() });
  const runsQ = useQuery({ queryKey: ["eval-runs"], queryFn: () => listRunsFn({ data: {} }) });
  const providersQ = useQuery({ queryKey: ["admin-ai-providers"], queryFn: () => listProvidersFn() });

  const [selectedDataset, setSelectedDataset] = useState<string>("");
  const [selectedModels, setSelectedModels] = useState<string[]>([LOVABLE_MODELS[0]]);
  const [detailRunId, setDetailRunId] = useState<string | null>(null);

  const detailQ = useQuery({
    queryKey: ["eval-run-detail", detailRunId],
    queryFn: () => getRunDetailFn({ data: { runId: detailRunId! } }),
    enabled: !!detailRunId,
  });
  const baselineQ = useQuery({
    queryKey: ["eval-baseline", detailRunId],
    queryFn: () => compareFn({ data: { runId: detailRunId! } }),
    enabled: !!detailRunId,
  });

  const buildMut = useMutation({
    mutationFn: () => buildDniFn({ data: { limit: 100 } }),
    onSuccess: (r) => {
      toast.success(`Dataset DNI : ${r.total} item(s)`);
      qc.invalidateQueries({ queryKey: ["eval-datasets"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  const runMut = useMutation({
    mutationFn: () =>
      runEvalFn({
        data: {
          datasetId: selectedDataset,
          models: selectedModels.map((m) => ({ providerName: "__lovable__", modelId: m })),
          maxItems: 10,
        },
      }),
    onSuccess: (r) => {
      toast.success(`${r.count} run(s) exécuté(s)`);
      qc.invalidateQueries({ queryKey: ["eval-runs"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  const toggleModel = (m: string) => {
    setSelectedModels((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold mb-1">Banc d'essai LLM</h1>
          <p className="text-sm text-muted-foreground">
            Évaluation continue des modèles : précision (F1), latence, coût.
          </p>
        </div>
        <Link to="/admin/ai" className="text-sm underline text-muted-foreground">
          ← Tâches IA
        </Link>
      </div>

      <Card className="p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold">Datasets</h2>
          <Button
            size="sm"
            variant="outline"
            onClick={() => buildMut.mutate()}
            disabled={buildMut.isPending}
          >
            {buildMut.isPending ? "Construction…" : "Reconstruire DNI (ground truth)"}
          </Button>
        </div>
        <div className="grid gap-2">
          {(datasetsQ.data ?? []).map((d) => (
            <div
              key={d.id}
              className={`flex items-center justify-between border rounded p-2 cursor-pointer ${
                selectedDataset === d.id ? "border-primary bg-accent/30" : ""
              }`}
              onClick={() => setSelectedDataset(d.id)}
            >
              <div>
                <div className="font-medium text-sm">{d.slug}</div>
                <div className="text-xs text-muted-foreground">{d.description}</div>
              </div>
              <Badge variant="secondary">{d.item_count} items</Badge>
            </div>
          ))}
          {(datasetsQ.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">
              Aucun dataset. Clique sur "Reconstruire DNI" pour en créer un depuis la vérité terrain.
            </p>
          )}
        </div>
      </Card>

      <Card className="p-4 mb-4">
        <h2 className="font-semibold mb-2">Lancer un run</h2>
        <div className="text-xs text-muted-foreground mb-2">
          Sélectionne un dataset puis 1–5 modèles (passerelle Lovable). Limite : 10 items par modèle.
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          {LOVABLE_MODELS.map((m) => (
            <Badge
              key={m}
              variant={selectedModels.includes(m) ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => toggleModel(m)}
            >
              {m}
            </Badge>
          ))}
        </div>
        <Button
          size="sm"
          onClick={() => runMut.mutate()}
          disabled={!selectedDataset || selectedModels.length === 0 || runMut.isPending}
        >
          {runMut.isPending ? "Exécution…" : `Exécuter sur ${selectedModels.length} modèle(s)`}
        </Button>
        {(providersQ.data ?? []).length > 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            Providers configurés : {providersQ.data!.map((p) => p.name).join(", ")}
          </p>
        )}
      </Card>

      <Card className="p-4 mb-4">
        <h2 className="font-semibold mb-2">Historique des runs</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b">
                <th className="py-1">Date</th>
                <th>Tâche</th>
                <th>Modèle</th>
                <th>Items</th>
                <th>F1</th>
                <th>p95 (ms)</th>
                <th>Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(runsQ.data ?? []).map((r) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const mx = (r.metrics ?? {}) as any;
                return (
                  <tr key={r.id} className="border-b hover:bg-accent/30">
                    <td className="py-1 text-xs">{new Date(r.started_at).toLocaleString()}</td>
                    <td className="text-xs">{r.task_slug}</td>
                    <td className="text-xs">
                      <code className="bg-muted px-1 rounded">{r.model}</code>
                    </td>
                    <td className="text-xs">
                      {r.n_ok}/{r.n_items}
                    </td>
                    <td className="text-xs">
                      {typeof mx.f1_mean === "number" ? mx.f1_mean.toFixed(3) : "—"}
                    </td>
                    <td className="text-xs">{mx.latency_p95_ms ?? "—"}</td>
                    <td>
                      <Badge
                        variant={
                          r.status === "succeeded"
                            ? "default"
                            : r.status === "failed"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {r.status}
                      </Badge>
                    </td>
                    <td>
                      <Button size="sm" variant="ghost" onClick={() => setDetailRunId(r.id)}>
                        Détail
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {(runsQ.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-sm text-muted-foreground py-4">
                    Aucun run.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {detailRunId && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold">Détail du run</h2>
            <Button size="sm" variant="ghost" onClick={() => setDetailRunId(null)}>
              Fermer
            </Button>
          </div>
          {detailQ.isLoading && <p className="text-sm text-muted-foreground">Chargement…</p>}
          {detailQ.data?.run && (
            <>
              <div className="text-xs text-muted-foreground mb-2">
                {detailQ.data.run.model} · {detailQ.data.run.n_ok}/{detailQ.data.run.n_items} items OK
                {baselineQ.data?.regression && (
                  <Badge variant="destructive" className="ml-2">
                    Régression détectée
                  </Badge>
                )}
              </div>
              {baselineQ.data?.baseline && (
                <p className="text-xs text-muted-foreground mb-2">
                  Δ F1 : {baselineQ.data.delta!.f1.toFixed(3)} · Δ p95 :{" "}
                  {Math.round(baselineQ.data.delta!.p95_ms)} ms (vs run{" "}
                  {baselineQ.data.baseline.id.slice(0, 8)} sur {baselineQ.data.baseline.model})
                </p>
              )}
              <div className="text-xs">
                <strong>Top items en échec / faible score :</strong>
                <ul className="mt-1 space-y-1">
                  {(detailQ.data.items ?? [])
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    .map((it: any) => ({ ...it, sc: it.score?.f1 ?? 0 }))
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    .sort((a: any, b: any) => a.sc - b.sc)
                    .slice(0, 5)
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    .map((it: any) => (
                      <li key={it.id} className="border rounded p-2">
                        <div>
                          F1 = {it.sc.toFixed(3)} · latence {it.latency_ms ?? "—"} ms
                          {it.error && <span className="text-destructive"> · {it.error}</span>}
                        </div>
                        <details className="mt-1">
                          <summary className="cursor-pointer text-muted-foreground">
                            output / expected
                          </summary>
                          <pre className="text-[10px] mt-1 bg-muted p-2 overflow-x-auto">
                            {JSON.stringify(it.output, null, 2)}
                          </pre>
                        </details>
                      </li>
                    ))}
                </ul>
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
