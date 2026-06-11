import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef } from "react";

import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Sparkles, ScanSearch, ShieldAlert, Loader2, Download, CheckCircle2 } from "lucide-react";
import { generateEpisodeConciliationPdf } from "@/lib/conciliation/pdfExport.functions";
import { useMedicationReconciliation } from "@/hooks/useMedicationReconciliation";
import { PharmacistConciliationPanel } from "@/components/conciliation/PharmacistConciliationPanel";
import { TraitementsDomicileColumn } from "@/components/conciliation/TraitementsDomicileColumn";
import { PrescriptionsHospitalieresColumn } from "@/components/conciliation/PrescriptionsHospitalieresColumn";
import { AIAnalysisPanel } from "@/components/conciliation/AIAnalysisPanel";
import { RiskScoreBadge } from "@/components/conciliation/RiskScoreBadge";
import { ClinicalRecommendationsCard } from "@/components/conciliation/ClinicalRecommendationsCard";
import { DivergencesSummaryCard } from "@/components/conciliation/DivergencesSummaryCard";
import { ClinicalProfileCard } from "@/components/patient/ClinicalProfileCard";

import { computePrioritization } from "@/lib/conciliation/prioritize.functions";
import { getPatientRiskTrend } from "@/lib/risk/riskTrend.functions";
import { toast } from "sonner";
import type { RiskResult } from "@/lib/conciliation/riskScore";
import { useConciliationTimer } from "@/hooks/useConciliationTimer";

export const Route = createFileRoute("/_authenticated/episodes/$episodeId")({
  head: () => ({ meta: [{ title: "Conciliation médicamenteuse" }] }),
  component: EpisodeConciliationPage,
});

function EpisodeConciliationPage() {
  const { episodeId } = Route.useParams();
  useConciliationTimer({ step: "open_episode", episodeId });
  const recon = useMedicationReconciliation(episodeId);
  const qc = useQueryClient();
  const computeRisk = useServerFn(computePrioritization);
  const pdfFn = useServerFn(generateEpisodeConciliationPdf);
  const downloadPdf = async () => {
    try {
      const r = await pdfFn({ data: { episodeId } });
      const bin = atob(r.base64); const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([arr], { type: "application/pdf" }));
      const a = document.createElement("a"); a.href = url; a.download = r.filename; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur PDF"); }
  };

  const { data: latestRisk } = useQuery({
    queryKey: ["risk_score", episodeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("risk_scores")
        .select("*")
        .eq("episode_id", episodeId)
        .order("computed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const riskMut = useMutation({
    mutationFn: async () => computeRisk({ data: { episodeId } }),
    onSuccess: (r: RiskResult) => {
      toast.success(`Score calculé : ${r.score}/100 (${r.niveau})`);
      qc.invalidateQueries({ queryKey: ["risk_score", episodeId] });
      qc.invalidateQueries({ queryKey: ["patients-triage"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur calcul score"),
  });

  // Auto-déclenchement du calcul de priorisation si aucun score n'existe encore
  const autoTriggered = useRef(false);
  useEffect(() => {
    if (autoTriggered.current) return;
    if (latestRisk === undefined) return; // query pas encore résolue
    if (latestRisk === null && !riskMut.isPending) {
      autoTriggered.current = true;
      riskMut.mutate();
    }
  }, [latestRisk, riskMut]);


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
                <RiskScoreBadge
                  score={latestRisk.score}
                  niveau={latestRisk.niveau as RiskResult["niveau"]}
                  breakdown={
                    (latestRisk.variables as { breakdown?: import("@/lib/conciliation/riskScore").RiskBreakdown[] } | null)?.breakdown ?? null
                  }
                />
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
            <Button variant="outline" size="sm" onClick={downloadPdf}>
              <Download className="h-4 w-4 mr-1" /> Export PDF
            </Button>
            <Link to="/episodes/$episodeId/sortie" params={{ episodeId }}>
              <Button variant="outline" size="sm">
                <CheckCircle2 className="h-4 w-4 mr-1" /> Conciliation de sortie
              </Button>
            </Link>
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

      <div className="my-4">
        <DivergencesSummaryCard conciliations={recon.conciliations} />
      </div>



      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-3 space-y-4">
          <TraitementsDomicileColumn patientId={episode.patient_id} />
          <PrescriptionsHospitalieresColumn episodeId={episodeId} patientId={episode.patient_id} />
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
          <ClinicalProfileCard patientId={episode.patient_id} />
          <ClinicalRecommendationsCard patientId={episode.patient_id} conciliations={recon.conciliations} />
          <AIAnalysisPanel episodeId={episodeId} />
        </div>
      </div>

      {/* Divergences résolues — en bas de page */}
      <div className="mt-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              Divergences résolues
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recon.conciliations.filter((c) => c.statut === "resolu").length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Aucune divergence. Cliquez sur "Détecter divergences" pour lancer l'analyse algorithmique.
              </p>
            ) : (
              <div className="space-y-3">
                {recon.conciliations
                  .filter((c) => c.statut === "resolu")
                  .map((c) => (
                    <div key={c.id} className="border rounded p-3 text-sm">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">Résolu</Badge>
                        <span className="font-medium">{c.medication_domicile.dci}</span>
                        {c.medication_hospitalisation && (
                          <>
                            <span className="text-muted-foreground">→</span>
                            <span>{c.medication_hospitalisation.dci}</span>
                          </>
                        )}
                      </div>
                      {c.justification && (
                        <div className="text-xs text-muted-foreground mt-1">{c.justification}</div>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
