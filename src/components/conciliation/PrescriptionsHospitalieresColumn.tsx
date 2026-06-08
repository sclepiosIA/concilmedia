import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Hospital, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { toast } from "sonner";

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
        {data.map((p) => {
          const accent = accentForDci(p.medicament);
          return (
            <div
              key={p.id}
              className="border rounded-md pl-2.5 pr-1 py-1.5 border-l-[3px] bg-card hover:bg-accent/30 transition-colors flex items-start gap-1"
              style={{ borderLeftColor: accent }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-semibold text-sm leading-tight truncate">{p.medicament}</div>
                  {p.dosage && (
                    <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-muted whitespace-nowrap">
                      {p.dosage}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                  {p.voie_administration && <span className="uppercase tracking-wide">{p.voie_administration}</span>}
                  {p.posologie && <span className="font-mono truncate">{p.posologie}</span>}
                </div>
                {p.indication && (
                  <div className="text-[11px] text-muted-foreground/80 italic mt-0.5 truncate">{p.indication}</div>
                )}
              </div>
              <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => del.mutate(p.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
