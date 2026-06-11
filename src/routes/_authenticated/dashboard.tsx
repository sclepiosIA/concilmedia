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
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Users, FileText, ShieldAlert, Sparkles, BarChart3,
  Loader2, Activity, AlertTriangle, Pill, EuroIcon,
  UserPlus, Upload, GitBranch, RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { seedSyntheticCohort } from "@/lib/conciliation/seedSynthetic.functions";
import { RiskScoreBadge } from "@/components/conciliation/RiskScoreBadge";
import type { RiskResult } from "@/lib/conciliation/riskScore";
import { findIvPoCandidate, isIvRoute } from "@/lib/clinical/ivPoCandidates";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Tableau de bord — ConcilMed·IA" }] }),
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

  const setPreset = (days: number) => {
    setDateTo(new Date().toISOString().slice(0, 10));
    setDateFrom(new Date(Date.now() - days * 86400000).toISOString().slice(0, 10));
  };
  const resetFilters = () => {
    setDateFrom(defaultFrom);
    setDateTo(defaultTo);
    setService("all");
    setStatut("all");
  };

  const { data: services = [] } = useQuery({
    queryKey: ["services-list"],
    queryFn: async () => {
      const { data } = await supabase.from("episodes").select("service").not("service", "is", null);
      return Array.from(new Set((data ?? []).map((r) => r.service).filter(Boolean))) as string[];
    },
  });

  const epQ = useQuery({
    queryKey: ["dash-episodes", dateFrom, dateTo, service],
    queryFn: async () => {
      let q = supabase.from("episodes").select("id, service, patient_id, created_at");
      if (service !== "all") q = q.eq("service", service);
      q = q.gte("created_at", fromIso).lte("created_at", toIso);
      const { data } = await q;
      return data ?? [];
    },
  });
  const episodes = epQ.data ?? [];
  const epIds = useMemo(() => episodes.map((e) => e.id), [episodes]);

  const patientsCountQ = useQuery({
    queryKey: ["dash-patients-count"],
    queryFn: async () => {
      const { count } = await supabase.from("patients").select("id", { count: "exact", head: true }).eq("archived", false);
      return count ?? 0;
    },
  });

  const divQ = useQuery({
    queryKey: ["dash-divergences", epIds, statut, fromIso, toIso],
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
  const divergences = divQ.data ?? [];

  const risksQ = useQuery({
    queryKey: ["dash-risks", epIds, service],
    queryFn: async () => {
      let q = supabase.from("risk_scores").select("id, niveau, score, episode_id, computed_at");
      if (service !== "all") q = q.in("episode_id", epIds.length ? epIds : ["00000000-0000-0000-0000-000000000000"]);
      const { data } = await q;
      return data ?? [];
    },
  });
  const risks = risksQ.data ?? [];

  // ============== Nouvelles dimensions ==============
  // Ruptures actives
  const shortagesQ = useQuery({
    queryKey: ["dash-shortages"],
    queryFn: async () => {
      const { data } = await supabase
        .from("drug_shortages")
        .select("id, cis, denomination, statut, date_debut, alternative, source_url")
        .in("statut", ["tension", "rupture"])
        .order("date_debut", { ascending: false, nullsFirst: false });
      return data ?? [];
    },
  });
  const shortages = shortagesQ.data ?? [];

  // Traitements actifs (pour intersections rupture / IV→PO)
  const treatsQ = useQuery({
    queryKey: ["dash-treatments-active"],
    queryFn: async () => {
      const { data } = await supabase
        .from("traitements_habituels")
        .select("id, patient_id, dci, nom_commercial, cis, voie_administration")
        .eq("actif", true);
      return data ?? [];
    },
  });
  const treatments = treatsQ.data ?? [];

  // Top économies génériques
  const econQ = useQuery({
    queryKey: ["dash-economies"],
    queryFn: async () => {
      const { data } = await supabase
        .from("v_drug_cheapest_generic")
        .select("cis, denomination, cis_generique, denomination_generique, prix_actuel, prix_generique, economie_eur")
        .gt("economie_eur", 0)
        .order("economie_eur", { ascending: false })
        .limit(8);
      return data ?? [];
    },
  });
  const economies = econQ.data ?? [];

  // Intersections
  const shortageCisSet = useMemo(() => new Set(shortages.map((s) => String(s.cis))), [shortages]);
  const patientsImpactedByShortage = useMemo(() => {
    const set = new Set<string>();
    for (const t of treatments) {
      if (t.cis != null && shortageCisSet.has(String(t.cis))) set.add(t.patient_id);
    }
    return set;
  }, [treatments, shortageCisSet]);

  const shortageHits = useMemo(() => {
    const byShortage = new Map<string, { shortage: typeof shortages[number]; patients: Set<string> }>();
    for (const t of treatments) {
      if (t.cis == null) continue;
      const cisStr = String(t.cis);
      const s = shortages.find((x) => String(x.cis) === cisStr);
      if (!s) continue;
      const entry = byShortage.get(s.id) ?? { shortage: s, patients: new Set() };
      entry.patients.add(t.patient_id);
      byShortage.set(s.id, entry);
    }
    return Array.from(byShortage.values())
      .sort((a, b) => b.patients.size - a.patients.size)
      .slice(0, 6);
  }, [treatments, shortages]);

  const ivPoCandidates = useMemo(() => {
    const set = new Set<string>();
    for (const t of treatments) {
      if (!isIvRoute(t.voie_administration)) continue;
      const name = t.dci || t.nom_commercial || "";
      if (findIvPoCandidate(name)) set.add(t.patient_id);
    }
    return set;
  }, [treatments]);

  // KPIs
  const realDivergences = divergences.filter((d) => d.type_divergence !== "aucune");
  const critiques = realDivergences.filter((d) => d.gravite === "critique" || d.gravite === "majeur").length;
  const resolved = divergences.filter((d) => d.statut === "resolu").length;
  const validationRate = divergences.length > 0 ? Math.round((resolved / divergences.length) * 100) : 0;
  const conciliationsDone = new Set(divergences.map((d) => d.episode_id)).size;
  const highRisk = risks.filter((r) => r.niveau === "eleve" || r.niveau === "critique").length;
  const totalEconomiePotentielle = economies.reduce((acc, e) => acc + (Number(e.economie_eur) || 0), 0);

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
    const buckets: { day: string; divergences: number; conciliations: Set<string>; critiques: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      buckets.push({ day: d.toISOString().slice(5, 10), divergences: 0, conciliations: new Set(), critiques: 0 });
    }
    divergences.forEach((d) => {
      const key = d.created_at.slice(5, 10);
      const b = buckets.find((x) => x.day === key);
      if (b) {
        b.divergences++;
        b.conciliations.add(d.episode_id);
        if (d.gravite === "critique" || d.gravite === "majeur") b.critiques++;
      }
    });
    return buckets.map((b) => ({ day: b.day, divergences: b.divergences, conciliations: b.conciliations.size, critiques: b.critiques }));
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

  const isLoadingKpis = patientsCountQ.isLoading || divQ.isLoading || risksQ.isLoading || treatsQ.isLoading;

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Tableau de bord</h1>
          <p className="text-sm text-muted-foreground">ConcilMed·IA — Conciliation médicamenteuse assistée par IA</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => seedMut.mutate(20)} disabled={seedMut.isPending}>
            {seedMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
            Cohorte synthétique
          </Button>
          <Link to="/evaluation"><Button size="sm"><BarChart3 className="h-4 w-4 mr-1" /> Évaluation</Button></Link>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <Link to="/patients"><Button variant="secondary" className="w-full justify-start" size="sm"><UserPlus className="h-4 w-4 mr-2" />Nouveau patient</Button></Link>
        <Link to="/admin/import-fhir"><Button variant="secondary" className="w-full justify-start" size="sm"><Upload className="h-4 w-4 mr-2" />Import FHIR</Button></Link>
        <Link to="/conciliation/supervision"><Button variant="secondary" className="w-full justify-start" size="sm"><GitBranch className="h-4 w-4 mr-2" />Supervision</Button></Link>
        <Link to="/risk-population"><Button variant="secondary" className="w-full justify-start" size="sm"><Activity className="h-4 w-4 mr-2" />Risque population</Button></Link>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="py-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground mr-1">Période rapide :</span>
            <Button size="sm" variant="ghost" onClick={() => setPreset(1)}>Auj.</Button>
            <Button size="sm" variant="ghost" onClick={() => setPreset(7)}>7 j</Button>
            <Button size="sm" variant="ghost" onClick={() => setPreset(30)}>30 j</Button>
            <Button size="sm" variant="ghost" onClick={() => setPreset(90)}>90 j</Button>
            <Button size="sm" variant="ghost" onClick={resetFilters} className="ml-auto"><RotateCcw className="h-3 w-3 mr-1" />Réinitialiser</Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
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
          </div>
        </CardContent>
      </Card>

      {/* KPIs row 1 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPI loading={isLoadingKpis} icon={<Users className="h-5 w-5" />} label="Patients" value={patientsCountQ.data ?? 0} />
        <KPI loading={isLoadingKpis} icon={<FileText className="h-5 w-5" />} label="Conciliations" value={conciliationsDone} />
        <KPI loading={isLoadingKpis} icon={<ShieldAlert className="h-5 w-5 text-destructive" />} label="Critiques" value={critiques} tone="critical" />
        <KPI loading={isLoadingKpis} icon={<Activity className="h-5 w-5" />} label="Risque élevé" value={highRisk} />
      </div>

      {/* KPIs row 2 — nouvelles dimensions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <KPI
          loading={isLoadingKpis}
          icon={<AlertTriangle className="h-5 w-5 text-destructive" />}
          label="Patients × rupture"
          value={patientsImpactedByShortage.size}
          tone={patientsImpactedByShortage.size > 0 ? "critical" : undefined}
          hint={`${shortages.length} rupture(s) ANSM active(s)`}
        />
        <KPI
          loading={isLoadingKpis}
          icon={<Pill className="h-5 w-5" />}
          label="Candidats IV→PO"
          value={ivPoCandidates.size}
          hint="Patients avec voie IV éligible"
        />
        <KPI
          loading={econQ.isLoading}
          icon={<EuroIcon className="h-5 w-5" />}
          label="Économie générique"
          value={`${totalEconomiePotentielle.toFixed(2)} €`}
          hint="Top 8 substitutions cumulées"
        />
        <KPI
          loading={isLoadingKpis}
          icon={<BarChart3 className="h-5 w-5" />}
          label="Taux validation"
          value={`${validationRate}%`}
          hint={`${resolved}/${divergences.length || 0} résolues`}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        <Card>
          <CardHeader><CardTitle className="text-base">Répartition des divergences</CardTitle></CardHeader>
          <CardContent style={{ height: 260 }}>
            {divQ.isLoading ? <Skeleton className="h-full w-full" /> : divByType.length === 0 ? (
              <EmptyChart cta={{ label: "Générer cohorte synthétique", onClick: () => seedMut.mutate(20) }} />
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
            {risksQ.isLoading ? <Skeleton className="h-full w-full" /> : risksByLevel.length === 0 ? (
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
                <Bar dataKey="critiques" fill="#dc2626" name="Critiques" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Nouveaux blocs : Ruptures × cohorte + Économies */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Ruptures ANSM impactant la cohorte
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {shortagesQ.isLoading || treatsQ.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : shortageHits.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucun médicament en rupture ne concerne actuellement vos patients actifs.
                {shortages.length > 0 && ` (${shortages.length} rupture(s) ANSM actives globalement.)`}
              </p>
            ) : (
              shortageHits.map((h) => (
                <div key={h.shortage.id} className="flex items-start justify-between border rounded-md p-3">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{h.shortage.denomination ?? `CIS ${h.shortage.cis}`}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                      <Badge variant={h.shortage.statut === "rupture" ? "destructive" : "secondary"} className="text-[10px]">
                        {h.shortage.statut}
                      </Badge>
                      {h.shortage.alternative && <span className="truncate">Alt. : {h.shortage.alternative}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <div className="text-lg font-bold">{h.patients.size}</div>
                    <div className="text-[10px] text-muted-foreground">patient(s)</div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <EuroIcon className="h-4 w-4" />
              Top substitutions génériques
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {econQ.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : economies.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune économie générique identifiée pour le moment.</p>
            ) : (
              economies.slice(0, 6).map((e) => (
                <div key={`${e.cis}-${e.cis_generique}`} className="flex items-start justify-between border rounded-md p-3">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{e.denomination}</div>
                    <div className="text-xs text-muted-foreground truncate">→ {e.denomination_generique}</div>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <div className="text-base font-bold text-emerald-600">−{Number(e.economie_eur).toFixed(2)} €</div>
                    <div className="text-[10px] text-muted-foreground">/ boîte</div>
                  </div>
                </div>
              ))
            )}
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
            const pid = ep?.patient_id;
            const hasShortage = pid ? patientsImpactedByShortage.has(pid) : false;
            const hasIvPo = pid ? ivPoCandidates.has(pid) : false;
            return (
              <Link key={r.id} to="/episodes/$episodeId" params={{ episodeId: r.episode_id }}>
                <div className="flex items-center justify-between border rounded-md p-3 hover:bg-accent">
                  <div className="min-w-0">
                    <div className="font-medium flex items-center gap-2 flex-wrap">
                      <span>{pat?.nom?.toUpperCase()} {pat?.prenom}</span>
                      {hasShortage && <Badge variant="destructive" className="text-[10px]">Rupture</Badge>}
                      {hasIvPo && <Badge variant="secondary" className="text-[10px]">IV→PO</Badge>}
                    </div>
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

function KPI({ icon, label, value, tone, hint, loading }: { icon: React.ReactNode; label: string; value: number | string; tone?: "critical"; hint?: string; loading?: boolean }) {
  return (
    <Card className={tone === "critical" ? "border-destructive/30" : ""}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">{icon}{label}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <>
            <div className="text-3xl font-bold">{value}</div>
            {hint && <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyChart({ cta }: { cta?: { label: string; onClick: () => void } }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-sm text-muted-foreground gap-2">
      <span>Aucune donnée sur la période</span>
      {cta && <Button size="sm" variant="outline" onClick={cta.onClick}>{cta.label}</Button>}
    </div>
  );
}
