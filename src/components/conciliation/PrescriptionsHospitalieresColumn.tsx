import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Hospital, Plus, Trash2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { toast } from "sonner";
import { PrescriptionHospitaliereUploader } from "./PrescriptionHospitaliereUploader";

export function PrescriptionsHospitalieresColumn({ episodeId, patientId }: { episodeId: string; patientId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data = [] } = useQuery({
    queryKey: ["prescriptions", episodeId],
    queryFn: async () => (await supabase.from("prescriptions_hospitalieres").select("*").eq("episode_id", episodeId).eq("actif", true)).data ?? [],
  });
  const add = useMutation({
    mutationFn: async (v: Record<string, string>) => {
      if (!v.medicament) throw new Error("Médicament requis");
      const { error } = await supabase.from("prescriptions_hospitalieres").insert({ episode_id: episodeId, patient_id: patientId, medicament: v.medicament, dosage: v.dosage, posologie: v.posologie, voie_administration: v.voie_administration });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["prescriptions", episodeId] }); setOpen(false); toast.success("Prescription ajoutée"); },
  });
  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("prescriptions_hospitalieres").update({ actif: false }).eq("id", id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prescriptions", episodeId] }),
  });

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2"><Hospital className="h-4 w-4" /> Hospitaliers ({data.length})</CardTitle>
        <Button size="icon" variant="ghost" onClick={() => setOpen((o) => !o)}><Plus className="h-4 w-4" /></Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {open && (
          <form onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const v: Record<string, string> = {};
            ["medicament", "dosage", "posologie", "voie_administration"].forEach((k) => { const val = fd.get(k); if (val) v[k] = String(val); });
            add.mutate(v);
          }} className="space-y-2 border rounded-md p-2">
            <div><Label className="text-xs">Médicament (DCI)</Label><Input name="medicament" required className="h-8" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Dosage</Label><Input name="dosage" className="h-8" /></div>
              <div><Label className="text-xs">Voie</Label><Input name="voie_administration" className="h-8" /></div>
            </div>
            <div><Label className="text-xs">Posologie</Label><Input name="posologie" className="h-8" /></div>
            <Button type="submit" size="sm" className="w-full">Ajouter</Button>
          </form>
        )}
        {data.length === 0 && <p className="text-xs text-muted-foreground">Aucune prescription</p>}
        {data.map((p) => (
          <div key={p.id} className="border rounded-md p-2 flex items-start justify-between">
            <div className="flex-1">
              <div className="font-medium text-sm">{p.medicament}</div>
              <div className="flex gap-1 flex-wrap mt-1">
                {p.dosage && <Badge variant="outline" className="text-xs">{p.dosage}</Badge>}
                {p.voie_administration && <Badge variant="secondary" className="text-xs">{p.voie_administration}</Badge>}
              </div>
              {p.posologie && <div className="text-xs text-muted-foreground mt-1">{p.posologie}</div>}
            </div>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => del.mutate(p.id)}><Trash2 className="h-3 w-3" /></Button>
          </div>
        ))}
        <div className="pt-2 border-t">
          <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
            <Sparkles className="h-3 w-3" /> Importer par OCR
          </div>
          <PrescriptionHospitaliereUploader episodeId={episodeId} patientId={patientId} />
        </div>
      </CardContent>
    </Card>
  );
}
