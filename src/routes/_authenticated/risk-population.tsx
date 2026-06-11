import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPopulationRiskStats } from "@/lib/risk/riskTrend.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, Activity, AlertTriangle, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/risk-population")({
  head: () => ({ meta: [{ title: "Risque iatrogène — vue populationnelle" }] }),
  component: RiskPopulationPage,
});

function RiskPopulationPage() {
  const [periodDays, setPeriodDays] = useState<number>(90);
  const fn = useServerFn(getPopulationRiskStats);
  const { data, isLoading } = useQuery({
    queryKey: ["risk-population", periodDays],
    queryFn: () => fn({ data: { periodDays } }),
  });

  return (
    <div className="container mx-auto px-4 py-6 max-w-[1200px] space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" /> Risque iatrogène — vue populationnelle
          </h1>
          <p className="text-sm text-muted-foreground">
            Agrégats sur les scores de risque calculés au cours de la période sélectionnée.
          </p>
        </div>
        <div className="flex gap-1">
          {[30, 90, 180, 365].map((p) => (
            <Button
              key={p}
              size="sm"
              variant={periodDays === p ? "default" : "outline"}
              onClick={() => setPeriodDays(p)}
            >
              {p} j
            </Button>
          ))}
        </div>
      </div>

      {isLoading || !data ? (
        <div className="text-sm text-muted-foreground">Chargement…</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              icon={<Users className="h-4 w-4" />}
              label="Patients suivis"
              value={`${data.patients_with_score} / ${data.patients_total}`}
              hint="patients avec score calculé"
            />
            <KpiCard
              icon={<Activity className="h-4 w-4" />}
              label="Score moyen"
              value={data.score_moyen.toFixed(1)}
              hint="dernier score par patient"
            />
            <KpiCard
              icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
              label="Niveau élevé"
              value={`${data.distribution.eleve}`}
              hint={`sur ${data.patients_with_score} patients`}
            />
            <KpiCard
              icon={<TrendingUp className="h-4 w-4 text-destructive" />}
              label="% en aggravation"
              value={`${data.pct_aggrave}%`}
              hint="≥ +3 pts ou hausse de niveau"
            />
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Distribution par niveau</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 flex-wrap text-sm">
                <Badge variant="outline">Faible : {data.distribution.faible}</Badge>
                <Badge variant="secondary">Modéré : {data.distribution.modere}</Badge>
                <Badge variant="destructive">Élevé : {data.distribution.eleve}</Badge>
                {data.distribution.autre > 0 && <Badge variant="outline">N/D : {data.distribution.autre}</Badge>}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Top services à risque</CardTitle>
              </CardHeader>
              <CardContent>
                {data.top_services.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Aucune donnée.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="text-xs text-muted-foreground">
                      <tr><th className="text-left py-1">Service</th><th className="text-right">Patients</th><th className="text-right">Score moyen</th></tr>
                    </thead>
                    <tbody>
                      {data.top_services.map((s) => (
                        <tr key={s.service} className="border-t">
                          <td className="py-1.5">{s.service}</td>
                          <td className="text-right">{s.nb}</td>
                          <td className="text-right font-medium">{s.score_moyen}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Top patients en aggravation</CardTitle>
              </CardHeader>
              <CardContent>
                {data.top_aggraves.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Aucune aggravation détectée sur la période.</div>
                ) : (
                  <div className="space-y-2">
                    {data.top_aggraves.map((a) => (
                      <Link
                        key={a.episode_id}
                        to="/patients/$patientId"
                        params={{ patientId: a.patient_id }}
                        className="block border rounded p-2 hover:bg-accent text-sm"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">
                            {(a.patient_nom ?? "").toUpperCase()} {a.patient_prenom ?? ""}
                          </span>
                          <Badge variant="destructive">+{a.delta} pts</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {a.service ?? "—"} • score {a.score} ({a.niveau}) • {new Date(a.date).toLocaleDateString("fr-FR")}
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function KpiCard({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}<span>{label}</span></div>
        <div className="text-2xl font-bold mt-1">{value}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}
