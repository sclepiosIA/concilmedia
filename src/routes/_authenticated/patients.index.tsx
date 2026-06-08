import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { Plus, Search, User, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { BulkPatientImportModal } from "@/components/conciliation/BulkPatientImportModal";
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

  const filtered = patients.filter(
    (p) =>
      `${p.nom} ${p.prenom}`.toLowerCase().includes(search.toLowerCase()) ||
      p.nir?.includes(search),
  );

  const createMut = useMutation({
    mutationFn: async (input: { nom: string; prenom: string; date_naissance: string; sexe: string; poids_kg?: number; taille_cm?: number }) => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Non connecté");
      const { error } = await supabase.from("patients").insert({
        ...input,
        created_by: user.user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patients"] });
      toast.success("Patient créé");
      setOpen(false);
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
          <h1 className="text-2xl font-bold">Patients</h1>
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
              <Button type="submit" className="w-full" disabled={createMut.isPending}>Créer</Button>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>
      <BulkPatientImportModal open={bulkOpen} onOpenChange={setBulkOpen} />

      <div className="relative mb-4">
        <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
        <Input placeholder="Rechercher un patient..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="grid gap-3">
        {filtered.length === 0 && (
          <Card><CardContent className="py-12 text-center text-muted-foreground">Aucun patient</CardContent></Card>
        )}
        {filtered.map((p) => (
          <Link
            key={p.id}
            to="/patients/$patientId"
            params={{ patientId: p.id }}
          >
            <Card className="hover:bg-accent/50 transition cursor-pointer">
              <CardContent className="py-4 flex items-center gap-4">
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
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
