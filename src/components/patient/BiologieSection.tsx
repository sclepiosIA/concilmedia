import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, FlaskConical } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";

type BioRow = {
  id: string;
  parametre: string;
  valeur: number | null;
  unite: string | null;
  valeur_texte: string | null;
  date_prelevement: string | null;
  source: string;
};

// Seuils simples pour affichage d'alerte
function flagFor(p: string, v: number | null): "low" | "high" | null {
  if (v === null) return null;
  const key = p.toLowerCase();
  if (key.includes("dfg")) return v < 60 ? "low" : null;
  if (key.includes("créat") || key.includes("creat")) return v > 110 ? "high" : null;
  if (key === "k" || key.includes("kali")) return v < 3.5 ? "low" : v > 5.0 ? "high" : null;
  if (key === "na" || key.includes("natré") || key.includes("natre")) return v < 135 ? "low" : v > 145 ? "high" : null;
  if (key.includes("inr")) return v > 4 ? "high" : null;
  if (key.includes("hémo") || key.includes("hemo") || key === "hb") return v < 10 ? "low" : null;
  if (key.includes("plaq")) return v < 100 ? "low" : null;
  if (key.includes("crp")) return v > 50 ? "high" : null;
  if (key.includes("hba1c")) return v > 7 ? "high" : null;
  return null;
}

export function BiologieSection({ patientId }: { patientId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data = [] } = useQuery({
    queryKey: ["biologie", patientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("biologie_resultats")
        .select("*")
        .eq("patient_id", patientId)
        .order("date_prelevement", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      return (data ?? []) as BioRow[];
    },
  });

  const grouped = useMemo(() => {
    const m = new Map<string, BioRow[]>();
    for (const r of data) {
      const k = r.parametre;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return Array.from(m.entries());
  }, [data]);

  const add = useMutation({
    mutationFn: async (v: { parametre: string; valeur?: number; unite?: string; valeur_texte?: string; date_prelevement?: string }) => {
      const { error } = await supabase.from("biologie_resultats").insert({ patient_id: patientId, source: "manuel", ...v });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["biologie", patientId] }); setOpen(false); toast.success("Résultat ajouté"); },
  });
  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("biologie_resultats").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["biologie", patientId] }),
  });

  return (
    <div className="space-y-3">
      {!open ? (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Ajouter un résultat</Button>
      ) : (
        <Card><CardContent className="py-4">
          <form onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const valeurStr = String(fd.get("valeur") ?? "");
            add.mutate({
              parametre: String(fd.get("parametre")),
              valeur: valeurStr ? Number(valeurStr) : undefined,
              unite: String(fd.get("unite") ?? "") || undefined,
              valeur_texte: String(fd.get("valeur_texte") ?? "") || undefined,
              date_prelevement: String(fd.get("date_prelevement") ?? "") || undefined,
            });
          }} className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div><Label>Paramètre</Label><Input name="parametre" required placeholder="DFG" /></div>
            <div><Label>Valeur</Label><Input name="valeur" type="number" step="any" /></div>
            <div><Label>Unité</Label><Input name="unite" placeholder="mL/min/1,73m²" /></div>
            <div><Label>Texte</Label><Input name="valeur_texte" placeholder="(optionnel)" /></div>
            <div><Label>Date</Label><Input name="date_prelevement" type="date" /></div>
            <div className="col-span-2 md:col-span-5 flex gap-2"><Button type="submit" size="sm">Enregistrer</Button><Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Annuler</Button></div>
          </form>
        </CardContent></Card>
      )}
      {data.length === 0 && <p className="text-sm text-muted-foreground py-4">Aucun résultat biologique</p>}
      {grouped.map(([param, rows]) => (
        <Card key={param}>
          <CardContent className="py-3">
            <div className="flex items-center gap-2 mb-2">
              <FlaskConical className="h-4 w-4 text-primary" />
              <span className="font-medium">{param}</span>
              <Badge variant="outline" className="text-xs">{rows.length} mesure(s)</Badge>
            </div>
            <div className="divide-y">
              {rows.map((r) => {
                const flag = flagFor(r.parametre, r.valeur);
                return (
                  <div key={r.id} className="py-1.5 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-mono">{r.valeur ?? r.valeur_texte ?? "—"}</span>
                      {r.unite && <span className="text-xs text-muted-foreground">{r.unite}</span>}
                      {flag === "high" && <Badge variant="destructive" className="text-xs">↑ élevé</Badge>}
                      {flag === "low" && <Badge variant="destructive" className="text-xs">↓ bas</Badge>}
                      {r.source === "pdf_import" && <Badge variant="secondary" className="text-xs">PDF</Badge>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{r.date_prelevement ?? "—"}</span>
                      <Button size="icon" variant="ghost" onClick={() => del.mutate(r.id)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
