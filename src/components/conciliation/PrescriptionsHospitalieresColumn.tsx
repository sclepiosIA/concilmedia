import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Hospital, Pill, Plus, Trash2, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PrescriptionHospitaliereUploader } from "./PrescriptionHospitaliereUploader";

type Prescription = {
  id: string;
  medicament: string;
  dosage: string | null;
  posologie: string | null;
  voie_administration: string | null;
  indication: string | null;
  prescripteur: string | null;
};

export function PrescriptionsHospitalieresColumn({ episodeId, patientId }: { episodeId: string; patientId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data = [] } = useQuery({
    queryKey: ["prescriptions", episodeId],
    queryFn: async () =>
      ((
        await supabase
          .from("prescriptions_hospitalieres")
          .select("*")
          .eq("episode_id", episodeId)
          .eq("actif", true)
          .order("created_at", { ascending: false })
      ).data ?? []) as Prescription[],
  });

  const add = useMutation({
    mutationFn: async (v: Record<string, string>) => {
      if (!v.medicament) throw new Error("Médicament requis");
      const { error } = await supabase.from("prescriptions_hospitalieres").insert({
        episode_id: episodeId,
        patient_id: patientId,
        medicament: v.medicament,
        dosage: v.dosage,
        posologie: v.posologie,
        voie_administration: v.voie_administration,
        indication: v.indication,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prescriptions", episodeId] });
      setOpen(false);
      toast.success("Prescription ajoutée");
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("prescriptions_hospitalieres").update({ actif: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prescriptions", episodeId] }),
  });

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Hospital className="h-4 w-4" /> Prescriptions hospitalières ({data.length})
        </CardTitle>
        <Button size="icon" variant="ghost" onClick={() => setOpen((o) => !o)}>
          <Plus className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {open && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const v: Record<string, string> = {};
              ["medicament", "dosage", "posologie", "voie_administration", "indication"].forEach((k) => {
                const val = fd.get(k);
                if (val) v[k] = String(val);
              });
              add.mutate(v);
            }}
            className="space-y-2 border rounded-md p-2"
          >
            <div>
              <Label className="text-xs">Médicament (DCI)</Label>
              <Input name="medicament" required className="h-8" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Dosage</Label>
                <Input name="dosage" className="h-8" />
              </div>
              <div>
                <Label className="text-xs">Voie</Label>
                <Input name="voie_administration" className="h-8" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Posologie</Label>
              <Input name="posologie" className="h-8" />
            </div>
            <div>
              <Label className="text-xs">Indication</Label>
              <Input name="indication" className="h-8" />
            </div>
            <Button type="submit" size="sm" className="w-full">
              Ajouter
            </Button>
          </form>
        )}

        {data.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <Pill className="h-8 w-8 mx-auto mb-2 opacity-40" />
            Aucune prescription hospitalière
          </div>
        ) : (
          <div className="divide-y">
            <div className="hidden md:grid grid-cols-[1fr_auto_auto_auto] gap-2 px-4 py-2 text-[10px] uppercase tracking-wide text-muted-foreground bg-muted/40">
              <div>Médicament</div>
              <div>Posologie</div>
              <div>Indication</div>
              <div></div>
            </div>
              <div className="text-center">Posologie</div>
              <div>Indication / Prescripteur</div>
              <div></div>
            </div>
            {data.map((p) => (
              <div
                key={p.id}
                className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-4 px-4 py-3 items-center hover:bg-muted/30 transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Pill className="h-4 w-4 text-primary shrink-0" />
                    <span className="font-medium truncate">{p.medicament}</span>
                    {p.dosage && (
                      <Badge variant="outline" className="font-mono text-xs">
                        {p.dosage}
                      </Badge>
                    )}
                    {p.voie_administration && (
                      <Badge variant="secondary" className="text-xs">
                        {p.voie_administration}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="text-xs text-foreground/80 md:text-center min-w-[120px]">
                  {p.posologie || <span className="text-muted-foreground">—</span>}
                </div>

                <div className="flex flex-col gap-1 text-xs min-w-[140px]">
                  {p.indication && <span className="text-foreground/80">{p.indication}</span>}
                  {p.prescripteur && (
                    <span className="text-muted-foreground">Prescripteur : {p.prescripteur}</span>
                  )}
                </div>

                <div className="flex justify-end">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => del.mutate(p.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

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
