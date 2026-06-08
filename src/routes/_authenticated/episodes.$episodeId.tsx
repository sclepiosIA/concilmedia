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

import { AIAnalysisPanel } from "@/components/conciliation/AIAnalysisPanel";
import { RiskScoreBadge } from "@/components/conciliation/RiskScoreBadge";
import { OrdonnanceHospitaliereDropzone } from "@/components/conciliation/OrdonnanceHospitaliereDropzone";
import { DivergencesColumn } from "@/components/conciliation/DivergencesColumn";

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

  const { data: prescriptions = [] } = useQuery({
    queryKey: ["prescriptions", episodeId],
    queryFn: async () => (await supabase.from("prescriptions_hospitalieres").select("id").eq("episode_id", episodeId).eq("actif", true)).data ?? [],
  });

  if (!episode) return <div className="container py-8">Chargement…</div>;
  const p = episode.patients;
  const age = p?.date_naissance ? Math.floor((Date.now() - new Date(p.date_naissance).getTime()) / 31557600000) : null;
  const allergiesCritiques = allergies.filter((a) => a.severite === "severe" || a.severite === "anaphylaxie");
  const initials = `${p?.nom?.[0] ?? ""}${p?.prenom?.[0] ?? ""}`.toUpperCase();

  const total = recon.stats.nonTraite + recon.stats.resolu;
  const reconRatio = total > 0 ? recon.stats.resolu / total : 0;
  const ordonnanceDone = prescriptions.length > 0;
  const divergencesDone = recon.conciliations.length > 0;
  const validationDone = total > 0 && reconRatio === 1;
  const progressPct = Math.round(
    (ordonnanceDone ? 33 : 0) + (divergencesDone ? 33 : 0) + (validationDone ? 34 : 0)
  );


  return (
    <div className="container mx-auto px-4 py-4 max-w-[1600px]">
      <Link
        to="/patients/$patientId"
        params={{ patientId: episode.patient_id }}
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-3"
      >
        <ChevronLeft className="h-4 w-4" /> Retour patient
      </Link>

      {/* HEADER: patient + actions + workflow stepper */}
      <Card className="mb-4">
        <CardContent className="p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap mb-5">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-base shrink-0">
                {initials || "—"}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-bold truncate">{p?.nom?.toUpperCase()} {p?.prenom}</h1>
                  {age !== null && (
                    <span className="text-sm text-muted-foreground">• {age} ans • {p?.sexe}</span>
                  )}
                  {latestRisk && (
                    <RiskScoreBadge score={latestRisk.score} niveau={latestRisk.niveau as RiskResult["niveau"]} />
                  )}
                </div>
                <p className="text-sm text-muted-foreground truncate">
                  {episode.motif} — {episode.service}
                </p>
                {allergiesCritiques.length > 0 && (
                  <div className="mt-1.5 flex gap-1 flex-wrap">
                    {allergiesCritiques.map((a) => (
                      <Badge key={a.id} variant="destructive" className="text-[10px]">⚠ {a.substance}</Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-xs px-3 py-1.5 rounded-md bg-muted text-muted-foreground">
                {recon.stats.nonTraite} non traitée(s) • {recon.stats.resolu} résolue(s)
              </div>
              <Button variant="outline" size="sm" onClick={() => riskMut.mutate()} disabled={riskMut.isPending}>
                {riskMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ShieldAlert className="h-4 w-4 mr-1" />}
                Score de risque
              </Button>
              <Button variant="outline" size="sm" onClick={downloadPdf}>
                <Download className="h-4 w-4 mr-1" /> Export PDF
              </Button>
              <Button size="sm" onClick={() => recon.detectDivergences()} disabled={recon.isDetecting}>
                <ScanSearch className="h-4 w-4 mr-1" /> Détecter divergences
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-4 pt-4 border-t">
            <div className="flex-1">
              <div className="flex justify-between text-xs font-semibold uppercase tracking-wider mb-2">
                <span className={ordonnanceDone ? "text-emerald-600" : "text-muted-foreground"}>
                  1. Ordonnance importée
                </span>
                <span className={divergencesDone && !validationDone ? "text-primary" : divergencesDone ? "text-emerald-600" : "text-muted-foreground"}>
                  2. Divergences détectées
                </span>
                <span className={validationDone ? "text-emerald-600" : "text-muted-foreground"}>
                  3. Validation
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden flex">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: ordonnanceDone ? "33.3%" : "0%" }} />
                <div className="h-full bg-primary transition-all" style={{ width: divergencesDone ? "33.3%" : "0%" }} />
                <div className="h-full bg-emerald-500 transition-all" style={{ width: validationDone ? "33.4%" : "0%" }} />
              </div>
            </div>
            <div className="text-right min-w-[100px]">
              <div className="text-[10px] text-muted-foreground font-medium uppercase">Progression</div>
              <div className="text-lg font-bold">{progressPct}%</div>
            </div>
          </div>
        </CardContent>
      </Card>


      {/* STEP 1 — UPLOAD ORDONNANCE */}
      <div className="mb-4">
        <OrdonnanceHospitaliereDropzone
          episodeId={episodeId}
          patientId={episode.patient_id}
          hasPrescriptions={prescriptions.length > 0}
          onImported={() => recon.detectDivergences()}
        />
      </div>

      {/* COMPARISON TABLE — DCI / dosage / posologie side by side */}
      <div className="mb-4">
        <ComparaisonTable episodeId={episodeId} patientId={episode.patient_id} />
      </div>

      {/* STEP 2 — COMPARISON 2 COLUMNS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <TraitementsDomicileColumn patientId={episode.patient_id} />
        <DivergencesColumn conciliations={recon.conciliations} />
      </div>

      {/* STEP 3 — VALIDATION PHARMACIEN */}
      <Card className="border-2 border-primary/15 shadow-sm mb-4">
        <CardHeader className="pb-3 bg-primary/[0.03] border-b">
          <CardTitle className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Validation pharmaceutique
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <PharmacistConciliationPanel
            conciliations={recon.conciliations}
            onUpdate={recon.updateConciliation}
            onValidate={recon.validateConciliation}
            isLoading={recon.isLoading}
          />
        </CardContent>
      </Card>

      {/* SECONDARY: AI ANALYSIS */}
      <AIAnalysisPanel episodeId={episodeId} />
    </div>
  );
}
