import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ClipboardCheck, ChevronDown, ChevronUp, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  episodeId: string;
}

const BMO_SOURCES = [
  { value: "ordonnance", label: "Ordonnance" },
  { value: "pharmacien", label: "Pharmacien d'officine" },
  { value: "patient", label: "Entretien patient" },
  { value: "famille", label: "Famille / aidant" },
  { value: "medecin_traitant", label: "Médecin traitant" },
  { value: "dp", label: "Dossier Pharmaceutique" },
  { value: "courrier", label: "Courrier d'admission" },
];

type EpisodeBilan = {
  mode_admission: string | null;
  provenance: string | null;
  ta_systolique: number | null;
  ta_diastolique: number | null;
  fc: number | null;
  fr: number | null;
  spo2: number | null;
  temperature: number | null;
  poids_entree_kg: number | null;
  taille_entree_cm: number | null;
  eva_douleur: number | null;
  etat_general: string | null;
  autonomie_gir: number | null;
  contexte_social: string | null;
  observance_habituelle: string | null;
  bmo_sources: string[] | null;
  bmo_notes: string | null;
  bilan_entree_completed_at: string | null;
};

export function BilanEntreeSection({ episodeId }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<EpisodeBilan | null>(null);

  const { data: episode } = useQuery({
    queryKey: ["episode-bilan", episodeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("episodes")
        .select(
          "mode_admission, provenance, ta_systolique, ta_diastolique, fc, fr, spo2, temperature, poids_entree_kg, taille_entree_cm, eva_douleur, etat_general, autonomie_gir, contexte_social, observance_habituelle, bmo_sources, bmo_notes, bilan_entree_completed_at"
        )
        .eq("id", episodeId)
        .maybeSingle();
      if (error) throw error;
      return data as EpisodeBilan | null;
    },
  });

  useEffect(() => {
    if (episode && !form) setForm(episode);
  }, [episode, form]);

  const save = useMutation({
    mutationFn: async (markComplete: boolean) => {
      if (!form) return;
      const payload = {
        ...form,
        bilan_entree_completed_at: markComplete
          ? new Date().toISOString()
          : form.bilan_entree_completed_at,
      };
      const { error } = await supabase.from("episodes").update(payload).eq("id", episodeId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["episode-bilan", episodeId] });
      qc.invalidateQueries({ queryKey: ["episode", episodeId] });
      toast.success("Bilan d'entrée enregistré");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  const completed = !!episode?.bilan_entree_completed_at;
  const filledCount = episode
    ? [
        episode.mode_admission,
        episode.ta_systolique,
        episode.fc,
        episode.spo2,
        episode.poids_entree_kg,
        episode.autonomie_gir,
        episode.observance_habituelle,
        episode.bmo_sources?.length,
      ].filter(Boolean).length
    : 0;

  const toggleSource = (s: string) => {
    if (!form) return;
    const cur = form.bmo_sources ?? [];
    setForm({
      ...form,
      bmo_sources: cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s],
    });
  };

  const set = <K extends keyof EpisodeBilan>(k: K, v: EpisodeBilan[K]) => {
    if (!form) return;
    setForm({ ...form, [k]: v });
  };

  const num = (v: string): number | null => (v === "" ? null : Number(v));

  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-primary" />
            Bilan d'entrée
            {completed ? (
              <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600">
                <CheckCircle2 className="h-3 w-3 mr-1" /> Complété
              </Badge>
            ) : (
              <Badge variant="outline">{filledCount}/8 renseignés</Badge>
            )}
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)}>
            {open ? (
              <>
                <ChevronUp className="h-4 w-4 mr-1" /> Replier
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4 mr-1" /> {completed ? "Voir" : "Compléter"}
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      {open && form && (
        <CardContent className="space-y-5">
          {/* Admission */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Mode d'admission</Label>
              <Select
                value={form.mode_admission ?? ""}
                onValueChange={(v) => set("mode_admission", v || null)}
              >
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="urgences">Urgences</SelectItem>
                  <SelectItem value="programme">Programmé</SelectItem>
                  <SelectItem value="transfert">Transfert</SelectItem>
                  <SelectItem value="domicile">Domicile direct</SelectItem>
                  <SelectItem value="autre">Autre</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Provenance</Label>
              <Input
                value={form.provenance ?? ""}
                onChange={(e) => set("provenance", e.target.value || null)}
                placeholder="EHPAD, domicile, autre service…"
              />
            </div>
          </div>

          {/* Constantes */}
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">Constantes à l'entrée</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs">TA (sys/dia)</Label>
                <div className="flex gap-1 items-center">
                  <Input
                    type="number"
                    value={form.ta_systolique ?? ""}
                    onChange={(e) => set("ta_systolique", num(e.target.value))}
                    placeholder="120"
                  />
                  <span className="text-muted-foreground">/</span>
                  <Input
                    type="number"
                    value={form.ta_diastolique ?? ""}
                    onChange={(e) => set("ta_diastolique", num(e.target.value))}
                    placeholder="80"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">FC (bpm)</Label>
                <Input type="number" value={form.fc ?? ""} onChange={(e) => set("fc", num(e.target.value))} />
              </div>
              <div>
                <Label className="text-xs">FR (/min)</Label>
                <Input type="number" value={form.fr ?? ""} onChange={(e) => set("fr", num(e.target.value))} />
              </div>
              <div>
                <Label className="text-xs">SpO₂ (%)</Label>
                <Input type="number" value={form.spo2 ?? ""} onChange={(e) => set("spo2", num(e.target.value))} />
              </div>
              <div>
                <Label className="text-xs">Température (°C)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={form.temperature ?? ""}
                  onChange={(e) => set("temperature", num(e.target.value))}
                />
              </div>
              <div>
                <Label className="text-xs">Poids (kg)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={form.poids_entree_kg ?? ""}
                  onChange={(e) => set("poids_entree_kg", num(e.target.value))}
                />
              </div>
              <div>
                <Label className="text-xs">Taille (cm)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={form.taille_entree_cm ?? ""}
                  onChange={(e) => set("taille_entree_cm", num(e.target.value))}
                />
              </div>
              <div>
                <Label className="text-xs">Douleur EVA (0-10)</Label>
                <Input
                  type="number"
                  min={0}
                  max={10}
                  value={form.eva_douleur ?? ""}
                  onChange={(e) => set("eva_douleur", num(e.target.value))}
                />
              </div>
            </div>
            <div className="mt-3">
              <Label className="text-xs">État général / observations cliniques</Label>
              <Textarea
                rows={2}
                value={form.etat_general ?? ""}
                onChange={(e) => set("etat_general", e.target.value || null)}
                placeholder="Conscient, orienté, eupnéique…"
              />
            </div>
          </div>

          {/* Autonomie & social */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Autonomie (GIR 1-6)</Label>
              <Select
                value={form.autonomie_gir?.toString() ?? ""}
                onValueChange={(v) => set("autonomie_gir", v ? Number(v) : null)}
              >
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6].map((g) => (
                    <SelectItem key={g} value={g.toString()}>GIR {g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Observance habituelle</Label>
              <Select
                value={form.observance_habituelle ?? ""}
                onValueChange={(v) => set("observance_habituelle", v || null)}
              >
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bonne">Bonne</SelectItem>
                  <SelectItem value="partielle">Partielle</SelectItem>
                  <SelectItem value="mauvaise">Mauvaise</SelectItem>
                  <SelectItem value="inconnue">Inconnue</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-3">
              <Label className="text-xs">Contexte de vie</Label>
              <Textarea
                rows={2}
                value={form.contexte_social ?? ""}
                onChange={(e) => set("contexte_social", e.target.value || null)}
                placeholder="Vit seul·e, EHPAD, aide à domicile, aidant principal…"
              />
            </div>
          </div>

          {/* BMO */}
          <div>
            <Label className="text-xs">Sources du BMO (Bilan Médicamenteux Optimisé)</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {BMO_SOURCES.map((s) => {
                const active = form.bmo_sources?.includes(s.value);
                return (
                  <Badge
                    key={s.value}
                    variant={active ? "default" : "outline"}
                    className="cursor-pointer select-none"
                    onClick={() => toggleSource(s.value)}
                  >
                    {s.label}
                  </Badge>
                );
              })}
            </div>
            <div className="mt-3">
              <Label className="text-xs">Notes BMO</Label>
              <Textarea
                rows={2}
                value={form.bmo_notes ?? ""}
                onChange={(e) => set("bmo_notes", e.target.value || null)}
                placeholder="Divergences entre sources, automédication, phytothérapie…"
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => save.mutate(false)}
              disabled={save.isPending}
            >
              {save.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Enregistrer
            </Button>
            <Button size="sm" onClick={() => save.mutate(true)} disabled={save.isPending}>
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Marquer comme complété
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
