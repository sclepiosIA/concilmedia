import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { COMORBIDITY_OPTIONS } from "@/lib/clinical/complexityScore";

export function ComorbiditesSection({ patientId }: { patientId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [autre, setAutre] = useState("");

  const { data = [] } = useQuery({
    queryKey: ["comorbidites", patientId],
    queryFn: async () =>
      (await supabase.from("comorbidites").select("*").eq("patient_id", patientId).order("created_at", { ascending: false })).data ?? [],
  });

  const existing = useMemo(() => new Set(data.map((d) => d.libelle.toLowerCase())), [data]);

  const addMany = useMutation({
    mutationFn: async (libelles: string[]) => {
      const rows = libelles
        .filter((l) => l.trim() && !existing.has(l.toLowerCase()))
        .map((libelle) => ({ patient_id: patientId, libelle }));
      if (rows.length === 0) return 0;
      const { error } = await supabase.from("comorbidites").insert(rows);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["comorbidites", patientId] });
      setOpen(false);
      setSelected(new Set());
      setAutre("");
      if (n > 0) toast.success(`${n} comorbidité(s) ajoutée(s)`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("comorbidites").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comorbidites", patientId] }),
  });

  const toggle = (label: string) => {
    setSelected((p) => {
      const n = new Set(p);
      if (n.has(label)) n.delete(label); else n.add(label);
      return n;
    });
  };

  const submit = () => {
    const list = Array.from(selected);
    if (autre.trim()) list.push(autre.trim());
    if (list.length === 0) { toast.error("Sélectionnez au moins une comorbidité"); return; }
    addMany.mutate(list);
  };

  return (
    <div className="space-y-3">
      {!open ? (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Ajouter des comorbidités
        </Button>
      ) : (
        <Card>
          <CardContent className="py-4 space-y-3">
            <Label className="text-sm font-medium">Sélection multiple</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {COMORBIDITY_OPTIONS.filter((o) => o.key !== "AUTRE").map((opt) => {
                const already = existing.has(opt.label.toLowerCase());
                return (
                  <label key={opt.key} className={`flex items-center gap-2 p-2 rounded border cursor-pointer ${already ? "opacity-50" : "hover:bg-accent"}`}>
                    <Checkbox
                      checked={selected.has(opt.label) || already}
                      disabled={already}
                      onCheckedChange={() => toggle(opt.label)}
                    />
                    <span className="text-sm flex-1">{opt.label}</span>
                    {opt.weight > 0 && <Badge variant="outline" className="text-xs">+{opt.weight}</Badge>}
                  </label>
                );
              })}
            </div>
            <div>
              <Label className="text-xs">Autre (libre)</Label>
              <Input value={autre} onChange={(e) => setAutre(e.target.value)} placeholder="ex : SAOS sévère" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={submit} disabled={addMany.isPending}>Enregistrer</Button>
              <Button size="sm" variant="ghost" onClick={() => { setOpen(false); setSelected(new Set()); setAutre(""); }}>Annuler</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {data.length === 0 && <p className="text-sm text-muted-foreground py-4">Aucune comorbidité</p>}

      {data.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {data.map((c) => (
            <Badge key={c.id} variant="secondary" className="pl-3 pr-1 py-1 text-sm gap-1">
              {c.libelle}
              <Button
                size="icon"
                variant="ghost"
                className="h-5 w-5 hover:bg-destructive/20"
                onClick={() => del.mutate(c.id)}
                aria-label="Supprimer"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
