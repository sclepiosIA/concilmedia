import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Hospital, Pill, Plus, Trash2, Sparkles, Sun, CloudSun, Sunset, Moon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PrescriptionHospitaliereUploader } from "./PrescriptionHospitaliereUploader";

type Prescription = {
  id: string;
  medicament: string;
  nom_commercial: string | null;
  dosage: string | null;
  dosage_unite: string | null;
  posologie: string | null;
  posologie_matin: string | null;
  posologie_midi: string | null;
  posologie_soir: string | null;
  posologie_coucher: string | null;
  voie_administration: string | null;
  indication: string | null;
  prescripteur: string | null;
  source: string | null;
};

const SOURCE_LABEL: Record<string, string> = {
  ordonnance_ocr: "Ordonnance OCR",
  ordonnance: "Ordonnance",
  manuel: "Manuel",
  autre: "Autre",
};

function PriseCell({
  value,
  icon: Icon,
  label,
}: {
  value: string | null;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  const active = value && value !== "0" && value.trim() !== "";
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`flex flex-col items-center justify-center w-10 h-10 rounded-md border text-xs font-medium transition-colors ${
              active
                ? "bg-primary/10 border-primary/40 text-primary"
                : "bg-muted/30 border-border text-muted-foreground/40"
            }`}
          >
            <Icon className="h-3 w-3 mb-0.5" />
            <span className="leading-none">{active ? value : "—"}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Parse "1-0-1", "1—1—1", "1-1-1-0", "1/0/1/0" → [matin, midi, soir, coucher]. */
function parsePosologie(s: string | null): [string | null, string | null, string | null, string | null] {
  if (!s) return [null, null, null, null];
  const parts = s.split(/[-—–\/]/).map((p) => p.trim()).filter((p) => /^\d+([.,]\d+)?$/.test(p));
  if (parts.length === 3) return [parts[0], parts[1], parts[2], null];
  if (parts.length === 4) return [parts[0], parts[1], parts[2], parts[3]];
  return [null, null, null, null];
}

function resolvePrises(p: Prescription): [string | null, string | null, string | null, string | null] {
  if (p.posologie_matin || p.posologie_midi || p.posologie_soir || p.posologie_coucher) {
    return [p.posologie_matin, p.posologie_midi, p.posologie_soir, p.posologie_coucher];
  }
  return parsePosologie(p.posologie);
}

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
      ).data ?? []) as unknown as Prescription[],
  });

  const add = useMutation({
    mutationFn: async (v: Record<string, string>) => {
      if (!v.medicament) throw new Error("Médicament requis");
      const { error } = await supabase.from("prescriptions_hospitalieres").insert({
        episode_id: episodeId,
        patient_id: patientId,
        medicament: v.medicament,
        dosage: v.dosage || null,
        dosage_unite: v.dosage_unite || null,
        voie_administration: v.voie_administration || null,
        posologie_matin: v.posologie_matin || null,
        posologie_midi: v.posologie_midi || null,
        posologie_soir: v.posologie_soir || null,
        posologie_coucher: v.posologie_coucher || null,
        posologie: v.posologie || null,
        indication: v.indication || null,
        source: "manuel",
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prescriptions", episodeId] });
      setOpen(false);
      toast.success("Prescription ajoutée");
    },
    onError: (e) => toast.error((e as Error).message),
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
              [
                "medicament", "dosage", "dosage_unite", "voie_administration",
                "posologie_matin", "posologie_midi", "posologie_soir", "posologie_coucher",
                "posologie", "indication",
              ].forEach((k) => {
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
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Dosage</Label>
                <Input name="dosage" className="h-8" />
              </div>
              <div>
                <Label className="text-xs">Unité</Label>
                <Input name="dosage_unite" className="h-8" placeholder="mg" />
              </div>
              <div>
                <Label className="text-xs">Voie</Label>
                <Input name="voie_administration" className="h-8" placeholder="PO" />
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <div>
                <Label className="text-xs">Matin</Label>
                <Input name="posologie_matin" className="h-8" />
              </div>
              <div>
                <Label className="text-xs">Midi</Label>
                <Input name="posologie_midi" className="h-8" />
              </div>
              <div>
                <Label className="text-xs">Soir</Label>
                <Input name="posologie_soir" className="h-8" />
              </div>
              <div>
                <Label className="text-xs">Coucher</Label>
                <Input name="posologie_coucher" className="h-8" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Posologie (texte libre)</Label>
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
            <div className="hidden md:grid grid-cols-[1fr_auto_auto_auto] gap-2 px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground bg-muted/40">
              <div>Médicament</div>
              <div className="text-center">M • Mi • S • Co</div>
              <div>Indication / Source</div>
              <div></div>
            </div>
            {data.map((p) => (
              <div
                key={p.id}
                className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-2 px-3 py-2 items-center hover:bg-muted/30 transition-colors text-xs"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Pill className="h-3 w-3 text-primary shrink-0" />
                    <span className="font-medium truncate text-xs">{p.medicament}</span>
                    {p.dosage && (
                      <Badge variant="outline" className="font-mono text-[10px] px-1 py-0">
                        {p.dosage}{p.dosage_unite ? ` ${p.dosage_unite}` : ""}
                      </Badge>
                    )}
                    {p.voie_administration && (
                      <Badge variant="secondary" className="text-[10px] px-1 py-0">{p.voie_administration}</Badge>
                    )}
                  </div>
                  {p.nom_commercial && p.nom_commercial !== p.medicament && (
                    <div className="text-[11px] text-muted-foreground ml-4 mt-0.5">{p.nom_commercial}</div>
                  )}
                  {p.posologie && !(p.posologie_matin || p.posologie_midi || p.posologie_soir || p.posologie_coucher) && (
                    <div className="text-[11px] text-muted-foreground ml-4 mt-0.5">{p.posologie}</div>
                  )}
                </div>

                <div className="flex gap-1 justify-start md:justify-center">
                  <PriseCell value={p.posologie_matin} icon={Sun} label="Matin" />
                  <PriseCell value={p.posologie_midi} icon={CloudSun} label="Midi" />
                  <PriseCell value={p.posologie_soir} icon={Sunset} label="Soir" />
                  <PriseCell value={p.posologie_coucher} icon={Moon} label="Coucher" />
                </div>

                <div className="flex flex-col gap-0.5 text-[11px] min-w-[120px]">
                  {p.indication && <span className="text-foreground/80">{p.indication}</span>}
                  {p.prescripteur && (
                    <span className="text-muted-foreground">Prescripteur : {p.prescripteur}</span>
                  )}
                  {p.source && (
                    <span className="text-muted-foreground">
                      Source : {SOURCE_LABEL[p.source] ?? p.source}
                    </span>
                  )}
                </div>

                <div className="flex justify-end">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => del.mutate(p.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
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
