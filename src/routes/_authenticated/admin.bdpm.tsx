import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { importBdpm, getBdpmStatus } from "@/lib/bdpm/importBdpm.functions";
import { backfillBdpmEnrichment } from "@/lib/bdpm/backfillBdpm.functions";
import { searchBdpm, type BdpmSearchHit } from "@/lib/bdpm/searchBdpm.functions";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Database, RefreshCw, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/bdpm")({
  component: BdpmAdminPage,
});

function BdpmAdminPage() {
  const statusFn = useServerFn(getBdpmStatus);
  const importFn = useServerFn(importBdpm);
  const searchFn = useServerFn(searchBdpm);
  const backfillFn = useServerFn(backfillBdpmEnrichment);
  const qc = useQueryClient();

  const { data: status, isLoading } = useQuery({
    queryKey: ["bdpm-status"],
    queryFn: () => statusFn(),
  });

  const importMut = useMutation({
    mutationFn: importFn,
    onSuccess: (res) => {
      toast.success(`Import terminé · ${res.rowsTotal} lignes`);
      qc.invalidateQueries({ queryKey: ["bdpm-status"] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Échec de l'import BDPM"),
  });

  const backfillMut = useMutation({
    mutationFn: backfillFn,
    onSuccess: (res) =>
      toast.success(
        `Backfill terminé · traitements ${res.traitements.updated}/${res.traitements.scanned} · prescriptions ${res.prescriptions.updated}/${res.prescriptions.scanned}`,
      ),
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Échec du backfill"),
  });


  const [q, setQ] = useState("");
  const [hits, setHits] = useState<BdpmSearchHit[]>([]);
  const [searching, setSearching] = useState(false);

  const doSearch = async () => {
    if (q.trim().length < 2) return;
    try {
      setSearching(true);
      const res = await searchFn({ data: { q: q.trim() } });
      setHits(res.hits);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Recherche échouée");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Database className="w-6 h-6" />
          BDPM — Base de Données Publique des Médicaments
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Référentiel ANSM importé localement. Source officielle pour la normalisation DCI / ATC.
        </p>
      </div>

      <Card className="p-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="grid grid-cols-3 gap-4 text-sm flex-1">
            <Stat label="Spécialités (CIS)" value={isLoading ? "…" : (status?.specialites ?? 0).toLocaleString("fr-FR")} />
            <Stat label="Présentations (CIP)" value={isLoading ? "…" : (status?.presentations ?? 0).toLocaleString("fr-FR")} />
            <Stat label="Codes ATC" value={isLoading ? "…" : (status?.atc ?? 0).toLocaleString("fr-FR")} />
          </div>
          <Button onClick={() => importMut.mutate(undefined)} disabled={importMut.isPending}>
            <RefreshCw className={`w-4 h-4 mr-2 ${importMut.isPending ? "animate-spin" : ""}`} />
            {importMut.isPending ? "Import en cours…" : "Synchroniser BDPM"}
          </Button>
          <Button
            variant="outline"
            onClick={() => backfillMut.mutate(undefined)}
            disabled={backfillMut.isPending || (status?.specialites ?? 0) === 0}
          >
            {backfillMut.isPending ? "Backfill en cours…" : "Backfill CIS/ATC existant"}
          </Button>

        </div>
        {status?.lastRun && (
          <div className="mt-4 text-xs text-muted-foreground border-t pt-3">
            Dernier import : {new Date(status.lastRun.started_at as string).toLocaleString("fr-FR")} ·{" "}
            <Badge
              variant={status.lastRun.status === "success" ? "default" : "destructive"}
              className={status.lastRun.status === "success" ? "bg-emerald-600" : ""}
            >
              {status.lastRun.status}
            </Badge>{" "}
            · {status.lastRun.rows_total ?? 0} lignes
            {status.lastRun.error && <div className="text-red-600 mt-1">Erreur : {status.lastRun.error}</div>}
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-3">
          L'import télécharge ~5 fichiers depuis base-donnees-publique.medicaments.gouv.fr et upserte ~15 000 spécialités. Compte 30 à 90 secondes.
        </p>
      </Card>

      <Card className="p-4">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <Search className="w-4 h-4" /> Recherche test
        </h2>
        <div className="flex gap-2 mb-4">
          <Input
            placeholder="Ex: doliprane, paracétamol, eliquis…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doSearch()}
          />
          <Button onClick={doSearch} disabled={searching || q.trim().length < 2}>
            {searching ? "…" : "Chercher"}
          </Button>
        </div>
        {hits.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>CIS</TableHead>
                <TableHead>Dénomination</TableHead>
                <TableHead>DCI</TableHead>
                <TableHead>ATC</TableHead>
                <TableHead>Forme</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hits.map((h) => (
                <TableRow key={h.cis}>
                  <TableCell className="font-mono text-xs">{h.cis}</TableCell>
                  <TableCell className="text-sm">{h.denomination}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{h.dci ?? "—"}</TableCell>
                  <TableCell className="text-xs">
                    {h.code_atc ? <Badge variant="outline">{h.code_atc}</Badge> : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{h.forme ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
    </div>
  );
}
