import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Timer, GaugeCircle, Sparkles } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend,
} from "recharts";
import { getConciliationMetrics } from "@/lib/metrics/events.functions";
import { listMyOrganizations } from "@/lib/dataIngest/ingestReal.functions";
import { listFhirPushLogs } from "@/lib/sih/fhirPush.functions";
import { Network } from "lucide-react";

export const Route = createFileRoute("/_authenticated/conciliation/metriques")({
  head: () => ({ meta: [{ title: "Métriques de conciliation — ConcilMed" }] }),
  component: MetricsPage,
});

const STEP_LABELS: Record<string, string> = {
  open_patient: "Ouverture dossier",
  open_episode: "Ouverture épisode",
  recueil_atcd: "Recueil ATCD",
  recueil_traitements: "Recueil traitements",
  comparaison: "Comparaison",
  analyse_ia: "Analyse IA",
  validation: "Validation",
  cloture: "Clôture",
};

function fmtMs(ms: number): string {
  if (!ms) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return `${m} min ${rs ? `${rs} s` : ""}`.trim();
}

function MetricsPage() {
  const getMetrics = useServerFn(getConciliationMetrics);
  const listOrgs = useServerFn(listMyOrganizations);

  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [orgId, setOrgId] = useState<string>("");

  const orgsQ = useQuery({ queryKey: ["metrics", "orgs"], queryFn: () => listOrgs() });
  const orgs = orgsQ.data?.orgs ?? [];

  const range = useMemo(() => {
    const to = new Date().toISOString();
    const from = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
    return { from, to };
  }, [days]);

  const q = useQuery({
    queryKey: ["metrics", days, orgId],
    queryFn: () => getMetrics({ data: { from: range.from, to: range.to, organizationId: orgId || undefined } }),
  });

  const listLogs = useServerFn(listFhirPushLogs);
  const pushLogsQ = useQuery({
    queryKey: ["fhir-push-logs", orgId],
    queryFn: () => (orgId ? listLogs({ data: { organizationId: orgId } }) : { logs: [] as { ok: boolean; created_at: string; status_code: number | null; endpoint_url: string }[] }),
    enabled: !!orgId,
  });
  const pushLogs = pushLogsQ.data?.logs ?? [];
  const pushOk = pushLogs.filter((l) => l.ok).length;
  const pushKo = pushLogs.length - pushOk;

  const m = q.data;
  const totalMedianMs = (m?.byStep ?? []).reduce((s, x) => s + x.p50, 0);
  const iaGain = m?.iaImpact && m.iaImpact.with_ia.median_ms && m.iaImpact.without_ia.median_ms
    ? Math.round(((m.iaImpact.without_ia.median_ms - m.iaImpact.with_ia.median_ms) / m.iaImpact.without_ia.median_ms) * 100)
    : null;

  const stepChart = (m?.byStep ?? []).map((s) => ({
    name: STEP_LABELS[s.step] ?? s.step,
    p50_s: Math.round(s.p50 / 1000),
    p90_s: Math.round(s.p90 / 1000),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Timer className="h-6 w-6" /> Métriques de conciliation</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Temps réel passé sur chaque étape (hors inactivité &gt; 60 s et onglet en arrière-plan).
        </p>
      </div>

      <div className="flex gap-2 items-center flex-wrap">
        {([7, 30, 90] as const).map((d) => (
          <Button key={d} size="sm" variant={days === d ? "default" : "outline"} onClick={() => setDays(d)}>
            {d} jours
          </Button>
        ))}
        {orgs.length > 0 && (
          <select
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
            value={orgId} onChange={(e) => setOrgId(e.target.value)}
          >
            <option value="">Toutes organisations</option>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.nom}</option>)}
          </select>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Temps médian total</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{fmtMs(totalMedianMs)}</div>
            <p className="text-xs text-muted-foreground mt-1">Somme des médianes par étape</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1"><Sparkles className="h-4 w-4" /> Impact IA</CardTitle></CardHeader>
          <CardContent>
            {iaGain !== null ? (
              <>
                <div className="text-3xl font-bold">{iaGain > 0 ? `-${iaGain}%` : `+${Math.abs(iaGain)}%`}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Avec IA : {fmtMs(m?.iaImpact.with_ia.median_ms ?? 0)} ({m?.iaImpact.with_ia.count}) ·
                  Sans IA : {fmtMs(m?.iaImpact.without_ia.median_ms ?? 0)} ({m?.iaImpact.without_ia.count})
                </p>
              </>
            ) : <div className="text-muted-foreground text-sm">Pas assez de données.</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1"><GaugeCircle className="h-4 w-4" /> Événements collectés</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{m?.totalEvents ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Sur les {days} derniers jours</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Temps médian par étape (P50 et P90, en secondes)</CardTitle></CardHeader>
        <CardContent>
          {stepChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stepChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-15} textAnchor="end" height={70} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="p50_s" fill="hsl(var(--primary))" name="P50 (s)" />
                <Bar dataKey="p90_s" fill="hsl(var(--muted-foreground))" name="P90 (s)" />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-muted-foreground">Aucune donnée.</p>}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Volume quotidien</CardTitle></CardHeader>
          <CardContent>
            {m?.volumeByDay.length ? (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={m.volumeByDay}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="episodes" stroke="hsl(var(--primary))" name="Épisodes" />
                  <Line type="monotone" dataKey="validations" stroke="hsl(var(--destructive))" name="Validations" />
                </LineChart>
              </ResponsiveContainer>
            ) : <p className="text-sm text-muted-foreground">Aucune donnée.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Par pharmacien</CardTitle></CardHeader>
          <CardContent>
            {m?.byUser.length ? (
              <table className="text-xs w-full">
                <thead><tr className="text-left text-muted-foreground"><th className="py-1">Utilisateur</th><th>Épisodes</th><th>Médiane</th><th>Total</th></tr></thead>
                <tbody>
                  {m.byUser.slice(0, 10).map((u) => (
                    <tr key={u.user_id} className="border-t">
                      <td className="py-1 font-mono text-[10px]">{u.user_id.slice(0, 8)}…</td>
                      <td>{u.episodes}</td>
                      <td>{fmtMs(u.median_ms)}</td>
                      <td>{fmtMs(u.total_ms)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="text-sm text-muted-foreground">Aucune donnée.</p>}
          </CardContent>
        </Card>
      </div>

      <Alert>
        <Timer className="h-4 w-4" />
        <AlertTitle>Méthodologie</AlertTitle>
        <AlertDescription>
          Les durées excluent les périodes où l'onglet est en arrière-plan ou sans interaction depuis &gt; 60 s.
          Les étapes &lt; 2 s ne sont pas enregistrées (clics accidentels).
          Aucune donnée patient sensible n'est stockée dans les événements.
        </AlertDescription>
      </Alert>
    </div>
  );
}
