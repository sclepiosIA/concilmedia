import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Sparkles, ScanSearch, ShieldAlert, Loader2, Download } from "lucide-react";
import { generateEpisodeConciliationPdf } from "@/lib/conciliation/pdfExport.functions";
import { useMedicationReconciliation } from "@/hooks/useMedicationReconciliation";
import { PharmacistConciliationPanel } from "@/components/conciliation/PharmacistConciliationPanel";
import { TraitementsDomicileColumn } from "@/components/conciliation/TraitementsDomicileColumn";
import { PrescriptionsHospitalieresColumn } from "@/components/conciliation/PrescriptionsHospitalieresColumn";
import { AIAnalysisPanel } from "@/components/conciliation/AIAnalysisPanel";
import { RiskScoreBadge } from "@/components/conciliation/RiskScoreBadge";
import { computePrioritization } from "@/lib/conciliation/prioritize.functions";
import { toast } from "sonner";
import type { RiskResult } from "@/lib/conciliation/riskScore";

export const Route = createFileRoute("/_authenticated/episodes/$episodeId")({
  head: () => ({ meta: [{ title: "Conciliation médicamenteuse" }] }),
  component: EpisodeConciliationPage,
});

function EpisodeConciliationPage() {
  const { episodeId } = Route.useParams();
  const recon = useMedicationReconciliation(episodeId);
  const qc = useQueryClient();
  const computeRisk = useServerFn(computePrioritization);

  const { data: latestRisk } = useQuery({
    queryKey: ["risk_score", episodeId],
    queryFn: async () => {
      const { data } = await supabase
        .from("risk_scores")
        .select("*")
        .eq("episode_id", episodeId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const riskMut = useMutation({
    mutationFn: async () => computeRisk({ data: { episodeId } }),
    onSuccess: (r: RiskResult) => {
      toast.success(`Score calculé : ${r.score}/100 (${r.niveau})`);
      qc.invalidateQueries({ queryKey: ["risk_score", episodeId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur calcul score"),
  });

  const { data: episode } = useQuery({
    queryKey: ["episode", episodeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("episodes")
        .select("*, patients(*)")
        .eq("id", episodeId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: allergies = [] } = useQuery({
    queryKey: ["allergies", episode?.patient_id],
    enabled: !!episode?.patient_id,
    queryFn: async () => (await supabase.from("allergies").select("*").eq("patient_id", episode!.patient_id)).data ?? [],
  });

  if (!episode) return <div className="container py-8">Chargement…</div>;
  const p = episode.patients;
  const age = p?.date_naissance ? Math.floor((Date.now() - new Date(p.date_naissance).getTime()) / 31557600000) : null;
  const allergiesCritiques = allergies.filter((a) => a.severite === "severe" || a.severite === "anaphylaxie");

  return (
    <div className="container mx-auto px-4 py-4 max-w-[1400px]">
      <Link
        to="/patients/$patientId"
        params={{ patientId: episode.patient_id }}
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-3"
      >
        <ChevronLeft className="h-4 w-4" /> Retour patient
      </Link>

      <Card className="mb-4">
        <CardContent className="py-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold">
              {p?.nom.toUpperCase()} {p?.prenom}
              {age !== null && <span className="text-sm font-normal text-muted-foreground ml-2">• {age} ans • {p?.sexe}</span>}
            </h1>
            <div className="text-sm text-muted-foreground">{episode.motif} — {episode.service}</div>
            {allergiesCritiques.length > 0 && (
              <div className="mt-2 flex gap-1 flex-wrap">
                {allergiesCritiques.map((a) => (
                  <Badge key={a.id} variant="destructive">⚠ {a.substance}</Badge>
                ))}
              </div>
            )}
            {latestRisk && (
              <div className="mt-2">
                <RiskScoreBadge score={latestRisk.score} niveau={latestRisk.niveau as RiskResult["niveau"]} />
              </div>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            <div className="text-xs px-3 py-1.5 rounded-md bg-muted">
              {recon.stats.nonTraite} non traitée(s) • {recon.stats.resolu} résolue(s)
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => riskMut.mutate()}
              disabled={riskMut.isPending}
            >
              {riskMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ShieldAlert className="h-4 w-4 mr-1" />}
              Score de risque
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => recon.detectDivergences()}
              disabled={recon.isDetecting}
            >
              <ScanSearch className="h-4 w-4 mr-1" /> Détecter divergences
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-3">
          <TraitementsDomicileColumn patientId={episode.patient_id} />
        </div>
        <div className="lg:col-span-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Conciliation médicamenteuse
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PharmacistConciliationPanel
                conciliations={recon.conciliations}
                onUpdate={recon.updateConciliation}
                onValidate={recon.validateConciliation}
                isLoading={recon.isLoading}
              />
            </CardContent>
          </Card>
        </div>
        <div className="lg:col-span-3 space-y-4">
          <PrescriptionsHospitalieresColumn episodeId={episodeId} patientId={episode.patient_id} />
          <AIAnalysisPanel episodeId={episodeId} />
        </div>
      </div>
    </div>
  );
}
