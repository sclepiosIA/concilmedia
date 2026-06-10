import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Brain, Cpu, AlertTriangle } from "lucide-react";

type RiskRow = {
  id: string;
  score: number;
  niveau: string;
  source: string;
  variables: Record<string, unknown> | null;
  created_at: string;
};

function variantFor(score: number) {
  if (score >= 66) return "destructive" as const;
  if (score >= 33) return "default" as const;
  return "secondary" as const;
}

export function RiskScoreCompare({ episodeId }: { episodeId: string }) {
  const { data } = useQuery({
    queryKey: ["risk-scores-compare", episodeId],
    queryFn: async () => {
      const { data } = await supabase
        .from("risk_scores")
        .select("id, score, niveau, source, variables, created_at")
        .eq("episode_id", episodeId)
        .order("created_at", { ascending: false })
        .limit(10);
      return (data ?? []) as RiskRow[];
    },
  });

  if (!data || data.length === 0) return null;

  const llm = data.find((r) => r.source === "llm");
  const ml = data.find((r) => r.source === "ml");
  if (!llm && !ml) return null;

  const showBoth = llm && ml;
  let agreement: "consensus" | "divergence" | null = null;
  if (showBoth) {
    agreement = Math.abs(llm.score - ml.score) <= 15 ? "consensus" : "divergence";
  }

  return (
    <section className="rounded-lg border-2 border-violet-300 bg-violet-50/60 p-3 space-y-3">
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-semibold text-violet-900 flex items-center gap-2">
          <Brain className="h-4 w-4" /> Score de priorisation — LLM vs ML
        </h3>
        {agreement && (
          <Badge variant={agreement === "consensus" ? "secondary" : "destructive"} className="text-[10px]">
            {agreement === "consensus" ? "Consensus" : (
              <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Divergence</span>
            )}
          </Badge>
        )}
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {llm && (
          <div className="rounded border bg-background p-3 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium flex items-center gap-1"><Brain className="h-3 w-3" /> LLM / règles</span>
              <Badge variant={variantFor(llm.score)} className="text-[10px]">{llm.score}/100</Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">Niveau : {llm.niveau}</p>
          </div>
        )}
        {ml && (
          <div className="rounded border bg-background p-3 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium flex items-center gap-1"><Cpu className="h-3 w-3" /> ML ConcilMed</span>
              <Badge variant={variantFor(ml.score)} className="text-[10px]">{ml.score}/100</Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Niveau : {ml.niveau} ·{" "}
              <code className="text-[10px]">
                {(ml.variables?.model_version as string | undefined) ?? "n/a"}
              </code>
            </p>
          </div>
        )}
      </div>
      {showBoth && agreement === "divergence" && (
        <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded p-2">
          Les deux moteurs diffèrent de plus de 15 points. Décision clinique recommandée.
        </p>
      )}
    </section>
  );
}
