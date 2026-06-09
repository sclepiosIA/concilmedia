import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, AlertTriangle, Loader2 } from "lucide-react";
import { analyzeConciliation, type AIAnalysisPayload } from "@/lib/conciliation/analyze.functions";
import { toast } from "sonner";
import { ClinicalAlertsPanel } from "@/components/conciliation/ClinicalAlertsPanel";

export function AIAnalysisPanel({ episodeId }: { episodeId: string }) {
  const qc = useQueryClient();
  const analyzeFn = useServerFn(analyzeConciliation);

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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ai-analysis", episodeId] }); toast.success("Analyse IA terminée"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur IA"),
  });

  const payload = latest?.payload as unknown as AIAnalysisPayload | undefined;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Analyse IA</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button onClick={() => mut.mutate()} disabled={mut.isPending} className="w-full" size="sm">
          {mut.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Analyse…</> : <><Sparkles className="h-4 w-4 mr-1" /> Lancer l'analyse</>}
        </Button>
        {payload && (
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Score de risque</span>
              <Badge variant={payload.score_risque > 60 ? "destructive" : payload.score_risque > 30 ? "default" : "secondary"}>
                {payload.score_risque}/100
              </Badge>
            </div>
            <p className="text-xs">{payload.synthese}</p>
            {payload.interactions?.length > 0 && (
              <Section title={`Interactions (${payload.interactions.length})`}>
                {payload.interactions.map((i, k) => (
                  <Item key={k} title={`${i.dci_1} ↔ ${i.dci_2}`} sub={`${i.severite} — ${i.mecanisme}`} note={i.recommandation} />
                ))}
              </Section>
            )}
            {payload.contre_indications?.length > 0 && (
              <Section title={`Contre-indications (${payload.contre_indications.length})`}>
                {payload.contre_indications.map((c, k) => <Item key={k} title={c.medicament} sub={c.raison} note={c.recommandation} />)}
              </Section>
            )}
            {payload.doublons_therapeutiques?.length > 0 && (
              <Section title={`Doublons (${payload.doublons_therapeutiques.length})`}>
                {payload.doublons_therapeutiques.map((d, k) => <Item key={k} title={d.medicaments.join(" + ")} sub={d.classe} note={d.recommandation} />)}
              </Section>
            )}
            {payload.adaptations_posologiques?.length > 0 && (
              <Section title={`Adaptations (${payload.adaptations_posologiques.length})`}>
                {payload.adaptations_posologiques.map((a, k) => <Item key={k} title={a.medicament} sub={a.raison} note={a.recommandation} />)}
              </Section>
            )}
          </div>
        )}
        {!payload && !mut.isPending && (
          <p className="text-xs text-muted-foreground text-center py-2">Aucune analyse encore</p>
        )}
      </CardContent>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold text-muted-foreground uppercase mb-1 flex items-center gap-1">
        <AlertTriangle className="h-3 w-3" /> {title}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Item({ title, sub, note }: { title: string; sub?: string; note?: string }) {
  return (
    <div className="border rounded p-2 text-xs">
      <div className="font-medium">{title}</div>
      {sub && <div className="text-muted-foreground">{sub}</div>}
      {note && <div className="mt-1 italic">→ {note}</div>}
    </div>
  );
}
