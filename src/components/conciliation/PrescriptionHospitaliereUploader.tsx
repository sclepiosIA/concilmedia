import { useState, type ChangeEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Upload, FileText, Sparkles, Loader2, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { extractOrdonnance, importExtractedHospitalPrescriptions, type ExtractedMedication } from "@/lib/conciliation/extractOrdonnance.functions";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const res = r.result as string;
      resolve(res.split(",")[1] ?? "");
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export function PrescriptionHospitaliereUploader({ episodeId, patientId }: { episodeId: string; patientId: string }) {
  const qc = useQueryClient();
  const extract = useServerFn(extractOrdonnance);
  const importMeds = useServerFn(importExtractedHospitalPrescriptions);
  const [meds, setMeds] = useState<ExtractedMedication[]>([]);
  const [prescripteur, setPrescripteur] = useState<string | undefined>();
  const [date, setDate] = useState<string | undefined>();
  const [files, setFiles] = useState<File[]>([]);

  const extractMut = useMutation({
    mutationFn: async (fs: File[]) => {
      const all: ExtractedMedication[] = [];
      let firstPrescripteur: string | undefined;
      let firstDate: string | undefined;
      for (const f of fs) {
        const b64 = await fileToBase64(f);
        const r = await extract({ data: { patientId, fileBase64: b64, mimeType: f.type, fileName: f.name } });
        all.push(...r.medications);
        if (!firstPrescripteur) firstPrescripteur = r.prescripteur;
        if (!firstDate) firstDate = r.date_prescription;
      }
      return { medications: all, prescripteur: firstPrescripteur, date_prescription: firstDate };
    },
    onSuccess: (r) => {
      setMeds(r.medications);
      setPrescripteur(r.prescripteur);
      setDate(r.date_prescription);
      toast.success(`${r.medications.length} médicament(s) extrait(s) sur ${files.length} fichier(s)`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur d'extraction"),
  });

  const importMut = useMutation({
    mutationFn: async () => importMeds({ data: { episodeId, patientId, medications: meds as unknown as Record<string, unknown>[] } }),
    onSuccess: (r) => {
      toast.success(`${r.inserted} prescription(s) importée(s)`);
      setMeds([]); setFiles([]);
      qc.invalidateQueries({ queryKey: ["prescriptions", episodeId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur d'import"),
  });

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const fs = Array.from(e.target.files ?? []);
    if (fs.length === 0) return;
    setFiles((prev) => [...prev, ...fs]);
    setMeds([]);
    e.target.value = "";
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
    setMeds([]);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <label className="flex-1">
          <input type="file" accept="image/*,application/pdf" multiple onChange={onFile} className="hidden" />
          <div className="border-2 border-dashed rounded-md px-3 py-4 text-center text-sm text-muted-foreground hover:bg-accent cursor-pointer flex items-center justify-center gap-2">
            <Upload className="h-4 w-4" /> {files.length > 0 ? `Ajouter d'autres fichiers (${files.length} sélectionné(s))` : "Choisir PDF / photos"}
          </div>
        </label>
        <Button
          onClick={() => files.length > 0 && extractMut.mutate(files)}
          disabled={files.length === 0 || extractMut.isPending}
        >
          {extractMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Analyser"}
        </Button>
      </div>

      {files.length > 0 && (
        <div className="border rounded-md divide-y">
          {files.map((f, i) => (
            <div key={i} className="flex items-center justify-between p-2 text-sm">
              <div className="flex items-center gap-2 truncate">
                <FileText className="h-3 w-3 shrink-0" />
                <span className="truncate">{f.name}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => removeFile(i)} disabled={extractMut.isPending}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {meds.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <FileText className="h-3 w-3" />
            {prescripteur && <span>Dr {prescripteur}</span>}
            {date && <span>• {date}</span>}
          </div>
          <div className="border rounded-md divide-y max-h-64 overflow-auto">
            {meds.map((m, i) => (
              <div key={i} className="p-2 text-sm">
                <div className="font-medium">{m.dci}{m.nom_commercial && <span className="text-muted-foreground"> ({m.nom_commercial})</span>}</div>
                <div className="flex gap-1 flex-wrap mt-1">
                  {m.dosage && <Badge variant="outline" className="text-xs">{m.dosage} {m.dosage_unite ?? ""}</Badge>}
                  {m.voie_administration && <Badge variant="secondary" className="text-xs">{m.voie_administration}</Badge>}
                  {(m.posologie_matin || m.posologie_midi || m.posologie_soir || m.posologie_coucher) && (
                    <Badge variant="outline" className="text-xs">
                      {[m.posologie_matin && `${m.posologie_matin}M`, m.posologie_midi && `${m.posologie_midi}Mi`, m.posologie_soir && `${m.posologie_soir}S`, m.posologie_coucher && `${m.posologie_coucher}C`].filter(Boolean).join(" / ")}
                    </Badge>
                  )}
                </div>
                {m.posologie_texte && <div className="text-xs text-muted-foreground mt-1">{m.posologie_texte}</div>}
              </div>
            ))}
          </div>
          <Button onClick={() => importMut.mutate()} disabled={importMut.isPending} className="w-full">
            {importMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4 mr-1" /> Importer ces {meds.length} prescription(s)</>}
          </Button>
        </div>
      )}
    </div>
  );
}
