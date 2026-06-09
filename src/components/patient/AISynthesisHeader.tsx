import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, Pill, AlertTriangle, GitCompare, PackageMinus, Sliders, ShieldAlert, Lightbulb, FileSearch, Activity, ClipboardCheck, Stethoscope } from "lucide-react";
import { analyzePatientSynthesis } from "@/lib/conciliation/analyzePatientSynthesis.functions";
import type { AIAnalysisPayload } from "@/lib/conciliation/analyze.functions";
import { classifyDci } from "@/lib/conciliation/atcInteractions";
import { toast } from "sonner";

const HIGH_RISK_KEYS = new Set(["anticoagulant", "insuline", "antiepileptique", "antiarythmique", "opioide", "ains"]);

interface StatProps {
  icon: typeof Pill;
  label: string;
  value: number;
  tone: "blue" | "green" | "orange" | "red";
}

const TONE_BG: Record<StatProps["tone"], string> = {
  blue: "bg-blue-50 border-blue-200 text-blue-900",
  green: "bg-green-50 border-green-200 text-green-900",
  orange: "bg-amber-50 border-amber-200 text-amber-900",
  red: "bg-red-50 border-red-200 text-red-900",
};
const TONE_ICON: Record<StatProps["tone"], string> = {
  blue: "bg-blue-100 text-blue-700",
  green: "bg-green-100 text-green-700",
  orange: "bg-amber-100 text-amber-700",
  red: "bg-red-100 text-red-700",
};

function Stat({ icon: Icon, label, value, tone }: StatProps) {
  return (
    <div className={`rounded-lg border ${TONE_BG[tone]} p-3 flex items-center gap-3`}>
      <span className={`h-9 w-9 rounded-full flex items-center justify-center ${TONE_ICON[tone]} shrink-0`}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <div className="text-2xl font-bold leading-none">{value}</div>
        <div className="text-xs leading-tight mt-0.5">{label}</div>
      </div>
    </div>
  );
}

export function AISynthesisHeader({ patientId }: { patientId: string }) {
  const qc = useQueryClient();
  const analyzeFn = useServerFn(analyzePatientSynthesis);

  const { data: traitements = [] } = useQuery({
    queryKey: ["traitements", patientId],
    queryFn: async () =>
      (await supabase.from("traitements_habituels").select("*").eq("patient_id", patientId).eq("actif", true)).data ?? [],
  });
  const { data: analysis } = useQuery({
    queryKey: ["patient-synthesis-analysis", patientId],
    queryFn: async () =>
      (await supabase.from("conciliation_ai_analyses").select("*").eq("patient_id", patientId).is("episode_id", null).order("created_at", { ascending: false }).limit(1).maybeSingle()).data,
  });
  const { data: divergences = [] } = useQuery({
    queryKey: ["divergences-patient", patientId],
    queryFn: async () => {
      const { data: eps } = await supabase.from("episodes").select("id").eq("patient_id", patientId);
      const ids = (eps ?? []).map((e) => e.id);
      if (ids.length === 0) return [] as { type_divergence: string }[];
      return (await supabase.from("conciliation_medicaments").select("type_divergence").in("episode_id", ids)).data ?? [];
    },
  });

  const mut = useMutation({
    mutationFn: () => analyzeFn({ data: { patientId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patient-synthesis-analysis", patientId] });
      toast.success("Analyse IA terminée");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur IA"),
  });

  const payload = analysis?.payload as unknown as AIAnalysisPayload | undefined;
  const nbMedicaments = traitements.length;
  const nbInteractions = payload?.interactions?.length ?? 0;
  const nbDivergences = divergences.filter((d) => d.type_divergence && d.type_divergence !== "aucune").length;
  const nbManquants = divergences.filter((d) => d.type_divergence === "omission").length;
  const nbAdaptations = payload?.adaptations_posologiques?.length ?? 0;
  const nbHautRisque = traitements.filter((t) => HIGH_RISK_KEYS.has(classifyDci(t.dci || t.nom_commercial || ""))).length;

  const recos: string[] = [];
  if (payload?.interactions?.length) recos.push(`${payload.interactions.length} interaction(s) détectée(s) — vérifier les associations à risque`);
  if (payload?.contre_indications?.length) recos.push(`${payload.contre_indications.length} contre-indication(s) — revoir la prescription`);
  if (payload?.adaptations_posologiques?.length) recos.push(`${payload.adaptations_posologiques.length} adaptation(s) posologique(s) recommandée(s)`);
  if (payload?.doublons_therapeutiques?.length) recos.push(`${payload.doublons_therapeutiques.length} doublon(s) thérapeutique(s) identifié(s)`);
  if (nbManquants > 0) recos.push(`${nbManquants} médicament(s) manquant(s) lors des transitions de soins`);
  if (recos.length === 0 && payload) recos.push("Aucune anomalie majeure détectée par l'IA — surveillance standard recommandée");

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-blue-50/60 to-white shadow-sm">
      <CardContent className="py-4 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 font-semibold text-sm uppercase tracking-wide text-primary">
            <Sparkles className="h-4 w-4" />
            Synthèse IA — conciliation médicamenteuse
            {payload && <Badge variant="outline" className="ml-2 bg-white">Score risque {payload.score_risque}/100</Badge>}
          </div>
          <Button size="sm" variant={payload ? "outline" : "default"} onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
            {payload ? "Relancer l'analyse IA" : "Lancer l'analyse IA"}
          </Button>
        </div>

        <div className="grid gap-2 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          <Stat icon={Pill} label="Médicaments identifiés" value={nbMedicaments} tone="blue" />
          <Stat icon={AlertTriangle} label="Interactions détectées" value={nbInteractions} tone={nbInteractions > 0 ? "red" : "green"} />
          <Stat icon={GitCompare} label="Divergences détectées" value={nbDivergences} tone={nbDivergences > 0 ? "orange" : "green"} />
          <Stat icon={PackageMinus} label="Médicaments manquants" value={nbManquants} tone={nbManquants > 0 ? "red" : "green"} />
          <Stat icon={Sliders} label="Adaptations posologiques" value={nbAdaptations} tone={nbAdaptations > 0 ? "orange" : "green"} />
          <Stat icon={ShieldAlert} label="Traitements à haut risque" value={nbHautRisque} tone={nbHautRisque > 0 ? "red" : "green"} />
        </div>

        {payload?.synthese && (
          <div className="rounded-md border bg-white p-3 text-sm">
            <div className="flex items-center gap-2 font-medium mb-1">
              <Lightbulb className="h-4 w-4 text-primary" /> Synthèse clinique IA
            </div>
            <p className="text-muted-foreground">{payload.synthese}</p>
          </div>
        )}

        {recos.length > 0 && payload && (
          <div className="rounded-md border bg-white p-3">
            <div className="flex items-center gap-2 font-medium text-sm mb-1">
              <Lightbulb className="h-4 w-4 text-primary" /> Recommandations IA
            </div>
            <ul className="text-sm list-disc pl-5 space-y-0.5 text-foreground">
              {recos.map((r) => <li key={r}>{r}</li>)}
            </ul>
          </div>
        )}

        {!payload && (
          <div className="rounded-md border border-dashed bg-white p-3 text-sm text-muted-foreground text-center">
            Lancez l'analyse IA pour obtenir une synthèse pharmaceutique complète (interactions, contre-indications, adaptations posologiques, doublons).
          </div>
        )}
      </CardContent>
    </Card>
  );
}
