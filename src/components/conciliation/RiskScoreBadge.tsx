import { Badge } from "@/components/ui/badge";
import { ShieldAlert } from "lucide-react";
import type { RiskResult } from "@/lib/conciliation/riskScore";
import { NIVEAU_LABEL } from "@/lib/conciliation/riskScore";

const COLORS: Record<RiskResult["niveau"], string> = {
  faible: "bg-green-100 text-green-800 hover:bg-green-100 border-green-200",
  modere: "bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200",
  eleve: "bg-orange-100 text-orange-800 hover:bg-orange-100 border-orange-200",
  critique: "bg-red-100 text-red-800 hover:bg-red-100 border-red-200",
};

export function RiskScoreBadge({ score, niveau }: { score: number; niveau: RiskResult["niveau"] }) {
  return (
    <Badge variant="outline" className={`gap-1 ${COLORS[niveau]}`}>
      <ShieldAlert className="h-3 w-3" /> Risque {NIVEAU_LABEL[niveau]} · {score}/100
    </Badge>
  );
}
