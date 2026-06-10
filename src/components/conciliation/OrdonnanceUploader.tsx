import { useState, type ChangeEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileText, Sparkles, Loader2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { extractOrdonnance, importExtractedMedications, type ExtractedMedication } from "@/lib/conciliation/extractOrdonnance.functions";
import { preprocessOrdonnance } from "@/lib/conciliation/preprocessOrdonnance";
import { OcrReviewTable, type ReviewableMed } from "./OcrReviewTable";

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

export function OrdonnanceUploader({ patientId }: { patientId: string }) {
  const qc = useQueryClient();
  const extract = useServerFn(extractOrdonnance);
  const importMeds = useServerFn(importExtractedMedications);
  const [meds, setMeds] = useState<ReviewableMed[]>([]);
  const [prescripteur, setPrescripteur] = useState<string | undefined>();
  const [date, setDate] = useState<string | undefined>();
  const [files, setFiles] = useState<File[]>([]);
  const [modelsUsed, setModelsUsed] = useState<string[]>([]);
  const [progressMsg, setProgressMsg] = useState<string>("");

  const extractMut = useMutation({
    mutationFn: async (fs: File[]) => {
      const all: ExtractedMedication[] = [];
      let firstPrescripteur: string | undefined;
      let firstDate: string | undefined;
      let modelsUnion = new Set<string>();
      for (let idx = 0; idx < fs.length; idx++) {
        const f = fs[idx];
        setProgressMsg(`Pré-traitement (${idx + 1}/${fs.length})…`);
        const pre = await preprocessOrdonnance(f);
        setProgressMsg(`Analyse OCR (${idx + 1}/${fs.length}) — 2 modèles + BDPM…`);
        const b64 = await fileToBase64(pre.file);
        const r = await extract({ data: { patientId, fileBase64: b64, mimeType: pre.file.type, fileName: pre.file.name } });
        all.push(...r.medications);
        if (!firstPrescripteur) firstPrescripteur = r.prescripteur;
        if (!firstDate) firstDate = r.date_prescription;
        for (const m of r.models_used ?? []) modelsUnion.add(m);
      }
      return { medications: all, prescripteur: firstPrescripteur, date_prescription: firstDate, models: Array.from(modelsUnion) };
    },
    onSuccess: (r) => {
      setMeds(r.medications.map((m) => ({
        ...m,
        _include: (m.bdpm_confidence ?? 0) >= 0.4 || m.match_status === "exact" || m.agreement === "both",
      })));
      setPrescripteur(r.prescripteur);
      setDate(r.date_prescription);
      setModelsUsed(r.models);
      setProgressMsg("");
      toast.success(`${r.medications.length} médicament(s) extrait(s) — ${r.models.length} modèle(s) consulté(s)`);
    },
    onError: (e) => {
      setProgressMsg("");
      toast.error(e instanceof Error ? e.message : "Erreur d'extraction");
    },
  });

  const importMut = useMutation({
    mutationFn: async () => {
      const selected = meds.filter((m) => m._include).map(({ _include, ...m }) => m);
      void _include;
      return importMeds({ data: { patientId, medications: selected as unknown as Record<string, unknown>[] } });
    },
    onSuccess: (r) => {
      toast.success(`${r.inserted} traitement(s) importé(s) au BMO`);
      setMeds([]); setFiles([]); setModelsUsed([]);
      qc.invalidateQueries({ queryKey: ["traitements", patientId] });
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

  const selectedCount = meds.filter((m) => m._include).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" /> Importer une ou plusieurs ordonnances (OCR IA — ensemble + BDPM)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
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

        {extractMut.isPending && progressMsg && (
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" /> {progressMsg}
          </div>
        )}

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
            <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
              <FileText className="h-3 w-3" />
              {prescripteur && <span>Dr {prescripteur}</span>}
              {date && <span>• {date}</span>}
              {modelsUsed.length > 0 && <span>• Modèles : {modelsUsed.join(", ")}</span>}
            </div>
            <OcrReviewTable meds={meds} onChange={setMeds} />
            <Button onClick={() => importMut.mutate()} disabled={importMut.isPending || selectedCount === 0} className="w-full">
              {importMut.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <><Check className="h-4 w-4 mr-1" /> Importer les {selectedCount} médicament(s) sélectionné(s) au BMO</>}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
