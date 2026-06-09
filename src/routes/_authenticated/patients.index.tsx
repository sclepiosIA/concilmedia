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
import { Plus, Search, User, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { BulkPatientImportModal } from "@/components/conciliation/BulkPatientImportModal";
import { TriageBadge, TriageLegend } from "@/components/conciliation/TriageBadge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { HelpCircle } from "lucide-react";
import { usePatientsTriage } from "@/hooks/usePatientsTriage";
import { TRIAGE_META, type TriageLevel } from "@/lib/conciliation/triageScale";
import { SynthesePatientDialog } from "@/components/patient/SynthesePatientDialog";
import { fr } from "date-fns/locale";

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
  const pendingFiles = [...preHospFiles, ...prescriptionFiles];

  const { data: patients = [] } = useQuery({
    queryKey: ["patients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const [filterMode, setFilterMode] = useState<"all" | "todo" | "done">("all");
  const patientIds = patients.map((p) => p.id);
  const { data: triageMap = {} } = usePatientsTriage(patientIds);

  const filteredBySearch = patients.filter(
    (p) =>
      `${p.nom} ${p.prenom}`.toLowerCase().includes(search.toLowerCase()) ||
      p.nir?.includes(search),
  );

  const filtered = filteredBySearch
    .filter((p) => {
      const lvl = triageMap[p.id]?.level ?? 5;
      if (filterMode === "todo") return lvl <= 3;
      if (filterMode === "done") return lvl === 5;
      return true;
    })
    .sort((a, b) => {
      const la = triageMap[a.id]?.level ?? 5;
      const lb = triageMap[b.id]?.level ?? 5;
      if (la !== lb) return la - lb;
      return (b.created_at ?? "").localeCompare(a.created_at ?? "");
    });

  const counts: Record<TriageLevel, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const p of patients) {
    const lvl = (triageMap[p.id]?.level ?? 5) as TriageLevel;
    counts[lvl] += 1;
  }

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
          <p className="text-sm text-muted-foreground">{patients.length} patient(s)</p>
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

      <div className="flex flex-wrap items-center gap-2 mb-3">
        {([1, 2, 3, 4, 5] as TriageLevel[]).map((l) => {
          const m = TRIAGE_META[l];
          return (
            <div
              key={l}
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
              style={{ background: m.bg, color: m.fg, border: `1px solid ${m.ring}` }}
              title={`${m.label} — ${m.delay}`}
            >
              <span className="font-bold">{m.code}</span>
              <span className="opacity-80">{counts[l]}</span>
            </div>
          );
        })}
        <div className="ml-auto">
          <ToggleGroup type="single" value={filterMode} onValueChange={(v) => v && setFilterMode(v as typeof filterMode)} size="sm">
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

      <div className="grid gap-3">
        {filtered.length === 0 && (
          <Card><CardContent className="py-12 text-center text-muted-foreground">Aucun patient</CardContent></Card>
        )}
        {filtered.map((p) => {
          const triage = triageMap[p.id];
          return (
          <Card key={p.id} className="hover:bg-accent/50 transition">
            <CardContent className="py-4 flex items-center gap-4">
              <TriageBadge level={triage?.level ?? 5} reason={triage?.reason} />
              <Link
                to="/patients/$patientId"
                params={{ patientId: p.id }}
                className="flex items-center gap-4 flex-1 cursor-pointer"
              >
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="font-medium">{p.nom.toUpperCase()} {p.prenom}</div>
                  <div className="text-sm text-muted-foreground">
                    {p.date_naissance && `Né(e) le ${format(new Date(p.date_naissance), "d MMM yyyy", { locale: fr })}`}
                    {p.sexe && ` • ${p.sexe}`}
                  </div>
                </div>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setToDelete({ id: p.id, nom: p.nom, prenom: p.prenom })}
                aria-label="Supprimer le patient"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </CardContent>
          </Card>
          );
        })}
      </div>

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
