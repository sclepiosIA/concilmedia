import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Database, Upload, Plus, CheckCircle2, AlertTriangle, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  simulateHmdImport,
  importHmdManual,
  listHmdImports,
  addHmdToTraitementsHabituels,
} from "@/lib/dmp/hmdImport.functions";

interface ReconItem {
  dci: string;
  derniere_delivrance: string;
  nb_delivrances_12m: number;
  present_habituels: boolean;
  proposition: "deja_present" | "a_ajouter" | "a_verifier";
  notes?: string;
}
interface ImportRow {
  id: string;
  source: string;
  imported_at: string;
  period_start: string | null;
  period_end: string | null;
  lines: unknown[];
  reconciliation: { items: ReconItem[]; summary: { lignes_hmd: number; molecules_distinctes: number; a_ajouter: number; deja_present: number } } | null;
  status: string;
}

function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const sep = lines[0].includes(";") ? ";" : ",";
  const header = lines[0].split(sep).map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((l) => {
    const cells = l.split(sep);
    const row: Record<string, string> = {};
    header.forEach((h, i) => (row[h] = (cells[i] ?? "").trim()));
    return row;
  });
}

export function DmpHmdSection({ patientId }: { patientId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listHmdImports);
  const simFn = useServerFn(simulateHmdImport);
  const manualFn = useServerFn(importHmdManual);
  const addFn = useServerFn(addHmdToTraitementsHabituels);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});

  const q = useQuery({
    queryKey: ["dmp-hmd", patientId],
    queryFn: () => listFn({ data: { patientId } }) as Promise<ImportRow[]>,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["dmp-hmd", patientId] });

  const simulate = useMutation({
    mutationFn: () => simFn({ data: { patientId } }),
    onSuccess: (r) => {
      toast.success(`HMD simulé importé : ${r.summary.lignes_hmd} délivrances, ${r.summary.a_ajouter} à ajouter`);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const importManual = useMutation({
    mutationFn: (lines: Array<{ date_delivrance: string; dci: string; [k: string]: string }>) =>
      manualFn({ data: { patientId, source: "csv_manuel", lines } }),
    onSuccess: (r) => {
      toast.success(`Import HMD : ${r.summary.lignes_hmd} délivrances`);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addToHabituels = useMutation({
    mutationFn: (v: { importId: string; dcis: string[] }) => addFn({ data: v }),
    onSuccess: (r) => {
      toast.success(`${r.inserted} traitement(s) ajouté(s) aux habituels`);
      refresh();
      qc.invalidateQueries({ queryKey: ["traitements_habituels", patientId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onCsvUpload = async (file: File) => {
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      const lines = rows
        .map((r) => ({
          date_delivrance: r["date_delivrance"] ?? r["date"] ?? "",
          dci: r["dci"] ?? r["substance"] ?? r["molecule"] ?? "",
          nom_commercial: r["nom_commercial"] ?? r["specialite"] ?? null,
          dosage: r["dosage"] ?? null,
          forme: r["forme"] ?? null,
          quantite: r["quantite"] ?? null,
          prescripteur: r["prescripteur"] ?? null,
          pharmacie: r["pharmacie"] ?? null,
          cip13: r["cip13"] ?? r["cip"] ?? null,
        }))
        .filter((l) => l.date_delivrance && l.dci);
      if (lines.length === 0) {
        toast.error("CSV vide ou colonnes manquantes (date_delivrance, dci requises)");
        return;
      }
      importManual.mutate(lines as Array<{ date_delivrance: string; dci: string; [k: string]: string }>);
    } catch (e) {
      toast.error(`Lecture CSV échouée : ${(e as Error).message}`);
    }
  };

  const toggleSelect = (importId: string, dci: string) => {
    setSelected((s) => {
      const cur = new Set(s[importId] ?? []);
      if (cur.has(dci)) cur.delete(dci);
      else cur.add(dci);
      return { ...s, [importId]: cur };
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Database className="h-4 w-4 text-primary" />
          DMP — Historique de Médicaments Délivrés
          <Badge variant="outline" className="ml-2 text-[10px]">v1 simulé / CSV</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => simulate.mutate()} disabled={simulate.isPending}>
            {simulate.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Database className="h-4 w-4 mr-1" />}
            Simuler import DMP
          </Button>
          <Button size="sm" variant="outline" asChild>
            <label className="cursor-pointer">
              <Upload className="h-4 w-4 mr-1" />
              Importer CSV
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onCsvUpload(f);
                  e.target.value = "";
                }}
              />
            </label>
          </Button>
          <p className="text-xs text-muted-foreground self-center">
            Colonnes CSV attendues : <code>date_delivrance, dci, nom_commercial, dosage, forme, quantite, prescripteur, pharmacie, cip13</code>
          </p>
        </div>

        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : (q.data?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun import HMD pour ce patient.</p>
        ) : (
          <div className="space-y-3">
            {q.data!.map((imp) => {
              const isOpen = expanded[imp.id] ?? false;
              const recon = imp.reconciliation;
              const sel = selected[imp.id] ?? new Set<string>();
              return (
                <div key={imp.id} className="border rounded-md p-3 space-y-2">
                  <button
                    type="button"
                    onClick={() => setExpanded((s) => ({ ...s, [imp.id]: !isOpen }))}
                    className="flex items-center gap-2 w-full text-left"
                  >
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <div className="flex-1">
                      <div className="text-sm font-medium">
                        {imp.source === "dmp_simule" ? "Import DMP simulé" : "Import manuel"} —{" "}
                        {new Date(imp.imported_at).toLocaleString("fr-FR")}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {imp.period_start} → {imp.period_end} • {recon?.summary.lignes_hmd ?? 0} délivrances •{" "}
                        {recon?.summary.molecules_distinctes ?? 0} molécules
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {imp.status === "rapproche" ? "Rapproché" : imp.status === "archive" ? "Archivé" : "À rapprocher"}
                    </Badge>
                  </button>
                  {isOpen && recon && (
                    <div className="space-y-2">
                      <div className="flex gap-2 text-xs">
                        <Badge className="bg-amber-100 text-amber-900" variant="outline">
                          {recon.summary.a_ajouter} à ajouter
                        </Badge>
                        <Badge className="bg-emerald-100 text-emerald-900" variant="outline">
                          {recon.summary.deja_present} déjà présents
                        </Badge>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="text-left text-muted-foreground border-b">
                            <tr>
                              <th className="py-1 w-8"></th>
                              <th>Molécule</th>
                              <th>Dernière délivrance</th>
                              <th>Délivrances 12m</th>
                              <th>Proposition</th>
                              <th>Notes</th>
                            </tr>
                          </thead>
                          <tbody>
                            {recon.items.map((it, i) => (
                              <tr key={i} className="border-b last:border-0">
                                <td>
                                  {it.proposition === "a_ajouter" && (
                                    <Checkbox
                                      checked={sel.has(it.dci)}
                                      onCheckedChange={() => toggleSelect(imp.id, it.dci)}
                                    />
                                  )}
                                </td>
                                <td className="py-1 font-medium">{it.dci}</td>
                                <td>{it.derniere_delivrance}</td>
                                <td>{it.nb_delivrances_12m}</td>
                                <td>
                                  {it.proposition === "deja_present" ? (
                                    <Badge variant="outline" className="bg-emerald-50 text-emerald-800 text-[10px]">
                                      <CheckCircle2 className="h-3 w-3 mr-1" /> déjà présent
                                    </Badge>
                                  ) : it.proposition === "a_ajouter" ? (
                                    <Badge variant="outline" className="bg-amber-50 text-amber-900 text-[10px]">
                                      <Plus className="h-3 w-3 mr-1" /> à ajouter
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="bg-slate-50 text-slate-700 text-[10px]">
                                      <AlertTriangle className="h-3 w-3 mr-1" /> à vérifier
                                    </Badge>
                                  )}
                                </td>
                                <td className="text-muted-foreground">{it.notes}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          disabled={sel.size === 0 || addToHabituels.isPending}
                          onClick={() => addToHabituels.mutate({ importId: imp.id, dcis: Array.from(sel) })}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Ajouter {sel.size} aux traitements habituels
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
