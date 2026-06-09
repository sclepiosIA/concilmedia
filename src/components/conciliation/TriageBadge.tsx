import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TRIAGE_META, type TriageLevel } from "@/lib/conciliation/triageScale";

interface TriageBadgeProps {
  level: TriageLevel;
  reason?: string;
  size?: "sm" | "md";
}

export function TriageBadge({ level, reason, size = "md" }: TriageBadgeProps) {
  const meta = TRIAGE_META[level];
  const px = size === "sm" ? 24 : 30;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            aria-label={`Priorité ${meta.code} — ${meta.label}`}
            className="inline-flex items-center justify-center rounded-md font-display font-bold shadow-sm select-none"
            style={{
              width: px,
              height: px,
              background: meta.swatch,
              color: meta.fg,
              border: `1px solid ${meta.ring}`,
              fontSize: size === "sm" ? 11 : 13,
              letterSpacing: "-0.02em",
            }}
          >
            {meta.code}
          </span>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs">
          <div className="space-y-0.5">
            <div className="font-semibold">{meta.code} — {meta.label}</div>
            <div className="text-xs opacity-90">{meta.delay}</div>
            {reason && <div className="text-xs pt-1 border-t border-border/40 mt-1">{reason}</div>}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function TriageLegend() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
      {([1, 2, 3, 4, 5] as TriageLevel[]).map((l) => {
        const m = TRIAGE_META[l];
        return (
          <div key={l} className="flex items-start gap-2 rounded-md p-2" style={{ background: m.bg, border: `1px solid ${m.ring}` }}>
            <TriageBadge level={l} size="sm" />
            <div className="text-xs leading-tight">
              <div className="font-semibold" style={{ color: m.fg }}>{m.label}</div>
              <div className="opacity-75" style={{ color: m.fg }}>{m.delay}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
