import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, ClipboardList, Stethoscope, Activity, ShieldAlert, FileText, AlertTriangle } from "lucide-react";
import { analyzeConciliation, type AIAnalysisPayload } from "@/lib/conciliation/analyze.functions";
import { recordAudit } from "@/lib/audit/audit.functions";
import { toast } from "sonner";
import { ClinicalAlertsPanel } from "@/components/conciliation/ClinicalAlertsPanel";
import { RiskScoreCompare } from "@/components/conciliation/RiskScoreCompare";
import { useAiHealth } from "@/hooks/useAiHealth";

export function AIAnalysisPanel({ episodeId }: { episodeId: string }) {
  const qc = useQueryClient();
  const analyzeFn = useServerFn(analyzeConciliation);
  const auditFn = useServerFn(recordAudit);
  const ai = useAiHealth();

  const { data: latest } = useQuery({
    queryKey: ["ai-analysis", episodeId],
    queryFn: async () => {
      const { data } = await supabase
        .from("conciliation_ai_analyses")
        .select("*")
        .eq("episode_id", episodeId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const mut = useMutation({
    mutationFn: () => analyzeFn({ data: { episodeId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-analysis", episodeId] });
      toast.success("Analyse IA terminée");
      auditFn({ data: { action: "ai_analysis_run", entityType: "episode", entityId: episodeId } }).catch(() => {});
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur IA"),
  });

  const payload = latest?.payload as unknown as AIAnalysisPayload | undefined;

  const totalAlertes = payload
    ? (payload.interactions?.length ?? 0) +
      (payload.contre_indications?.length ?? 0) +
      (payload.adaptations_posologiques?.length ?? 0) +
      (payload.doublons_therapeutiques?.length ?? 0) +
      (payload.medicaments_haut_risque?.length ?? 0) +
      (payload.allergies_croisees?.length ?? 0)
    : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Analyse IA</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={() => mut.mutate()} disabled={mut.isPending || ai.degraded} className="w-full" size="sm">
          {mut.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Analyse…</> : <><Sparkles className="h-4 w-4 mr-1" /> Lancer l'analyse</>}
        </Button>
        {ai.degraded && (
          <div className="rounded-md border border-amber-200 bg-amber-50 text-amber-900 text-xs p-2 flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <div className="flex-1">
              IA temporairement indisponible. Les analyses précédentes restent consultables.
            </div>
            <button type="button" className="underline" onClick={() => ai.refresh()}>Réessayer</button>
          </div>
        )}

        <RiskScoreCompare episodeId={episodeId} />


        {payload && (
          <>
            {/* SECTION A — Résultats de conciliation médicamenteuse */}
            <section className="rounded-lg border-2 border-primary/30 bg-primary/5 p-3 space-y-3">
              <header className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold">A. Résultats de conciliation médicamenteuse</h3>
                </div>
                <Badge variant="secondary" className="text-[10px]">
                  {totalAlertes} problème{totalAlertes > 1 ? "s" : ""} détecté{totalAlertes > 1 ? "s" : ""}
                </Badge>
              </header>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Détection et analyse des problèmes médicamenteux : interactions, contre-indications,
                adaptations posologiques, doublons thérapeutiques et médicaments à haut risque.
              </p>
              {totalAlertes > 0 ? (
                <ClinicalAlertsPanel payload={payload} />
              ) : (
                <p className="text-xs text-muted-foreground italic">Aucun problème médicamenteux détecté.</p>
              )}
            </section>

            {/* SECTION B — Aide à la décision clinique (IA) */}
            <section className="rounded-lg border-2 border-sky-300 bg-sky-50/60 p-3 space-y-3">
              <header className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Stethoscope className="h-4 w-4 text-sky-700" />
                  <h3 className="text-sm font-semibold text-sky-900">B. Aide à la décision clinique (IA)</h3>
                </div>
                <Badge
                  variant={payload.score_risque > 60 ? "destructive" : payload.score_risque > 30 ? "default" : "secondary"}
                  className="text-[10px]"
                >
                  Score de risque {payload.score_risque}/100
                </Badge>
              </header>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Recommandations et propositions de surveillance générées par l'IA — aide à la décision,
                ne se substitue pas à la prescription médicale.
              </p>

              {payload.synthese && (
                <div className="rounded-md border bg-white p-3 space-y-1">
                  <div className="flex items-center gap-2 text-xs font-semibold text-sky-900">
                    <FileText className="h-3.5 w-3.5" /> Synthèse clinique
                  </div>
                  <p className="text-xs leading-relaxed">{payload.synthese}</p>
                </div>
              )}

              {payload.conclusion_clinique && (
                <div className="rounded-md border bg-white p-3 space-y-1">
                  <div className="flex items-center gap-2 text-xs font-semibold text-sky-900">
                    <ShieldAlert className="h-3.5 w-3.5" /> Conduite à tenir
                  </div>
                  <p className="text-xs leading-relaxed">{payload.conclusion_clinique}</p>
                </div>
              )}

              {payload.surveillance && payload.surveillance.length > 0 && (
                <div className="rounded-md border bg-white p-3 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-sky-900">
                    <Activity className="h-3.5 w-3.5" /> Surveillance recommandée
                  </div>
                  <ul className="space-y-1.5">
                    {payload.surveillance.map((s, i) => (
                      <li key={i} className="text-xs border-l-2 border-sky-300 pl-2">
                        <div className="font-medium">
                          {s.parametre} <span className="text-muted-foreground font-normal">• {s.frequence}</span>
                        </div>
                        <div className="text-muted-foreground leading-snug">{s.justification}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          </>
        )}

        {!payload && !mut.isPending && (
          <p className="text-xs text-muted-foreground text-center py-2">Aucune analyse encore</p>
        )}
      </CardContent>
    </Card>
  );
}
