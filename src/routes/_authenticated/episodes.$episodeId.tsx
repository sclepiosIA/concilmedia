import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ScanSearch, Sparkles } from "lucide-react";
import { generateEpisodeConciliationPdf } from "@/lib/conciliation/pdfExport.functions";
import { useMedicationReconciliation } from "@/hooks/useMedicationReconciliation";
import { SynthesePatientDialog } from "@/components/patient/SynthesePatientDialog";



import { AIAnalysisPanel } from "@/components/conciliation/AIAnalysisPanel";
import { RiskScoreBadge } from "@/components/conciliation/RiskScoreBadge";
import { OrdonnanceHospitaliereDropzone } from "@/components/conciliation/OrdonnanceHospitaliereDropzone";

import { ComparaisonTable } from "@/components/conciliation/ComparaisonTable";
import { TableauSyntheseClinique } from "@/components/conciliation/TableauSyntheseClinique";

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
  const validationDone = total > 0 && reconRatio === 1;


  return (
    <div className="container mx-auto px-4 py-4 max-w-[1600px]">
      <Link
        to="/patients/$patientId"
        params={{ patientId: episode.patient_id }}
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-3"
      >
        <ChevronLeft className="h-4 w-4" /> Retour patient
      </Link>

      {/* HEADER: patient + actions */}
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
              <Button size="sm" onClick={() => recon.detectDivergences()} disabled={recon.isDetecting}>
                <ScanSearch className="h-4 w-4 mr-1" /> Détecter divergences
              </Button>
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


      {/* TABLEAU DE SYNTHESE CLINIQUE ET MEDICAMENTEUSE */}
      <div className="mb-4">
        <TableauSyntheseClinique episodeId={episodeId} patientId={episode.patient_id} />
      </div>

      {/* SECONDARY: AI ANALYSIS */}
      <AIAnalysisPanel episodeId={episodeId} />
    </div>
  );
}
