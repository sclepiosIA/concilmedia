import { useState, useRef, type DragEvent, type ChangeEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, Sparkles, Loader2, FileText } from "lucide-react";
import { toast } from "sonner";
import { extractOrdonnance, type ExtractedMedication } from "@/lib/conciliation/extractOrdonnance.functions";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(",")[1] ?? "");
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function buildPosologieText(m: ExtractedMedication): string | null {
  const parts = [
    m.posologie_matin && `${m.posologie_matin} matin`,
    m.posologie_midi && `${m.posologie_midi} midi`,
    m.posologie_soir && `${m.posologie_soir} soir`,
    m.posologie_coucher && `${m.posologie_coucher} coucher`,
  ].filter(Boolean);
  if (parts.length) return parts.join(", ");
  return m.posologie_texte ?? null;
}

export function NouvelleConciliationDialog({
  patientId,
  open,
  onOpenChange,
}: {
  patientId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const navigate = useNavigate();
  const extract = useServerFn(extractOrdonnance);
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const mut = useMutation({
    mutationFn: async (f: File) => {
      // 1) Create episode
      const { data: ep, error: epErr } = await supabase
        .from("episodes")
        .insert({ patient_id: patientId, motif: "Nouvel épisode", service: "Médecine" })
        .select()
        .single();
      if (epErr) throw epErr;

      // 2) Extract prescription
      const b64 = await fileToBase64(f);
      const r = await extract({
        data: { patientId, fileBase64: b64, mimeType: f.type, fileName: f.name },
      });

      // 3) Insert prescriptions
      const rows = r.medications.map((m) => ({
        episode_id: ep.id,
        patient_id: patientId,
        medicament: m.dci + (m.nom_commercial ? ` (${m.nom_commercial})` : ""),
        dosage: m.dosage ? `${m.dosage}${m.dosage_unite ? " " + m.dosage_unite : ""}`.trim() : null,
        posologie: buildPosologieText(m),
        voie_administration: m.voie_administration ?? null,
        prescripteur: r.prescripteur ?? null,
        indication: m.indication ?? null,
      }));
      if (rows.length > 0) {
        const { error } = await supabase.from("prescriptions_hospitalieres").insert(rows);
        if (error) throw error;
      }
      return { episodeId: ep.id, count: rows.length };
    },
    onSuccess: ({ episodeId, count }) => {
      toast.success(`Conciliation créée — ${count} prescription(s) importée(s)`);
      setFile(null);
      onOpenChange(false);
      navigate({ to: "/episodes/$episodeId", params: { episodeId } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur d'import"),
  });

  const handleFile = (f: File | undefined | null) => {
    if (!f) return;
    setFile(f);
    mut.mutate(f);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !mut.isPending && onOpenChange(v)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> Nouvelle conciliation
          </DialogTitle>
          <DialogDescription>
            Importez l'ordonnance hospitalière (PDF ou photo). Un nouvel épisode sera créé automatiquement.
          </DialogDescription>
        </DialogHeader>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => !mut.isPending && inputRef.current?.click()}
          className={`relative cursor-pointer rounded-xl border-2 border-dashed transition-all p-8 text-center
            ${dragOver ? "border-primary bg-primary/5" : "border-primary/30 bg-gradient-to-br from-primary/[0.03] to-transparent hover:border-primary/60 hover:bg-primary/[0.05]"}`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e: ChangeEvent<HTMLInputElement>) => handleFile(e.target.files?.[0])}
          />

          {mut.isPending ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-10 w-10 text-primary animate-spin" />
              <div>
                <div className="font-semibold text-base">Création de la conciliation…</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {file?.name} • création de l'épisode et extraction IA
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
                <Upload className="h-7 w-7 text-primary" />
              </div>
              <div>
                <div className="text-lg font-bold">Importer l'ordonnance hospitalière</div>
                <div className="text-sm text-muted-foreground mt-1">
                  Glissez-déposez un PDF ou une photo, ou cliquez pour parcourir.
                </div>
                <div className="flex items-center justify-center gap-2 mt-3 text-[11px] text-muted-foreground">
                  <Badge variant="outline" className="text-[10px]"><FileText className="h-3 w-3 mr-1" />PDF</Badge>
                  <Badge variant="outline" className="text-[10px]">JPG / PNG</Badge>
                  <Badge variant="secondary" className="text-[10px]">OCR IA + détection auto</Badge>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={mut.isPending}>
            Annuler
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
