import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, FileText, AlertTriangle, Sparkles, ShieldAlert, BarChart3, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { seedSyntheticCohort } from "@/lib/conciliation/seedSynthetic.functions";
import { RiskScoreBadge } from "@/components/conciliation/RiskScoreBadge";
import type { RiskResult } from "@/lib/conciliation/riskScore";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard mémoire" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const qc = useQueryClient();
  const seed = useServerFn(seedSyntheticCohort);

  const { data: stats } = useQuery({
    queryKey: ["memoir-stats"],
    queryFn: async () => {
      const [pat, ep, conc, hi] = await Promise.all([
        supabase.from("patients").select("id", { count: "exact", head: true }),
        supabase.from("episodes").select("id", { count: "exact", head: true }),
        supabase.from("conciliation_medicaments").select("id", { count: "exact", head: true }).eq("statut", "non_traite"),
        supabase.from("risk_scores").select("id", { count: "exact", head: true }).in("niveau", ["eleve", "critique"]),
      ]);
      return { patients: pat.count ?? 0, episodes: ep.count ?? 0, divergences: conc.count ?? 0, high: hi.count ?? 0 };
    },
  });

  const { data: priorities = [] } = useQuery({
    queryKey: ["priorities"],
    queryFn: async () => {
      const { data } = await supabase
        .from("risk_scores")
        .select("id, score, niveau, episode_id, computed_at, episodes(motif, service, patient_id, patients(nom, prenom))")
        .order("score", { ascending: false })
        .limit(20);
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
    <div className="container mx-auto px-4 py-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard — Prototype mémoire</h1>
          <p className="text-sm text-muted-foreground">Conciliation médicamenteuse assistée par IA</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => seedMut.mutate(20)} disabled={seedMut.isPending}>
            {seedMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
            Générer 20 patients synthétiques
          </Button>
          <Link to="/evaluation"><Button><BarChart3 className="h-4 w-4 mr-1" /> Évaluation</Button></Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <KPI icon={<Users className="h-5 w-5" />} label="Patients" value={stats?.patients ?? 0} />
        <KPI icon={<FileText className="h-5 w-5" />} label="Épisodes" value={stats?.episodes ?? 0} />
        <KPI icon={<AlertTriangle className="h-5 w-5" />} label="Divergences non traitées" value={stats?.divergences ?? 0} />
        <KPI icon={<ShieldAlert className="h-5 w-5" />} label="Risque élevé/critique" value={stats?.high ?? 0} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">File priorisée (score IA)</CardTitle></CardHeader>
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

function KPI({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">{icon}{label}</CardTitle></CardHeader>
      <CardContent><div className="text-3xl font-bold">{value}</div></CardContent>
    </Card>
  );
}
