import { CheckCircle2, AlertCircle, AlertTriangle, XCircle, HelpCircle, Loader2, Sparkles } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { STATUS_META, type MatchStatus } from "@/lib/conciliation/prescriptionMatch";

const ICON: Record<MatchStatus, React.ComponentType<{ className?: string }>> = {
  vert: CheckCircle2,
  jaune: AlertCircle,
  orange: AlertTriangle,
  rouge: XCircle,
  gris: HelpCircle,
  en_cours: Loader2,
};

export function MatchStatusBadge({
  status,
  reason,
  recommandation,
  source,
}: {
  status: MatchStatus;
  reason?: string | null;
  recommandation?: string | null;
  source?: string | null;
}) {
  const meta = STATUS_META[status];
  const Icon = ICON[status];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={meta.label}
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${meta.dot} text-white hover:scale-110 transition-transform`}
        >
          <Icon className={`h-3.5 w-3.5 ${status === "en_cours" ? "animate-spin" : ""}`} />
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="start" className="w-80 text-sm space-y-2">
        <div className={`font-semibold ${meta.text}`}>{meta.label}</div>
        {reason && <div className="text-foreground/80">{reason}</div>}
        {recommandation && (
          <div className="rounded-md bg-muted/50 p-2 text-xs">
            <div className="font-medium mb-0.5 flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> Recommandation
            </div>
            {recommandation}
          </div>
        )}
        {source && (
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
            Source : {source === "ia" ? "Analyse IA" : "Règles automatiques"}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function MatchLegend() {
  const items: MatchStatus[] = ["vert", "jaune", "orange", "rouge"];
  return (
    <div className="flex flex-wrap gap-2 text-[10px]">
      {items.map((s) => {
        const m = STATUS_META[s];
        return (
          <div key={s} className="flex items-center gap-1">
            <span className={`h-2 w-2 rounded-full ${m.dot}`} />
            <span className="text-muted-foreground">{m.label}</span>
          </div>
        );
      })}
    </div>
  );
}
