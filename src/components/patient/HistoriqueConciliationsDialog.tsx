import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { History, ExternalLink, AlertTriangle, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

type EpisodeRow = {
  id: string;
  motif: string | null;
  service: string | null;
  date_entree: string;
  date_sortie: string | null;
  statut: string;
};

type ConciliationRow = {
  id: string;
  episode_id: string;
  type_divergence: string;
  intention: string;
  statut: string;
  gravite: string | null;
  date_validation: string | null;
  created_at: string;
  medication_domicile: { dci?: string } | null;
};

const typeLabel: Record<string, string> = {
  omission: "Omission",
  ajout: "Ajout",
  modification_dose: "Dose modifiée",
  modification_freq: "Fréquence",
  duplication: "Duplication",
  aucune: "—",
};

export function HistoriqueConciliationsDialog({
  patientId,
  open,
  onOpenChange,
}: {
  patientId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data: episodes = [], isLoading: epLoading } = useQuery({
    queryKey: ["historique-episodes", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("episodes")
        .select("id, motif, service, date_entree, date_sortie, statut")
        .eq("patient_id", patientId)
        .order("date_entree", { ascending: false });
      if (error) throw error;
      return (data ?? []) as EpisodeRow[];
    },
    enabled: open,
  });

  const { data: conciliations = [], isLoading: cLoading } = useQuery({
    queryKey: ["historique-conciliations", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conciliation_medicaments")
        .select("id, episode_id, type_divergence, intention, statut, gravite, date_validation, created_at, medication_domicile")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ConciliationRow[];
    },
    enabled: open,
  });

  const byEpisode = new Map<string, ConciliationRow[]>();
  for (const c of conciliations) {
    const arr = byEpisode.get(c.episode_id) ?? [];
    arr.push(c);
    byEpisode.set(c.episode_id, arr);
  }

  const totalDiv = conciliations.length;
  const resolved = conciliations.filter((c) => c.statut === "resolu").length;
  const nonInt = conciliations.filter((c) => c.intention === "non_intentionnel").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" /> Historique des conciliations médicamenteuses
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-2 flex-wrap text-xs">
          <Badge variant="secondary">{episodes.length} épisode(s)</Badge>
          <Badge variant="secondary">{totalDiv} divergence(s)</Badge>
          <Badge variant="outline" className="text-emerald-600 border-emerald-200">
            <CheckCircle2 className="h-3 w-3 mr-1" /> {resolved} résolue(s)
          </Badge>
          {nonInt > 0 && (
            <Badge variant="destructive">
              <AlertTriangle className="h-3 w-3 mr-1" /> {nonInt} non intentionnelle(s)
            </Badge>
          )}
        </div>

        <div className="flex-1 overflow-auto space-y-4">
          {(epLoading || cLoading) && (
            <div className="text-sm text-muted-foreground py-6 text-center">Chargement…</div>
          )}
          {!epLoading && episodes.length === 0 && (
            <div className="text-sm text-muted-foreground py-6 text-center border rounded border-dashed">
              Aucun épisode de conciliation pour ce patient.
            </div>
          )}
          {episodes.map((ep) => {
            const list = byEpisode.get(ep.id) ?? [];
            const open = list.filter((c) => c.statut !== "resolu").length;
            return (
              <div key={ep.id} className="border rounded-md">
                <div className="flex items-center justify-between gap-2 p-3 bg-muted/30 border-b flex-wrap">
                  <div>
                    <div className="font-semibold text-sm">
                      {ep.motif || "Épisode sans motif"}
                      {ep.service && <span className="text-muted-foreground font-normal"> • {ep.service}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(ep.date_entree), "d MMM yyyy", { locale: fr })}
                      {ep.date_sortie && ` → ${format(new Date(ep.date_sortie), "d MMM yyyy", { locale: fr })}`}
                      <Badge variant={ep.statut === "clos" ? "secondary" : "default"} className="ml-2 capitalize">
                        {ep.statut}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{list.length} ligne(s)</Badge>
                    {open > 0 && <Badge variant="destructive" className="text-xs">{open} ouverte(s)</Badge>}
                    <Button asChild size="sm" variant="outline">
                      <Link to="/episodes/$episodeId" params={{ episodeId: ep.id }} onClick={() => onOpenChange(false)}>
                        <ExternalLink className="h-3 w-3 mr-1" /> Ouvrir
                      </Link>
                    </Button>
                  </div>
                </div>
                {list.length === 0 ? (
                  <div className="text-xs text-muted-foreground italic px-3 py-2">Aucune divergence enregistrée.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="h-8 text-xs">Médicament</TableHead>
                        <TableHead className="h-8 text-xs">Divergence</TableHead>
                        <TableHead className="h-8 text-xs">Gravité</TableHead>
                        <TableHead className="h-8 text-xs">Intention</TableHead>
                        <TableHead className="h-8 text-xs">Statut</TableHead>
                        <TableHead className="h-8 text-xs">Validée le</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {list.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium text-sm">{c.medication_domicile?.dci ?? "—"}</TableCell>
                          <TableCell className="text-xs">{typeLabel[c.type_divergence] ?? c.type_divergence}</TableCell>
                          <TableCell className="text-xs capitalize">{c.gravite ?? "—"}</TableCell>
                          <TableCell className="text-xs">
                            <Badge variant={c.intention === "non_intentionnel" ? "destructive" : "secondary"} className="capitalize text-[10px]">
                              {c.intention.replace("_", " ")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            <Badge variant={c.statut === "resolu" ? "outline" : "default"} className="capitalize text-[10px]">
                              {c.statut.replace("_", " ")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {c.date_validation ? format(new Date(c.date_validation), "d MMM yyyy", { locale: fr }) : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
