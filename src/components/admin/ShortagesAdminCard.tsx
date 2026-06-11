import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { getShortagesStats, triggerShortagesSync } from "@/lib/admin/shortages.functions";

export function ShortagesAdminCard() {
  const qc = useQueryClient();
  const statsFn = useServerFn(getShortagesStats);
  const syncFn = useServerFn(triggerShortagesSync);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-shortages-stats"],
    queryFn: () => statsFn(),
  });

  const mut = useMutation({
    mutationFn: () => syncFn(),
    onSuccess: (res) => {
      toast.success(`Sync ANSM: ${res.imported} entrées importées`);
      qc.invalidateQueries({ queryKey: ["admin-shortages-stats"] });
    },
    onError: (e) => toast.error(`Sync échouée : ${e instanceof Error ? e.message : String(e)}`),
  });

  const stats = data;
  return (
    <Card className="p-4 mb-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <h2 className="font-semibold">Tensions & ruptures d'approvisionnement (ANSM)</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Données importées depuis l'open data ANSM. Cron quotidien (06:00 UTC) + déclenchement manuel.
          </p>
          {isLoading ? (
            <div className="text-xs text-muted-foreground">Chargement…</div>
          ) : (
            <div className="flex gap-2 flex-wrap text-xs">
              <Badge variant="outline">Total: {stats?.total ?? 0}</Badge>
              {stats?.byStatus &&
                Object.entries(stats.byStatus).map(([k, v]) => (
                  <Badge key={k} variant="secondary">
                    {k}: {v}
                  </Badge>
                ))}
              {stats?.lastImport && (
                <Badge variant="outline">
                  Dernier import: {new Date(stats.lastImport).toLocaleString("fr-FR")}
                </Badge>
              )}
            </div>
          )}
        </div>
        <Button
          size="sm"
          onClick={() => mut.mutate()}
          disabled={mut.isPending}
          className="shrink-0"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${mut.isPending ? "animate-spin" : ""}`} />
          {mut.isPending ? "Synchronisation…" : "Synchroniser maintenant"}
        </Button>
      </div>
    </Card>
  );
}
