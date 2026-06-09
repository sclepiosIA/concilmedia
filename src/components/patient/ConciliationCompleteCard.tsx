import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, ClipboardList, Stethoscope, Activity, ShieldAlert, FileText } from "lucide-react";
import { analyzePatientConciliationComplete } from "@/lib/conciliation/analyzePatientConciliationComplete.functions";
import type { AIAnalysisPayload } from "@/lib/conciliation/analyze.functions";
import { ClinicalAlertsPanel } from "@/components/conciliation/ClinicalAlertsPanel";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

export function ConciliationCompleteCard({ patientId }: { patientId: string }) {
  const qc = useQueryClient();
  const analyzeFn = useServerFn(analyzePatientConciliationComplete);

  const { data: latest } = useQuery({
    queryKey: ["patient-conciliation-complete", patientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("conciliation_ai_analyses")
        .select("*")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .eq("patient_id", patientId)
        .is("episode_id", null)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .eq("analysis_type" as any, "conciliation_complete")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const mut = useMutation({
    mutationFn: () => analyzeFn({ data: { patientId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patient-conciliation-complete", patientId] });
      toast.success("Conciliation pharmaceutique complète terminée");
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
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-xs text-muted-foreground">
          {latest?.created_at
            ? `Dernière analyse ${formatDistanceToNow(new Date(latest.created_at), { addSuffix: true, locale: fr })}`
            : "Aucune analyse réalisée"}
        </div>
        <Button onClick={() => mut.mutate()} disabled={mut.isPending} size="sm">
          {mut.isPending ? (
            <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Analyse en cours…</>
          ) : (
            <><Sparkles className="h-4 w-4 mr-1" /> {payload ? "Relancer la conciliation" : "Lancer la conciliation complète"}</>
          )}
        </Button>
      </div>

      {!payload && !mut.isPending && (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          Cliquez sur « Lancer la conciliation complète » pour analyser le dossier (traitements ville, prescriptions hospitalières, biologie, allergies, comorbidités).
        </div>
      )}

      {payload && (
        <>
          <section className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4 space-y-3">
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
              Comparaison traitements ville ↔ prescriptions hospitalières dans le contexte clinique : interactions, contre-indications, adaptations posologiques, doublons, médicaments à haut risque, allergies croisées.
            </p>
            {totalAlertes > 0 ? (
              <ClinicalAlertsPanel payload={payload} />
            ) : (
              <p className="text-xs text-muted-foreground italic">Aucun problème médicamenteux détecté.</p>
            )}
          </section>

          <section className="rounded-lg border-2 border-sky-300 bg-sky-50/60 p-4 space-y-3">
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
              Recommandations et propositions de surveillance générées par l'IA — aide à la décision, ne se substitue pas à la prescription médicale.
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
    </div>
  );
}
