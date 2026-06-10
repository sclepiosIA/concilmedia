import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getFeedbackMetrics, exportFeedbackDataset } from "@/lib/ai/feedbackSignals.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/ai/rlhf")({
  component: RlhfDashboard,
});

type Decision = "accepted" | "rejected" | "modified";
type Counts = Record<Decision, number>;

function pct(num: number, denom: number): string {
  if (!denom) return "—";
  return `${Math.round((num * 100) / denom)}%`;
}

function RlhfDashboard() {
  const metricsFn = useServerFn(getFeedbackMetrics);
  const exportFn = useServerFn(exportFeedbackDataset);
  const [exporting, setExporting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["rlhf-metrics"],
    queryFn: () => metricsFn(),
  });

  const handleExport = async () => {
    try {
      setExporting(true);
      const res = await exportFn();
      const blob = new Blob([res.jsonl], { type: "application/jsonl" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `concilmed-feedback-${new Date().toISOString().slice(0, 10)}.jsonl`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${res.count} signaux exportés`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de l'export");
    } finally {
      setExporting(false);
    }
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Chargement…</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Aucune donnée disponible.</p>;

  const total = data.total;
  const counts = data.counts as Counts;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">RLHF — Feedback pharmacien</h1>
          <p className="text-sm text-muted-foreground">
            Signaux capturés à chaque validation : utilisés pour mesurer la qualité du modèle et alimenter un few-shot dynamique sur la tâche <code>analyze</code>.
          </p>
        </div>
        <Button onClick={handleExport} disabled={exporting || total === 0}>
          <Download className="w-4 h-4 mr-2" />
          {exporting ? "Export…" : "Exporter JSONL"}
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Signaux capturés" value={total.toString()} />
        <StatCard label="Acceptés" value={`${counts.accepted ?? 0} · ${pct(counts.accepted ?? 0, total)}`} tone="ok" />
        <StatCard label="Modifiés" value={`${counts.modified ?? 0} · ${pct(counts.modified ?? 0, total)}`} tone="warn" />
        <StatCard label="Rejetés" value={`${counts.rejected ?? 0} · ${pct(counts.rejected ?? 0, total)}`} tone="bad" />
      </div>

      <Card className="p-4">
        <h2 className="font-semibold mb-3">Décisions par modèle</h2>
        <DecisionTable rows={data.byModel as Record<string, Counts>} keyLabel="Modèle" />
      </Card>

      <Card className="p-4">
        <h2 className="font-semibold mb-3">Décisions par catégorie</h2>
        <DecisionTable rows={data.byCategory as Record<string, Counts>} keyLabel="Catégorie" />
      </Card>

      <Card className="p-4">
        <h2 className="font-semibold mb-3">Patterns d'alertes rejetés (top 20)</h2>
        {data.topRejected.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun rejet enregistré pour l'instant.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pattern</TableHead>
                <TableHead className="w-20 text-right">Rejets</TableHead>
                <TableHead>Commentaires fréquents</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.topRejected.map((p, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono text-xs">{p.pattern || "—"}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant="destructive">{p.count}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {p.comments.length === 0 ? "—" : p.comments.join(" · ")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" | "bad" }) {
  const color =
    tone === "ok" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : tone === "bad" ? "text-red-600" : "";
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold mt-1 ${color}`}>{value}</div>
    </Card>
  );
}

function DecisionTable({ rows, keyLabel }: { rows: Record<string, Counts>; keyLabel: string }) {
  const entries = Object.entries(rows).sort((a, b) => {
    const sa = (a[1].accepted ?? 0) + (a[1].rejected ?? 0) + (a[1].modified ?? 0);
    const sb = (b[1].accepted ?? 0) + (b[1].rejected ?? 0) + (b[1].modified ?? 0);
    return sb - sa;
  });
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">Pas encore de données.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{keyLabel}</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead className="text-right">Acceptés</TableHead>
          <TableHead className="text-right">Modifiés</TableHead>
          <TableHead className="text-right">Rejetés</TableHead>
          <TableHead className="text-right">Taux d'acceptation</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map(([k, v]) => {
          const tot = (v.accepted ?? 0) + (v.rejected ?? 0) + (v.modified ?? 0);
          return (
            <TableRow key={k}>
              <TableCell className="font-mono text-xs">{k}</TableCell>
              <TableCell className="text-right">{tot}</TableCell>
              <TableCell className="text-right text-emerald-600">{v.accepted ?? 0}</TableCell>
              <TableCell className="text-right text-amber-600">{v.modified ?? 0}</TableCell>
              <TableCell className="text-right text-red-600">{v.rejected ?? 0}</TableCell>
              <TableCell className="text-right font-semibold">{pct(v.accepted ?? 0, tot)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
