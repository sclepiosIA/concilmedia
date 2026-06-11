import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPatientRiskTrend, type RiskTrendPoint } from "@/lib/risk/riskTrend.functions";
import { TrendingUp, TrendingDown, Minus, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

function fmtDate(d: string | null) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "2-digit" });
  } catch {
    return d.slice(0, 10);
  }
}

function colorForLevel(rank: number) {
  if (rank === 3) return "hsl(var(--destructive))";
  if (rank === 2) return "hsl(var(--warning, 38 92% 50%))";
  if (rank === 1) return "hsl(var(--primary))";
  return "hsl(var(--muted-foreground))";
}

function Sparkline({ points }: { points: RiskTrendPoint[] }) {
  const W = 360;
  const H = 80;
  const P = 8;
  if (points.length === 0) return null;
  const max = Math.max(100, ...points.map((p) => p.score));
  const min = 0;
  const xs = (i: number) =>
    points.length === 1 ? W / 2 : P + (i * (W - 2 * P)) / (points.length - 1);
  const ys = (v: number) => H - P - ((v - min) / (max - min)) * (H - 2 * P);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${xs(i).toFixed(1)} ${ys(p.score).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-20" preserveAspectRatio="none">
      <path d={d} fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" />
      {points.map((p, i) => (
        <circle key={p.episode_id} cx={xs(i)} cy={ys(p.score)} r={3} fill={colorForLevel(p.niveau_rank)}>
          <title>
            {fmtDate(p.date_entree ?? p.date)} — score {p.score} ({p.niveau})
          </title>
        </circle>
      ))}
    </svg>
  );
}

export function RiskTrendCard({ patientId }: { patientId: string }) {
  const fn = useServerFn(getPatientRiskTrend);
  const { data, isLoading } = useQuery({
    queryKey: ["risk-trend", patientId],
    queryFn: () => fn({ data: { patientId } }),
  });
  if (isLoading) return <div className="text-sm text-muted-foreground">Chargement…</div>;
  const points = data?.points ?? [];
  if (points.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        Aucun score de risque calculé pour ce patient.
      </div>
    );
  }
  const last = points[points.length - 1];
  const delta = last.delta_vs_precedent ?? 0;
  const rDelta = last.niveau_rank_delta ?? 0;
  const aggraves = delta >= 3 || rDelta >= 1;
  const ameliore = delta <= -3 || rDelta <= -1;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-semibold">{last.score}</span>
          <span className="text-sm text-muted-foreground">/ 100</span>
          <Badge variant="outline" className="capitalize">{last.niveau}</Badge>
        </div>
        {points.length >= 2 && (
          <Badge
            variant={aggraves ? "destructive" : ameliore ? "secondary" : "outline"}
            className="flex items-center gap-1"
          >
            {aggraves ? <TrendingUp className="h-3 w-3" /> : ameliore ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
            {delta > 0 ? `+${delta}` : delta} pts vs séjour précédent
          </Badge>
        )}
      </div>
      <Sparkline points={points} />
      <div className="text-xs text-muted-foreground">
        {points.length} séjour{points.length > 1 ? "s" : ""} évalué{points.length > 1 ? "s" : ""}. Dernier : {fmtDate(last.date_entree ?? last.date)}
        {last.service ? ` • ${last.service}` : ""}.
      </div>
      {aggraves && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>Risque iatrogène en hausse significative — envisager une consultation pharmaceutique de suivi.</span>
        </div>
      )}
    </div>
  );
}
