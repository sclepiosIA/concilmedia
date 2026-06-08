import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, Pill } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { OrdonnanceUploader } from "@/components/conciliation/OrdonnanceUploader";

export function TraitementsHabituelsSection({ patientId }: { patientId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data = [] } = useQuery({
    queryKey: ["traitements", patientId],
    queryFn: async () => (await supabase.from("traitements_habituels").select("*").eq("patient_id", patientId).order("created_at", { ascending: false })).data ?? [],
  });
  const add = useMutation({
    mutationFn: async (v: Record<string, string | number>) => { const { error } = await supabase.from("traitements_habituels").insert({ patient_id: patientId, ...v }); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["traitements", patientId] }); setOpen(false); toast.success("Traitement ajouté"); },
  });
  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("traitements_habituels").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["traitements", patientId] }),
  });

  return (
    <div className="space-y-3">
      <OrdonnanceUploader patientId={patientId} />
      {!open ? <Button variant="outline" size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Ajouter un traitement</Button> : (
        <Card><CardContent className="py-4">
          <form onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const v: Record<string, string> = {};
            ["dci", "nom_commercial", "dosage", "dosage_unite", "voie_administration", "posologie_matin", "posologie_midi", "posologie_soir", "posologie_coucher", "indication", "source"].forEach((k) => {
              const val = fd.get(k); if (val) v[k] = String(val);
            });
            add.mutate(v);
          }} className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="col-span-2"><Label>DCI</Label><Input name="dci" required /></div>
            <div className="col-span-2"><Label>Nom commercial</Label><Input name="nom_commercial" /></div>
            <div><Label>Dosage</Label><Input name="dosage" /></div>
            <div><Label>Unité</Label><Input name="dosage_unite" placeholder="mg" /></div>
            <div><Label>Voie</Label><Input name="voie_administration" placeholder="PO" /></div>
            <div><Label>Source</Label><Select name="source" defaultValue="patient"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ordonnance">Ordonnance</SelectItem><SelectItem value="patient">Patient</SelectItem><SelectItem value="MT">Médecin traitant</SelectItem><SelectItem value="pharmacie">Pharmacie</SelectItem><SelectItem value="autre">Autre</SelectItem></SelectContent></Select></div>
            <div><Label>Matin</Label><Input name="posologie_matin" /></div>
            <div><Label>Midi</Label><Input name="posologie_midi" /></div>
            <div><Label>Soir</Label><Input name="posologie_soir" /></div>
            <div><Label>Coucher</Label><Input name="posologie_coucher" /></div>
            <div className="col-span-2 md:col-span-4"><Label>Indication</Label><Input name="indication" /></div>
            <div className="col-span-2 md:col-span-4 flex gap-2"><Button type="submit" size="sm">Enregistrer</Button><Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Annuler</Button></div>
          </form>
        </CardContent></Card>
      )}
      {data.length === 0 && <p className="text-sm text-muted-foreground py-4">Aucun traitement habituel</p>}
      {data.map((t) => (
        <Card key={t.id}><CardContent className="py-3 flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Pill className="h-4 w-4 text-primary" />
              <span className="font-medium">{t.dci || t.nom_commercial}</span>
              {t.dosage && <Badge variant="outline">{t.dosage} {t.dosage_unite}</Badge>}
              {t.voie_administration && <Badge variant="secondary">{t.voie_administration}</Badge>}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {[t.posologie_matin && `${t.posologie_matin} matin`, t.posologie_midi && `${t.posologie_midi} midi`, t.posologie_soir && `${t.posologie_soir} soir`, t.posologie_coucher && `${t.posologie_coucher} coucher`].filter(Boolean).join(" • ")}
              {t.indication && <div>Indication : {t.indication}</div>}
            </div>
          </div>
          <Button size="icon" variant="ghost" onClick={() => del.mutate(t.id)}><Trash2 className="h-4 w-4" /></Button>
        </CardContent></Card>
      ))}
    </div>
  );
}
