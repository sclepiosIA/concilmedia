import { Badge } from "@/components/ui/badge";
import { ShieldAlert, Info } from "lucide-react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import type { RiskResult, RiskBreakdown } from "@/lib/conciliation/riskScore";
import { NIVEAU_LABEL } from "@/lib/conciliation/riskScore";

const COLORS: Record<RiskResult["niveau"], string> = {
  faible: "bg-green-100 text-green-800 hover:bg-green-100 border-green-200",
  modere: "bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200",
  eleve: "bg-orange-100 text-orange-800 hover:bg-orange-100 border-orange-200",
  critique: "bg-red-100 text-red-800 hover:bg-red-100 border-red-200",
};

interface Props {
  score: number;
  niveau: RiskResult["niveau"];
  /** Décomposition du score (depuis `risk_scores.variables.breakdown`). Si fourni, un popover d'explicabilité est affiché. */
  breakdown?: RiskBreakdown[] | null;
}

export function RiskScoreBadge({ score, niveau, breakdown }: Props) {
  const badge = (
    <Badge variant="outline" className={`gap-1 cursor-help ${COLORS[niveau]}`}>
      <ShieldAlert className="h-3 w-3" /> Risque {NIVEAU_LABEL[niveau]} · {score}/100
      {breakdown && breakdown.length > 0 && <Info className="h-3 w-3 ml-0.5 opacity-70" />}
    </Badge>
  );

  if (!breakdown || breakdown.length === 0) return badge;

  return (
    <HoverCard openDelay={150} closeDelay={100}>
      <HoverCardTrigger asChild>{badge}</HoverCardTrigger>
      <HoverCardContent className="w-80 p-0">
        <div className="px-3 py-2 border-b bg-muted/40">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Décomposition du score
          </div>
          <div className="text-sm font-medium mt-0.5">
            Total : {score}/100 · {NIVEAU_LABEL[niveau]}
          </div>
        </div>
        <ul className="px-3 py-2 space-y-1.5 text-xs max-h-72 overflow-auto">
          {breakdown.map((b, i) => (
            <li key={i} className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-foreground">{b.variable}</div>
                {b.detail && (
                  <div className="text-muted-foreground text-[11px] mt-0.5">{b.detail}</div>
                )}
              </div>
              <span className="font-semibold tabular-nums text-foreground shrink-0">
                +{b.contribution}
              </span>
            </li>
          ))}
        </ul>
        <div className="px-3 py-1.5 border-t text-[10px] text-muted-foreground bg-muted/20">
          Règle déterministe — modèle CHU Reims (Vallecillo et al., 2025)
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
