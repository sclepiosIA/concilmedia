import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMemo, useState } from "react";
import { Plus, Search, User, Sparkles, Trash2, Archive, ArchiveRestore, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { BulkPatientImportModal } from "@/components/conciliation/BulkPatientImportModal";
import { TriageBadge, TriageLegend } from "@/components/conciliation/TriageBadge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { HelpCircle } from "lucide-react";
import { usePatientsTriage } from "@/hooks/usePatientsTriage";
import { usePatientsQuickInfo } from "@/hooks/usePatientsQuickInfo";
import { PatientRowQuickInfo } from "@/components/patient/PatientRowQuickInfo";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TRIAGE_META, type TriageLevel } from "@/lib/conciliation/triageScale";
import { SynthesePatientDialog } from "@/components/patient/SynthesePatientDialog";
import { fr } from "date-fns/locale";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";



export const Route = createFileRoute("/_authenticated/patients/")({
  head: () => ({ meta: [{ title: "Patients — Conciliation" }] }),
  component: PatientsListPage,
});

function PatientsListPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [preHospFiles, setPreHospFiles] = useState<File[]>([]);
  const [prescriptionFiles, setPrescriptionFiles] = useState<File[]>([]);
  const [bulkTargetId, setBulkTargetId] = useState<string | undefined>(undefined);
  const [toDelete, setToDelete] = useState<{ id: string; nom: string; prenom: string } | null>(null);
  const [syntheseFor, setSyntheseFor] = useState<string | null>(null);
  const [archiveFilter, setArchiveFilter] = useState<"active" | "archived" | "all">("active");
  const [bulkAction, setBulkAction] = useState<"archive" | "delete" | null>(null);
  const pendingFiles = [...preHospFiles, ...prescriptionFiles];

  const { data: patients = [] } = useQuery({
    queryKey: ["patients", archiveFilter],
    queryFn: async () => {
      let q = supabase.from("patients").select("*").order("created_at", { ascending: false });
      if (archiveFilter === "active") q = q.eq("archived", false);
      else if (archiveFilter === "archived") q = q.eq("archived", true);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  type FilterMode = "all" | "todo" | "done" | "p1" | "p2" | "p3" | "p4" | "p5";
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const patientIds = useMemo(() => patients.map((p) => p.id), [patients]);
  const { data: triageMap = {} } = usePatientsTriage(patientIds);
  const { data: quickInfoMap = {} } = usePatientsQuickInfo(patientIds);

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return patients
      .filter(
        (p) =>
          `${p.nom} ${p.prenom}`.toLowerCase().includes(s) ||
          p.nir?.includes(search),
      )
      .filter((p) => {
        const lvl = triageMap[p.id]?.level ?? 5;
        if (filterMode === "todo") return lvl <= 3;
        if (filterMode === "done") return lvl === 5;
        if (filterMode.startsWith("p")) return lvl === Number(filterMode.slice(1));
        return true;
      })
      .sort((a, b) => {
        const la = triageMap[a.id]?.level ?? 5;
        const lb = triageMap[b.id]?.level ?? 5;
        if (la !== lb) return la - lb;
        return (b.created_at ?? "").localeCompare(a.created_at ?? "");
      });
  }, [patients, search, filterMode, triageMap]);


  const counts = useMemo(() => {
    const c: Record<TriageLevel, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const p of patients) {
      const lvl = (triageMap[p.id]?.level ?? 5) as TriageLevel;
      c[lvl] += 1;
    }
    return c;
  }, [patients, triageMap]);

  const createMut = useMutation({
    mutationFn: async (input: { nom: string; prenom: string; date_naissance: string; sexe: string; poids_kg?: number; taille_cm?: number }) => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Non connecté");
      const { data, error } = await supabase.from("patients").insert({
        ...input,
        created_by: user.user.id,
      }).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (newId) => {
      qc.invalidateQueries({ queryKey: ["patients"] });
      toast.success("Patient créé");
      setOpen(false);
      if (pendingFiles.length > 0) {
        setBulkTargetId(newId);
        setBulkOpen(true);
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("patients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patients"] });
      toast.success("Patient supprimé");
      setToDelete(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  const archiveMut = useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await supabase.from("patients").update({ archived }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["patients"] });
      toast.success(vars.archived ? "Patient archivé" : "Patient désarchivé");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  const bulkArchiveMut = useMutation({
    mutationFn: async ({ ids, archived }: { ids: string[]; archived: boolean }) => {
      const { error } = await supabase.from("patients").update({ archived }).in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["patients"] });
      toast.success(`${vars.archived ? "Archivés" : "Désarchivés"} : ${vars.ids.length} patient(s)`);
      setBulkAction(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  const bulkDeleteMut = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("patients").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_, ids) => {
      qc.invalidateQueries({ queryKey: ["patients"] });
      toast.success(`${ids.length} patient(s) supprimé(s)`);
      setBulkAction(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMut.mutate({
      nom: String(fd.get("nom")),
      prenom: String(fd.get("prenom")),
      date_naissance: String(fd.get("date_naissance")),
      sexe: String(fd.get("sexe")),
      poids_kg: fd.get("poids") ? Number(fd.get("poids")) : undefined,
      taille_cm: fd.get("taille") ? Number(fd.get("taille")) : undefined,
    });
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold font-display">Patients</h1>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Échelle FRENCH-MED">
                  <HelpCircle className="h-4 w-4 text-muted-foreground" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[520px] max-w-[90vw]">
                <div className="space-y-2">
                  <div className="font-semibold text-sm">Échelle FRENCH-MED — priorité de relecture</div>
                  <p className="text-xs text-muted-foreground">
                    Inspirée de la FRENCH (SFMU). 5 paliers, du plus urgent (P1) au moins urgent (P5),
                    calculés automatiquement à partir des divergences, du score de risque et de la
                    validation pharmacien.
                  </p>
                  <TriageLegend />
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-sm text-muted-foreground">{patients.length} patient(s)</p>
            <ToggleGroup type="single" value={archiveFilter} onValueChange={(v) => v && setArchiveFilter(v as typeof archiveFilter)} size="sm">
              <ToggleGroupItem value="active">Actifs</ToggleGroupItem>
              <ToggleGroupItem value="archived">Archivés</ToggleGroupItem>
              <ToggleGroupItem value="all">Tous</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
        <div className="flex items-center gap-2">
        <Button variant="outline" onClick={() => setBulkOpen(true)}>
          <Sparkles className="h-4 w-4 mr-1" /> Import PDF en masse
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" /> Nouveau patient</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nouveau patient</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Nom</Label><Input name="nom" required /></div>
                <div><Label>Prénom</Label><Input name="prenom" required /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Date de naissance</Label><Input name="date_naissance" type="date" required /></div>
                <div>
                  <Label>Sexe</Label>
                  <Select name="sexe" defaultValue="M">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="M">Masculin</SelectItem>
                      <SelectItem value="F">Féminin</SelectItem>
                      <SelectItem value="autre">Autre</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Poids (kg)</Label><Input name="poids" type="number" step="0.1" /></div>
                <div><Label>Taille (cm)</Label><Input name="taille" type="number" /></div>
              </div>
              <div className="rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 p-3 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Documents sources pour conciliation (optionnel)
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">1. Documents de pré-hospitalisation</Label>
                  <p className="text-xs text-muted-foreground">
                    Ordonnances de ville, comptes-rendus, bilans biologiques, courriers…
                  </p>
                  <Input
                    type="file"
                    accept="application/pdf,image/*"
                    multiple
                    onChange={(e) => setPreHospFiles(Array.from(e.target.files ?? []))}
                  />
                  {preHospFiles.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      {preHospFiles.length} fichier(s) : {preHospFiles.map((f) => f.name).join(", ")}
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">2. Prescription médicale hospitalière</Label>
                  <p className="text-xs text-muted-foreground">
                    Ordonnance d'entrée / prescription faite à l'hôpital — déclenche la conciliation.
                  </p>
                  <Input
                    type="file"
                    accept="application/pdf,image/*"
                    multiple
                    onChange={(e) => setPrescriptionFiles(Array.from(e.target.files ?? []))}
                  />
                  {prescriptionFiles.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      {prescriptionFiles.length} fichier(s) : {prescriptionFiles.map((f) => f.name).join(", ")}
                    </div>
                  )}
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={createMut.isPending}>Créer</Button>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>
      <BulkPatientImportModal
        open={bulkOpen}
        onOpenChange={(v) => {
          setBulkOpen(v);
          if (!v) { setPreHospFiles([]); setPrescriptionFiles([]); setBulkTargetId(undefined); }
        }}
        targetPatientId={bulkTargetId}
        initialFiles={bulkTargetId ? pendingFiles : undefined}
        onCompleted={() => {
          if (bulkTargetId) setSyntheseFor(bulkTargetId);
        }}
      />

      {syntheseFor && (
        <SynthesePatientDialog
          patientId={syntheseFor}
          open={!!syntheseFor}
          onOpenChange={(v) => { if (!v) setSyntheseFor(null); }}
          autoAnalyze
        />
      )}

      <TooltipProvider delayDuration={200}>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-xs font-medium text-muted-foreground mr-1 uppercase tracking-wide">Tri :</span>
          {([1, 2, 3, 4, 5] as TriageLevel[]).map((l) => (
            <TriagePill
              key={l}
              level={l}
              count={counts[l]}
              active={filterMode === (`p${l}` as FilterMode)}
              onToggle={() => setFilterMode(filterMode === (`p${l}` as FilterMode) ? "all" : (`p${l}` as FilterMode))}
            />
          ))}

          <div className="ml-auto">
            <ToggleGroup type="single" value={filterMode} onValueChange={(v) => v && setFilterMode(v as FilterMode)} size="sm">
              <ToggleGroupItem value="all">Tous</ToggleGroupItem>
              <ToggleGroupItem value="todo">À relire (P1–P3)</ToggleGroupItem>
              <ToggleGroupItem value="done">Validés (P5)</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>

        <div className="relative mb-4">
          <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
          <Input placeholder="Rechercher un patient..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {filtered.length > 0 && (
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-muted-foreground">{filtered.length} résultat(s)</span>
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBulkAction("archive")}
                disabled={bulkArchiveMut.isPending || bulkDeleteMut.isPending}
              >
                <Archive className="h-3.5 w-3.5 mr-1" />
                {archiveFilter === "archived" ? "Désarchiver tous les filtrés" : "Archiver tous les filtrés"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={() => setBulkAction("delete")}
                disabled={bulkArchiveMut.isPending || bulkDeleteMut.isPending}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Supprimer tous les filtrés
              </Button>
            </div>
          </div>
        )}

        <div className="grid gap-3">
          {filtered.length === 0 && (
            <Card><CardContent className="py-12 text-center text-muted-foreground">Aucun patient</CardContent></Card>
          )}
          {filtered.map((p) => (
            <Card key={p.id} className={`hover:bg-accent/50 transition ${p.archived ? "opacity-60 bg-muted/40" : ""}`}>
              <CardContent className="py-4 flex items-center gap-4">
                <TriageBadge
                  level={triageMap[p.id]?.level ?? 5}
                  reason={triageMap[p.id]?.reason}
                  details={triageMap[p.id]?.details}
                />
                <Link
                  to="/patients/$patientId"
                  params={{ patientId: p.id }}
                  className="flex items-center gap-4 flex-1 cursor-pointer min-w-0"
                >
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {p.nom.toUpperCase()} {p.prenom}
                      {p.archived && (
                        <span className="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground border">
                          <Archive className="h-3 w-3 mr-1" /> Archivé
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground truncate">
                      {p.date_naissance && `Né(e) le ${format(new Date(p.date_naissance), "d MMM yyyy", { locale: fr })}`}
                      {p.sexe && ` • ${p.sexe}`}
                    </div>
                  </div>
                </Link>
                <PatientRowQuickInfo info={quickInfoMap[p.id]} />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="Actions">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => archiveMut.mutate({ id: p.id, archived: !p.archived })}
                    >
                      {p.archived ? (
                        <><ArchiveRestore className="h-4 w-4 mr-2" /> Désarchiver</>
                      ) : (
                        <><Archive className="h-4 w-4 mr-2" /> Archiver</>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive focus:bg-destructive/10"
                      onClick={() => setToDelete({ id: p.id, nom: p.nom, prenom: p.prenom })}
                    >
                      <Trash2 className="h-4 w-4 mr-2" /> Supprimer
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardContent>
            </Card>
          ))}

        </div>
      </TooltipProvider>

      <AlertDialog open={!!bulkAction} onOpenChange={(o) => !o && setBulkAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkAction === "archive"
                ? archiveFilter === "archived" ? "Désarchiver tous les patients filtrés ?" : "Archiver tous les patients filtrés ?"
                : "Supprimer tous les patients filtrés ?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {bulkAction === "archive"
                ? `${filtered.length} patient(s) seront ${archiveFilter === "archived" ? "désarchivé(s)" : "archivé(s)"}.`
                : `${filtered.length} patient(s) seront supprimé(s) définitivement, ainsi que toutes leurs données associées. Cette action est irréversible.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setBulkAction(null)}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                const ids = filtered.map((p) => p.id);
                if (bulkAction === "archive") {
                  bulkArchiveMut.mutate({ ids, archived: archiveFilter !== "archived" });
                } else if (bulkAction === "delete") {
                  bulkDeleteMut.mutate(ids);
                }
              }}
              disabled={bulkArchiveMut.isPending || bulkDeleteMut.isPending}
              className={bulkAction === "delete" ? "bg-destructive hover:bg-destructive/90" : ""}
            >
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce patient ?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete && `${toDelete.nom.toUpperCase()} ${toDelete.prenom} sera supprimé(e) définitivement, ainsi que tous ses épisodes, traitements, ordonnances et analyses associés. Cette action est irréversible.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (toDelete) deleteMut.mutate(toDelete.id);
              }}
              disabled={deleteMut.isPending}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TriagePill({
  level,
  count,
  active,
  onToggle,
}: {
  level: TriageLevel;
  count: number;
  active: boolean;
  onToggle: () => void;
}) {
  const m = TRIAGE_META[level];
  const empty = count === 0;
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium text-foreground transition-all ${
        active ? "ring-2 ring-offset-1 ring-foreground/30" : "hover:brightness-95"
      } ${empty ? "opacity-50" : ""}`}
      style={{ background: m.bg, border: `1px solid ${m.ring}` }}
      title={`${m.label} — ${m.delay}`}
      aria-pressed={active}
    >
      <span
        className="inline-flex items-center justify-center rounded-md font-bold text-xs"
        style={{ background: m.swatch, color: m.fg, width: 22, height: 22, border: `1px solid ${m.ring}` }}
      >
        {m.code}
      </span>
      <span className="leading-tight">{m.label}</span>
      <span
        className="inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-full text-xs font-bold tabular-nums"
        style={{ background: m.swatch, color: m.fg }}
      >
        {count}
      </span>
    </button>

  );
}

