import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { listAudit, verifyAuditChain, exportAuditSigned, getAuditRetentionStats } from "@/lib/audit/audit.functions";
import { audit } from "@/lib/audit/auditClient";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "@/lib/audit/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, ShieldAlert, Download, RefreshCw, FileSignature, Archive } from "lucide-react";

const auditSearchSchema = z.object({
  action: fallback(z.string(), "").default(""),
  entityType: fallback(z.string(), "").default(""),
  entityId: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/_authenticated/admin/audit")({
  head: () => ({ meta: [{ title: "Journal d'audit · ConcilMed" }] }),
  validateSearch: zodValidator(auditSearchSchema),
  component: AdminAuditPage,
});

interface Entry {
  id: string;
  created_at: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  payload: Record<string, unknown>;
  prev_hash: string | null;
  hash: string;
  retention_class?: string | null;
}

function toCsv(rows: Entry[]): string {
  const header = ["id", "created_at", "user_id", "action", "entity_type", "entity_id", "payload", "prev_hash", "hash", "retention_class"];
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [r.id, r.created_at, r.user_id ?? "", r.action, r.entity_type ?? "", r.entity_id ?? "", JSON.stringify(r.payload ?? {}), r.prev_hash ?? "", r.hash, r.retention_class ?? "standard"]
        .map(esc)
        .join(","),
    );
  }
  return lines.join("\n");
}

function AdminAuditPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const fetchAudit = useServerFn(listAudit);
  const verify = useServerFn(verifyAuditChain);
  const exportSigned = useServerFn(exportAuditSigned);
  const retentionStats = useServerFn(getAuditRetentionStats);

  const [action, setAction] = useState(search.action);
  const [entityType, setEntityType] = useState(search.entityType);
  const [entityId, setEntityId] = useState(search.entityId);

  // Sync URL → state when search params change externally
  useEffect(() => {
    setAction(search.action);
    setEntityType(search.entityType);
    setEntityId(search.entityId);
  }, [search.action, search.entityType, search.entityId]);

  const applyFilters = () => {
    navigate({
      search: {
        action: action.trim(),
        entityType: entityType.trim(),
        entityId: entityId.trim(),
      },
      replace: true,
    });
  };

  const q = useQuery({
    queryKey: ["audit", search.action, search.entityType, search.entityId],
    queryFn: () =>
      fetchAudit({
        data: {
          limit: 200,
          action: search.action.trim() || undefined,
          entityType: search.entityType.trim() || undefined,
          entityId: search.entityId.trim() || undefined,
        },
      }),
  });

  const vq = useQuery({
    queryKey: ["audit-verify"],
    queryFn: () => verify({ data: { limit: 1000 } }),
  });

  const rq = useQuery({
    queryKey: ["audit-retention"],
    queryFn: () => retentionStats(),
  });

  const entries = (q.data?.entries ?? []) as Entry[];

  const csv = useMemo(() => toCsv(entries), [entries]);
  const downloadCsv = () => {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    audit(AUDIT_ACTIONS.EXPORT_AUDIT_CSV, AUDIT_ENTITY_TYPES.EXPORT, "audit_log", { count: entries.length });
  };

  const downloadSigned = async () => {
    const bundle = await exportSigned({ data: { limit: 5000 } });
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-signed-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Journal d'audit</h1>
        <p className="text-muted-foreground mt-1">
          Journal append-only avec chaînage cryptographique (SHA-256). Conforme aux exigences de traçabilité HDS / HAS / ISO 27001.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {vq.data?.valid ? (
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
            ) : (
              <ShieldAlert className="h-5 w-5 text-destructive" />
            )}
            Intégrité de la chaîne
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          {vq.isLoading && <span className="text-muted-foreground">Vérification…</span>}
          {vq.data && (
            <>
              <div>
                <strong>{vq.data.count}</strong> entrées vérifiées —{" "}
                {vq.data.valid ? (
                  <span className="text-emerald-700">chaîne intacte ✓</span>
                ) : (
                  <span className="text-destructive">
                    rupture détectée à l'entrée {vq.data.firstBreakAt}
                  </span>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={() => vq.refetch()} className="px-0">
                <RefreshCw className="h-3 w-3 mr-1" /> Re-vérifier
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Archive className="h-5 w-5 text-muted-foreground" />
            Politique de rétention
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          {rq.isLoading ? (
            <span className="text-muted-foreground">Chargement…</span>
          ) : rq.data ? (
            <>
              <div className="grid grid-cols-3 gap-3 max-w-xl">
                <div className="rounded-md border p-2">
                  <div className="text-[11px] text-muted-foreground">Standard (5 ans)</div>
                  <div className="text-lg font-bold">{rq.data.byClass.standard ?? 0}</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="text-[11px] text-muted-foreground">Sensible (10 ans)</div>
                  <div className="text-lg font-bold">{rq.data.byClass.sensitive ?? 0}</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="text-[11px] text-muted-foreground">Permanent</div>
                  <div className="text-lg font-bold">{rq.data.byClass.permanent ?? 0}</div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Total : <strong>{rq.data.total}</strong> · Plus ancienne entrée :{" "}
                {rq.data.oldest ? new Date(rq.data.oldest).toLocaleDateString("fr-FR") : "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                Aucune purge automatique en v2 — la suppression romprait la chaîne cryptographique. Contacter le DPO pour toute demande
                d'effacement (RGPD article 17). La purge avec re-chaînage Merkle est prévue en v3.
              </p>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle>Entrées récentes</CardTitle>
            <div className="flex gap-2 items-center flex-wrap">
              <Input
                placeholder="Filtre action…"
                value={action}
                onChange={(e) => setAction(e.target.value)}
                onBlur={applyFilters}
                onKeyDown={(e) => e.key === "Enter" && applyFilters()}
                className="h-8 w-44"
              />
              <Input
                placeholder="Type entité…"
                value={entityType}
                onChange={(e) => setEntityType(e.target.value)}
                onBlur={applyFilters}
                onKeyDown={(e) => e.key === "Enter" && applyFilters()}
                className="h-8 w-36"
              />
              <Input
                placeholder="ID entité…"
                value={entityId}
                onChange={(e) => setEntityId(e.target.value)}
                onBlur={applyFilters}
                onKeyDown={(e) => e.key === "Enter" && applyFilters()}
                className="h-8 w-44"
              />
              <Button size="sm" variant="outline" onClick={downloadCsv} disabled={entries.length === 0}>
                <Download className="h-3 w-3 mr-1" /> CSV
              </Button>
              <Button size="sm" variant="outline" onClick={downloadSigned}>
                <FileSignature className="h-3 w-3 mr-1" /> Export signé (JSON)
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {q.isLoading ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune entrée.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr className="border-b">
                    <th className="text-left py-1 pr-2">Date</th>
                    <th className="text-left py-1 pr-2">Action</th>
                    <th className="text-left py-1 pr-2">Entité</th>
                    <th className="text-left py-1 pr-2">Utilisateur</th>
                    <th className="text-left py-1 pr-2">Rétention</th>
                    <th className="text-left py-1 pr-2">Hash</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id} className="border-b align-top">
                      <td className="py-1 pr-2 whitespace-nowrap font-mono">
                        {new Date(e.created_at).toLocaleString("fr-FR")}
                      </td>
                      <td className="py-1 pr-2">
                        <Badge variant="secondary">{e.action}</Badge>
                      </td>
                      <td className="py-1 pr-2 font-mono">
                        {e.entity_type ?? "—"}
                        {e.entity_id ? ` / ${e.entity_id.slice(0, 8)}…` : ""}
                      </td>
                      <td className="py-1 pr-2 font-mono">{e.user_id ? e.user_id.slice(0, 8) + "…" : "—"}</td>
                      <td className="py-1 pr-2">
                        <Badge variant="outline" className="text-[10px]">
                          {e.retention_class ?? "standard"}
                        </Badge>
                      </td>
                      <td className="py-1 pr-2 font-mono text-[10px] text-muted-foreground">
                        {e.hash.slice(0, 12)}…
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
