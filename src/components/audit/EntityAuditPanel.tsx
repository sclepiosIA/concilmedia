// Piste #13 v2 — Panneau d'audit par entité (admin only).
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { listAudit } from "@/lib/audit/audit.functions";
import { isAdmin } from "@/lib/admin/ai.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollText } from "lucide-react";

export function EntityAuditPanel({
  entityType,
  entityId,
}: {
  entityType: "patient" | "episode" | "prescription" | "analysis" | "export" | "admin";
  entityId: string;
}) {
  const isAdminFn = useServerFn(isAdmin);
  const fetchAudit = useServerFn(listAudit);

  const adminQ = useQuery({
    queryKey: ["is-admin"],
    queryFn: () => isAdminFn(),
    staleTime: 5 * 60 * 1000,
  });

  const enabled = !!adminQ.data?.isAdmin;

  const q = useQuery({
    queryKey: ["entity-audit", entityType, entityId],
    queryFn: () => fetchAudit({ data: { entityType, entityId, limit: 20 } }),
    enabled,
  });

  if (!adminQ.data?.isAdmin) return null;

  const entries = q.data?.entries ?? [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <ScrollText className="h-4 w-4 text-muted-foreground" />
          Journal d'audit (admin)
        </CardTitle>
      </CardHeader>
      <CardContent className="text-xs space-y-2">
        {q.isLoading ? (
          <p className="text-muted-foreground">Chargement…</p>
        ) : entries.length === 0 ? (
          <p className="text-muted-foreground italic">Aucune entrée pour cette entité.</p>
        ) : (
          <ul className="space-y-1">
            {entries.map((e: any) => (
              <li key={e.id} className="flex items-center gap-2 border-b pb-1 last:border-0">
                <span className="font-mono text-[10px] text-muted-foreground whitespace-nowrap">
                  {new Date(e.created_at).toLocaleString("fr-FR")}
                </span>
                <Badge variant="secondary" className="text-[10px]">
                  {e.action}
                </Badge>
                <span className="font-mono text-[10px] text-muted-foreground truncate">
                  {e.user_id ? e.user_id.slice(0, 8) + "…" : "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link
          to="/admin/audit"
          search={{ entityType, entityId }}
          className="text-primary underline text-[11px]"
        >
          Voir tout dans l'admin →
        </Link>
      </CardContent>
    </Card>
  );
}
