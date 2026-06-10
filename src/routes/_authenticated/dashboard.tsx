import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Users, FileText, ShieldAlert, Sparkles, BarChart3,
  Loader2, Activity,
} from "lucide-react";
import { toast } from "sonner";
import { seedSyntheticCohort } from "@/lib/conciliation/seedSynthetic.functions";
import { RiskScoreBadge } from "@/components/conciliation/RiskScoreBadge";
import type { RiskResult } from "@/lib/conciliation/riskScore";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Tableau de bord — CONCIL-MED AI" }] }),
  component: DashboardPage,
});

const DIV_LABEL: Record<string, string> = {
  omission: "Omission",
  ajout: "Ajout",
  modification_dose: "Modif. dose",
  modification_freq: "Modif. fréquence",
  duplication: "Doublon",
  aucune: "Aucune",
};
const DIV_COLORS = ["#ef4444", "#f97316", "#eab308", "#3b82f6", "#8b5cf6", "#94a3b8"];
const RISK_COLORS: Record<string, string> = {
  critique: "#dc2626",
  eleve: "#ea580c",
  modere: "#eab308",
  faible: "#16a34a",
};

function DashboardPage() {
  const qc = useQueryClient();
  const seed = useServerFn(seedSyntheticCohort);

  const today = new Date();
  const defaultFrom = new Date(today.getTime() - 30 * 86400000).toISOString().slice(0, 10);
  const defaultTo = today.toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo] = useState(defaultTo);
  const [service, setService] = useState<string>("all");
  const [statut, setStatut] = useState<string>("all");

  const fromIso = `${dateFrom}T00:00:00.000Z`;
  const toIso = `${dateTo}T23:59:59.999Z`;

  // Services list
  const { data: services = [] } = useQuery({
    queryKey: ["services-list"],
    queryFn: async () => {
      const { data } = await supabase.from("episodes").select("service").not("service", "is", null);
      return Array.from(new Set((data ?? []).map((r) => r.service).filter(Boolean))) as string[];
    },
  });

  // Episodes (for service filter join)
  const { data: episodes = [] } = useQuery({
    queryKey: ["dash-episodes", dateFrom, dateTo, service],
    queryFn: async () => {
      let q = supabase.from("episodes").select("id, service, patient_id, created_at");
      if (service !== "all") q = q.eq("service", service);
      q = q.gte("created_at", fromIso).lte("created_at", toIso);
      const { data } = await q;
      return data ?? [];
    },
  });
  const epIds = useMemo(() => episodes.map((e) => e.id), [episodes]);

  // Patients count
  const { data: patientsCount = 0 } = useQuery({
    queryKey: ["dash-patients-count"],
    queryFn: async () => {
      const { count } = await supabase.from("patients").select("id", { count: "exact", head: true }).eq("archived", false);
      return count ?? 0;
    },
  });

  // Conciliations (divergences) with filters
  const { data: divergences = [] } = useQuery({
    queryKey: ["dash-divergences", epIds, statut],
    enabled: epIds.length > 0 || service === "all",
    queryFn: async () => {
      let q = supabase
        .from("conciliation_medicaments")
        .select("id, type_divergence, gravite, statut, created_at, episode_id")
        .gte("created_at", fromIso)
        .lte("created_at", toIso);
      if (service !== "all") q = q.in("episode_id", epIds.length ? epIds : ["00000000-0000-0000-0000-000000000000"]);
      if (statut !== "all") q = q.eq("statut", statut);
      const { data } = await q;
      return data ?? [];
    },
  });

  // Risk scores
  const { data: risks = [] } = useQuery({
    queryKey: ["dash-risks", epIds, service],
    queryFn: async () => {
      let q = supabase.from("risk_scores").select("id, niveau, score, episode_id, computed_at");
      if (service !== "all") q = q.in("episode_id", epIds.length ? epIds : ["00000000-0000-0000-0000-000000000000"]);
      const { data } = await q;
      return data ?? [];
    },
  });

  // Aggregations
  const realDivergences = divergences.filter((d) => d.type_divergence !== "aucune");
  const critiques = realDivergences.filter((d) => d.gravite === "critique" || d.gravite === "majeur").length;
  const resolved = divergences.filter((d) => d.statut === "resolu").length;
  const validationRate = divergences.length > 0 ? Math.round((resolved / divergences.length) * 100) : 0;
  const conciliationsDone = new Set(divergences.map((d) => d.episode_id)).size;
  const highRisk = risks.filter((r) => r.niveau === "eleve" || r.niveau === "critique").length;

  const divByType = useMemo(() => {
    const m = new Map<string, number>();
    realDivergences.forEach((d) => m.set(d.type_divergence, (m.get(d.type_divergence) ?? 0) + 1));
    return Array.from(m.entries()).map(([k, v]) => ({ name: DIV_LABEL[k] ?? k, value: v }));
  }, [realDivergences]);

  const risksByLevel = useMemo(() => {
    const m = new Map<string, number>();
    risks.forEach((r) => m.set(r.niveau, (m.get(r.niveau) ?? 0) + 1));
    return Array.from(m.entries()).map(([k, v]) => ({ name: k, value: v, color: RISK_COLORS[k] ?? "#94a3b8" }));
  }, [risks]);

  const dailyActivity = useMemo(() => {
    const days = 14;
    const buckets: { day: string; divergences: number; conciliations: Set<string> }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      buckets.push({ day: d.toISOString().slice(5, 10), divergences: 0, conciliations: new Set() });
    }
    divergences.forEach((d) => {
      const key = d.created_at.slice(5, 10);
      const b = buckets.find((x) => x.day === key);
      if (b) {
        b.divergences++;
        b.conciliations.add(d.episode_id);
      }
    });
    return buckets.map((b) => ({ day: b.day, divergences: b.divergences, conciliations: b.conciliations.size }));
  }, [divergences]);

  const { data: priorities = [] } = useQuery({
    queryKey: ["priorities"],
    queryFn: async () => {
      const { data } = await supabase
        .from("risk_scores")
        .select("id, score, niveau, episode_id, computed_at, episodes(motif, service, patient_id, patients(nom, prenom))")
        .order("score", { ascending: false })
        .limit(10);
      return data ?? [];
    },
  });

  const seedMut = useMutation({
    mutationFn: async (n: number) => seed({ data: { n } }),
    onSuccess: (r) => {
      toast.success(`Cohorte créée : ${r.patients} patients · ${r.truth_dnis} DNI étiquetées`);
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Tableau de bord</h1>
          <p className="text-sm text-muted-foreground">CONCIL-MED AI — Conciliation médicamenteuse assistée par IA</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => seedMut.mutate(20)} disabled={seedMut.isPending}>
            {seedMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
            Cohorte synthétique
          </Button>
          <Link to="/evaluation"><Button><BarChart3 className="h-4 w-4 mr-1" /> Évaluation</Button></Link>
        </div>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="py-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">Du</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Au</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Service</Label>
            <Select value={service} onValueChange={setService}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les services</SelectItem>
                {services.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Statut divergence</Label>
            <Select value={statut} onValueChange={setStatut}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="non_traite">Non traitée</SelectItem>
                <SelectItem value="en_cours">En cours</SelectItem>
                <SelectItem value="resolu">Résolue</SelectItem>
                <SelectItem value="non_applicable">Non applicable</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
        <KPI icon={<Users className="h-5 w-5" />} label="Patients" value={patientsCount} />
        <KPI icon={<FileText className="h-5 w-5" />} label="Conciliations" value={conciliationsDone} />
        <KPI icon={<ShieldAlert className="h-5 w-5 text-destructive" />} label="Critiques" value={critiques} tone="critical" />
        <KPI icon={<Activity className="h-5 w-5 text-orange-600" />} label="Risque élevé" value={highRisk} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        <Card>
          <CardHeader><CardTitle className="text-base">Répartition des divergences</CardTitle></CardHeader>
          <CardContent style={{ height: 260 }}>
            {divByType.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={divByType} dataKey="value" nameKey="name" outerRadius={80} label>
                    {divByType.map((_, i) => <Cell key={i} fill={DIV_COLORS[i % DIV_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Répartition des risques</CardTitle></CardHeader>
          <CardContent style={{ height: 260 }}>
            {risksByLevel.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={risksByLevel} dataKey="value" nameKey="name" outerRadius={80} label>
                    {risksByLevel.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Activité quotidienne (14j)</CardTitle></CardHeader>
          <CardContent style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyActivity}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" fontSize={11} />
                <YAxis fontSize={11} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="conciliations" fill="#3b82f6" name="Concil." />
                <Bar dataKey="divergences" fill="#f97316" name="Diverg." />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Priority queue */}
      <Card>
        <CardHeader><CardTitle className="text-base">Patients à risque — file priorisée</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {priorities.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Aucun score calculé. Générez une cohorte synthétique ou ouvrez un épisode pour calculer le score.
            </p>
          )}
          {priorities.map((r) => {
            const ep = r.episodes as { motif?: string; service?: string; patient_id?: string; patients?: { nom?: string; prenom?: string } } | null;
            const pat = ep?.patients;
            return (
              <Link key={r.id} to="/episodes/$episodeId" params={{ episodeId: r.episode_id }}>
                <div className="flex items-center justify-between border rounded-md p-3 hover:bg-accent">
                  <div>
                    <div className="font-medium">{pat?.nom?.toUpperCase()} {pat?.prenom}</div>
                    <div className="text-xs text-muted-foreground">{ep?.motif} — {ep?.service}</div>
                  </div>
                  <RiskScoreBadge score={r.score} niveau={r.niveau as RiskResult["niveau"]} />
                </div>
              </Link>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function KPI({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number | string; tone?: "critical" }) {
  return (
    <Card className={tone === "critical" ? "border-destructive/30" : ""}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">{icon}{label}</CardTitle>
      </CardHeader>
      <CardContent><div className="text-3xl font-bold">{value}</div></CardContent>
    </Card>
  );
}

function EmptyChart() {
  return <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Aucune donnée sur la période</div>;
}
