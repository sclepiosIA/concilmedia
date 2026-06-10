import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TRIAGE_META, type TriageLevel, type TriageDetails, type NiveauRisque } from "@/lib/conciliation/triageScale";

interface TriageBadgeProps {
  level: TriageLevel;
  reason?: string;
  details?: TriageDetails;
  size?: "sm" | "md";
}

const GRAVITE_DOT: Record<string, string> = {
  mineur: "bg-yellow-500",
  modere: "bg-orange-500",
  majeur: "bg-red-500",
  critique: "bg-red-700",
};

const RISK_LABEL: Record<NiveauRisque, string> = {
  faible: "Faible",
  modere: "Modéré",
  eleve: "Élevé",
  critique: "Critique",
};

const RISK_DOT: Record<NiveauRisque, string> = {
  faible: "bg-green-500",
  modere: "bg-orange-500",
  eleve: "bg-red-500",
  critique: "bg-red-700",
};

function TriageDetailsBlock({ details, reason }: { details?: TriageDetails; reason?: string }) {
  if (!details) {
    return reason ? <div className="text-xs italic opacity-90 pt-1">{reason}</div> : null;
  }
  const { divergences, nbNonIntentionnelles, worstRisk, hasValidation, hasActiveEpisode, pendingSinceHours } = details;
  const totalDiv = divergences.mineur + divergences.modere + divergences.majeur + divergences.critique;
  return (
    <div className="space-y-1.5 text-xs">
      <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
        <span className="opacity-70">Épisode actif</span>
        <span className="font-medium">{hasActiveEpisode ? "Oui" : "Non"}</span>

        <span className="opacity-70">Validation pharmacien</span>
        <span className="font-medium">{hasValidation ? "✔ Oui" : "✘ Non"}</span>

        <span className="opacity-70">Score de risque</span>
        {worstRisk ? (
          <span className="inline-flex items-center gap-1.5">
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${RISK_DOT[worstRisk]}`} />
            <span className="font-medium">{RISK_LABEL[worstRisk]}</span>
          </span>
        ) : (
          <span className="italic opacity-70">non calculé</span>
        )}


        {pendingSinceHours != null && (
          <>
            <span className="opacity-70">En attente depuis</span>
            <span className="font-medium">{pendingSinceHours} h</span>
          </>
        )}
      </div>

      {totalDiv > 0 && (
        <div className="border-t border-border/40 pt-1.5">
          <div className="opacity-70 mb-1">Divergences non résolues</div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            {(["critique", "majeur", "modere", "mineur"] as const).map((g) =>
              divergences[g] > 0 ? (
                <span key={g} className="inline-flex items-center gap-1">
                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${GRAVITE_DOT[g]}`} />
                  <span className="font-medium tabular-nums">{divergences[g]}</span>
                  <span className="opacity-70">{g}</span>
                </span>
              ) : null,
            )}
          </div>
          {nbNonIntentionnelles > 0 && (
            <div className="opacity-80 mt-0.5">
              dont <span className="font-medium">{nbNonIntentionnelles}</span> non intentionnelle(s)
            </div>
          )}
        </div>
      )}

      {reason && (
        <div className="border-t border-border/40 pt-1.5 italic opacity-80">{reason}</div>
      )}
    </div>
  );
}

export function TriageBadge({ level, reason, details, size = "md" }: TriageBadgeProps) {
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
        <TooltipContent side="right" className="max-w-sm">
          <div className="space-y-1.5">
            <div>
              <div className="font-semibold text-sm">{meta.code} — {meta.label}</div>
              <div className="text-xs opacity-80">{meta.delay}</div>
            </div>
            <TriageDetailsBlock details={details} reason={reason} />
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
