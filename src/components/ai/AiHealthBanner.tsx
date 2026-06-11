import { useAiHealth } from "@/hooks/useAiHealth";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

export function AiHealthBanner() {
  const { degraded, down, message, refresh, isLoading } = useAiHealth();
  if (isLoading || !degraded) return null;
  const isDown = down;
  return (
    <div
      role="status"
      className={
        "border-b text-sm px-4 py-2 flex items-center gap-3 " +
        (isDown
          ? "bg-destructive/10 border-destructive/30 text-destructive"
          : "bg-amber-50 border-amber-200 text-amber-900")
      }
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <div className="flex-1">
        <strong className="font-semibold">Mode dégradé — </strong>
        <span>
          {message} La conciliation algorithmique, le score iatrogène et les exports restent opérationnels.
        </span>
      </div>
      <Button size="sm" variant="outline" onClick={() => refresh()}>
        <RefreshCw className="h-3.5 w-3.5 mr-1" /> Réessayer
      </Button>
    </div>
  );
}

export function AiHealthIndicator() {
  const { status, message, latencyMs, refresh } = useAiHealth();
  const color =
    status === "ok"
      ? "bg-emerald-500"
      : status === "degraded"
        ? "bg-amber-500"
        : status === "down"
          ? "bg-destructive"
          : "bg-muted-foreground";
  const label =
    status === "ok"
      ? "IA opérationnelle"
      : status === "degraded"
        ? "IA en mode dégradé"
        : status === "down"
          ? "IA indisponible"
          : "IA — vérification…";
  return (
    <button
      type="button"
      onClick={() => refresh()}
      title={`${label}${latencyMs !== null ? ` • ${latencyMs} ms` : ""}\n${message}`}
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full hover:bg-accent transition-colors text-xs"
      aria-label={label}
    >
      <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
      <span className="hidden md:inline text-muted-foreground">IA</span>
    </button>
  );
}
