import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function AntecedentsSection({ patientId }: { patientId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data = [] } = useQuery({
    queryKey: ["antecedents", patientId],
    queryFn: async () => (await supabase.from("antecedents").select("*").eq("patient_id", patientId).order("created_at", { ascending: false })).data ?? [],
  });

  const addMut = useMutation({
    mutationFn: async (v: { type: string; description: string }) => {
      const { error } = await supabase.from("antecedents").insert({ patient_id: patientId, ...v });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["antecedents", patientId] }); setOpen(false); toast.success("Antécédent ajouté"); },
  });
  const delMut = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("antecedents").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["antecedents", patientId] }),
  });

  return (
    <div className="space-y-3">
      {!open ? (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Ajouter un antécédent</Button>
      ) : (
        <Card>
          <CardContent className="py-4">
            <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); addMut.mutate({ type: String(fd.get("type")), description: String(fd.get("description")) }); }} className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div><Label>Type</Label><Select name="type" defaultValue="medical"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="medical">Médical</SelectItem><SelectItem value="chirurgical">Chirurgical</SelectItem><SelectItem value="familial">Familial</SelectItem><SelectItem value="obstetrical">Obstétrical</SelectItem><SelectItem value="autre">Autre</SelectItem></SelectContent></Select></div>
              <div className="md:col-span-2"><Label>Description</Label><Input name="description" required /></div>
              <div className="md:col-span-3 flex gap-2"><Button type="submit" size="sm">Enregistrer</Button><Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Annuler</Button></div>
            </form>
          </CardContent>
        </Card>
      )}
      {data.length === 0 && <p className="text-sm text-muted-foreground py-4">Aucun antécédent</p>}
      {data.map((a) => (
        <Card key={a.id}>
          <CardContent className="py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Badge variant="outline">{a.type}</Badge>
              <span>{a.description}</span>
            </div>
            <Button size="icon" variant="ghost" onClick={() => delMut.mutate(a.id)}><Trash2 className="h-4 w-4" /></Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
