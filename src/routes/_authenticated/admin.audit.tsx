import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listAudit, verifyAuditChain } from "@/lib/audit/audit.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, ShieldAlert, Download, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/audit")({
  head: () => ({ meta: [{ title: "Journal d'audit · ConcilMed" }] }),
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
}

function toCsv(rows: Entry[]): string {
  const header = ["id", "created_at", "user_id", "action", "entity_type", "entity_id", "payload", "prev_hash", "hash"];
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [r.id, r.created_at, r.user_id ?? "", r.action, r.entity_type ?? "", r.entity_id ?? "", JSON.stringify(r.payload ?? {}), r.prev_hash ?? "", r.hash]
        .map(esc)
        .join(","),
    );
  }
  return lines.join("\n");
}

function AdminAuditPage() {
  const fetchAudit = useServerFn(listAudit);
  const verify = useServerFn(verifyAuditChain);

  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");

  const q = useQuery({
    queryKey: ["audit", action, entityType],
    queryFn: () =>
      fetchAudit({
        data: {
          limit: 200,
          action: action.trim() || undefined,
          entityType: entityType.trim() || undefined,
        },
      }),
  });

  const vq = useQuery({
    queryKey: ["audit-verify"],
    queryFn: () => verify({ data: { limit: 1000 } }),
  });

  const entries = (q.data?.entries ?? []) as Entry[];

  const csv = useMemo(() => toCsv(entries), [entries]);
  const download = () => {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`;
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
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle>Entrées récentes</CardTitle>
            <div className="flex gap-2 items-center">
              <Input
                placeholder="Filtre action…"
                value={action}
                onChange={(e) => setAction(e.target.value)}
                className="h-8 w-44"
              />
              <Input
                placeholder="Type entité…"
                value={entityType}
                onChange={(e) => setEntityType(e.target.value)}
                className="h-8 w-40"
              />
              <Button size="sm" variant="outline" onClick={download} disabled={entries.length === 0}>
                <Download className="h-3 w-3 mr-1" /> CSV
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
