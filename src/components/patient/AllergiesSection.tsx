import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { SourceDocumentLink } from "@/components/conciliation/SourceDocumentLink";

const severites: Record<string, "default" | "secondary" | "destructive"> = {
  legere: "secondary", moderee: "default", severe: "destructive", anaphylaxie: "destructive",
};

export function AllergiesSection({ patientId }: { patientId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data = [] } = useQuery({
    queryKey: ["allergies", patientId],
    queryFn: async () => (await supabase.from("allergies").select("*").eq("patient_id", patientId).order("created_at", { ascending: false })).data ?? [],
  });
  const add = useMutation({
    mutationFn: async (v: { substance: string; reaction?: string; severite: string }) => {
      const { error } = await supabase.from("allergies").insert({ patient_id: patientId, ...v }); if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["allergies", patientId] }); setOpen(false); toast.success("Allergie ajoutée"); },
  });
  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("allergies").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["allergies", patientId] }),
  });

  return (
    <div className="space-y-3">
      {!open ? <Button variant="outline" size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Ajouter une allergie</Button> : (
        <Card><CardContent className="py-4">
          <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); add.mutate({ substance: String(fd.get("substance")), reaction: String(fd.get("reaction") || ""), severite: String(fd.get("severite")) }); }} className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><Label>Substance</Label><Input name="substance" required /></div>
            <div><Label>Réaction</Label><Input name="reaction" /></div>
            <div><Label>Sévérité</Label><Select name="severite" defaultValue="moderee"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="legere">Légère</SelectItem><SelectItem value="moderee">Modérée</SelectItem><SelectItem value="severe">Sévère</SelectItem><SelectItem value="anaphylaxie">Anaphylaxie</SelectItem></SelectContent></Select></div>
            <div className="md:col-span-3 flex gap-2"><Button type="submit" size="sm">Enregistrer</Button><Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Annuler</Button></div>
          </form>
        </CardContent></Card>
      )}
      {data.length === 0 && <p className="text-sm text-muted-foreground py-4">Aucune allergie</p>}
      {data.map((a) => (
        <Card key={a.id}><CardContent className="py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 flex-wrap">
            {(a.severite === "severe" || a.severite === "anaphylaxie") && <AlertTriangle className="h-4 w-4 text-destructive" />}
            <span className="font-medium">{a.substance}</span>
            {a.reaction && <span className="text-sm text-muted-foreground">— {a.reaction}</span>}
            {a.severite && <Badge variant={severites[a.severite] ?? "secondary"}>{a.severite}</Badge>}
            <SourceDocumentLink documentId={(a as { source_document_id?: string | null }).source_document_id} />
          </div>
          <Button size="icon" variant="ghost" onClick={() => del.mutate(a.id)}><Trash2 className="h-4 w-4" /></Button>
        </CardContent></Card>
      ))}
    </div>
  );
}
