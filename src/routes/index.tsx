import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pill, Users, FileText, AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Conciliation Médicamenteuse — Tableau de bord" },
      { name: "description", content: "Module standalone de conciliation médicamenteuse avec analyse pharmaceutique assistée par IA." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setSignedIn(!!data.user));
  }, []);

  const { data: stats } = useQuery({
    enabled: signedIn === true,
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [pat, ep, conc] = await Promise.all([
        supabase.from("patients").select("id", { count: "exact", head: true }),
        supabase.from("episodes").select("id", { count: "exact", head: true }).eq("statut", "ouvert"),
        supabase.from("conciliation_medicaments").select("id", { count: "exact", head: true }).eq("statut", "non_traite"),
      ]);
      return { patients: pat.count ?? 0, episodes: ep.count ?? 0, divergences: conc.count ?? 0 };
    },
  });

  if (signedIn === null) return null;

  if (!signedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
        <div className="max-w-xl text-center">
          <div className="mx-auto h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
            <Pill className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-3xl font-bold mb-2">Conciliation Médicamenteuse</h1>
          <p className="text-muted-foreground mb-6">
            Module standalone pour analyser antécédents, allergies, comorbidités et traitements
            afin de détecter les divergences médicamenteuses, avec analyse pharmaceutique IA.
          </p>
          <Link to="/auth"><Button size="lg">Commencer</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold"><Pill className="h-5 w-5 text-primary" /> Conciliation Médicamenteuse</div>
          <Link to="/_authenticated/patients"><Button size="sm">Accéder aux patients</Button></Link>
        </div>
      </header>
      <main className="container mx-auto px-4 py-8 max-w-5xl">
        <h1 className="text-2xl font-bold mb-6">Tableau de bord</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <KPI icon={<Users className="h-5 w-5" />} label="Patients" value={stats?.patients ?? 0} />
          <KPI icon={<FileText className="h-5 w-5" />} label="Épisodes ouverts" value={stats?.episodes ?? 0} />
          <KPI icon={<AlertTriangle className="h-5 w-5" />} label="Divergences non traitées" value={stats?.divergences ?? 0} />
        </div>
      </main>
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
