import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { evaluatePrecision, type EvaluationMetrics } from "@/lib/conciliation/evaluate.functions";
import { EvaluationMatrix } from "@/components/conciliation/EvaluationMatrix";

export const Route = createFileRoute("/_authenticated/evaluation")({
  head: () => ({ meta: [{ title: "Évaluation précision" }] }),
  component: EvaluationPage,
});

function EvaluationPage() {
  const evalFn = useServerFn(evaluatePrecision);
  const [metrics, setMetrics] = useState<EvaluationMetrics | null>(null);

  const run = useMutation({
    mutationFn: async () => evalFn({ data: {} }),
    onSuccess: (m) => { setMetrics(m); toast.success("Évaluation calculée"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  return (
    <div className="container mx-auto px-4 py-6 max-w-5xl">
      <Link to="/_authenticated/dashboard" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-3">
        <ChevronLeft className="h-4 w-4" /> Retour dashboard
      </Link>

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Évaluation — Précision détection DNI</h1>
          <p className="text-sm text-muted-foreground">Comparaison divergences détectées vs ground truth synthétique</p>
        </div>
        <Button onClick={() => run.mutate()} disabled={run.isPending}>
          {run.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />}
          Lancer l'évaluation
        </Button>
      </div>

      {!metrics && (
        <p className="text-sm text-muted-foreground">
          Lancez l'évaluation après avoir généré une cohorte synthétique et exécuté la détection des divergences sur ses épisodes.
        </p>
      )}
      {metrics && <EvaluationMatrix m={metrics} />}
    </div>
  );
}
