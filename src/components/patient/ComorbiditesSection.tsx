import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function ComorbiditesSection({ patientId }: { patientId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data = [] } = useQuery({
    queryKey: ["comorbidites", patientId],
    queryFn: async () => (await supabase.from("comorbidites").select("*").eq("patient_id", patientId).order("created_at", { ascending: false })).data ?? [],
  });
  const add = useMutation({
    mutationFn: async (v: { libelle: string; code_cim10?: string }) => { const { error } = await supabase.from("comorbidites").insert({ patient_id: patientId, ...v }); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["comorbidites", patientId] }); setOpen(false); toast.success("Comorbidité ajoutée"); },
  });
  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("comorbidites").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comorbidites", patientId] }),
  });
  return (
    <div className="space-y-3">
      {!open ? <Button variant="outline" size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Ajouter</Button> : (
        <Card><CardContent className="py-4">
          <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); add.mutate({ libelle: String(fd.get("libelle")), code_cim10: String(fd.get("cim10") || "") }); }} className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2"><Label>Libellé</Label><Input name="libelle" required /></div>
            <div><Label>Code CIM-10</Label><Input name="cim10" /></div>
            <div className="md:col-span-3 flex gap-2"><Button type="submit" size="sm">Enregistrer</Button><Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Annuler</Button></div>
          </form>
        </CardContent></Card>
      )}
      {data.length === 0 && <p className="text-sm text-muted-foreground py-4">Aucune comorbidité</p>}
      {data.map((c) => (
        <Card key={c.id}><CardContent className="py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span>{c.libelle}</span>
            {c.code_cim10 && <Badge variant="outline">{c.code_cim10}</Badge>}
          </div>
          <Button size="icon" variant="ghost" onClick={() => del.mutate(c.id)}><Trash2 className="h-4 w-4" /></Button>
        </CardContent></Card>
      ))}
    </div>
  );
}
