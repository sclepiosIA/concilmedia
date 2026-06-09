import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, FileText, Trash2, Sparkles, ExternalLink, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  uploadPharmacistDoc,
  getPharmacistDoc,
  deletePharmacistDoc,
  comparePharmacistVsAI,
  type ComparisonPayload,
} from "@/lib/conciliation/pharmacistDoc.functions";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = r.result as string;
      resolve(s.split(",")[1] ?? "");
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

const statutColor: Record<string, string> = {
  concordant: "text-ok",
  divergent: "text-crit",
  ia_seulement: "text-major",
  pharmacien_seulement: "text-major",
};
const statutIcon: Record<string, typeof CheckCircle2> = {
  concordant: CheckCircle2,
  divergent: XCircle,
  ia_seulement: AlertTriangle,
  pharmacien_seulement: AlertTriangle,
};

export function PharmacistDocumentCompareCard({
  analysisId,
  patientId,
  episodeId,
}: {
  analysisId: string;
  patientId: string;
  episodeId?: string | null;
}) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadFn = useServerFn(uploadPharmacistDoc);
  const getFn = useServerFn(getPharmacistDoc);
  const deleteFn = useServerFn(deletePharmacistDoc);
  const compareFn = useServerFn(comparePharmacistVsAI);
  const [uploading, setUploading] = useState(false);

  const queryKey = ["pharmacist-doc", analysisId];
  const { data: doc } = useQuery({
    queryKey,
    queryFn: () => getFn({ data: { analysisId } }),
  });

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      if (file.type !== "application/pdf") throw new Error("Seuls les PDF sont acceptés.");
      if (file.size > 10 * 1024 * 1024) throw new Error("Fichier trop volumineux (max 10 Mo).");
      const base64 = await fileToBase64(file);
      return uploadFn({
        data: {
          analysisId,
          patientId,
          episodeId: episodeId ?? null,
          fileName: file.name,
          mimeType: file.type,
          base64,
        },
      });
    },
    onSuccess: () => {
      toast.success("Document uploadé");
      qc.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setUploading(false),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteFn({ data: { analysisId } }),
    onSuccess: () => {
      toast.success("Document supprimé");
      qc.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const compareMut = useMutation({
    mutationFn: () => compareFn({ data: { analysisId } }),
    onSuccess: () => {
      toast.success("Comparaison terminée");
      qc.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const comparison = doc?.comparison_payload as ComparisonPayload | null | undefined;

  return (
    <section className="rounded-lg border-2 border-indigo-300 bg-indigo-50/40 p-4 space-y-3">
      <header className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-indigo-700" />
        <h3 className="text-sm font-semibold text-indigo-900">
          Comparaison IA vs document pharmacien
        </h3>
      </header>

      <p className="text-xs text-muted-foreground">
        Uploadez le PDF de la conciliation validée par le pharmacien (liste des divergences entre traitement habituel et prescription hospitalière). L'IA comparera ensuite ce document à sa propre analyse.
      </p>

      {!doc && (
        <div
          className="border-2 border-dashed border-indigo-300 rounded-lg p-6 text-center cursor-pointer hover:bg-indigo-100/40 transition"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) { setUploading(true); uploadMut.mutate(f); }
          }}
        >
          <Upload className="h-6 w-6 mx-auto text-indigo-600 mb-2" />
          <div className="text-sm font-medium">Cliquez ou déposez le PDF ici</div>
          <div className="text-xs text-muted-foreground mt-1">PDF · max 10 Mo</div>
          {uploading && <Loader2 className="h-4 w-4 mx-auto mt-2 animate-spin" />}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) { setUploading(true); uploadMut.mutate(f); }
          e.target.value = "";
        }}
      />

      {doc && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap rounded border bg-background p-2">
            <div className="flex items-center gap-2 text-sm min-w-0">
              <FileText className="h-4 w-4 text-indigo-600 shrink-0" />
              <span className="truncate font-medium">{doc.file_name}</span>
              <span className="text-xs text-muted-foreground shrink-0">
                {format(new Date(doc.uploaded_at), "d MMM yyyy HH:mm", { locale: fr })}
              </span>
            </div>
            <div className="flex gap-2">
              {doc.signedUrl && (
                <Button asChild variant="outline" size="sm">
                  <a href={doc.signedUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3 w-3 mr-1" /> Ouvrir
                  </a>
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => deleteMut.mutate()}
                disabled={deleteMut.isPending}
              >
                <Trash2 className="h-3 w-3 mr-1" /> Supprimer
              </Button>
            </div>
          </div>

          <Button
            size="sm"
            className="bg-indigo-600 hover:bg-indigo-700"
            onClick={() => compareMut.mutate()}
            disabled={compareMut.isPending}
          >
            {compareMut.isPending ? (
              <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Analyse en cours…</>
            ) : (
              <><Sparkles className="h-4 w-4 mr-1" /> {comparison ? "Relancer l'analyse" : "Analyser la concordance"}</>
            )}
          </Button>

          {comparison && (
            <div className="space-y-3 rounded border bg-background p-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="font-semibold text-sm">Résultat de la comparaison</div>
                <Badge variant="outline" className="text-sm">
                  Concordance : {comparison.concordance_globale}%
                </Badge>
              </div>

              <p className="text-sm">{comparison.synthese}</p>

              {comparison.matches?.length > 0 && (
                <div>
                  <div className="text-xs font-semibold mb-1">Médicaments analysés</div>
                  <ul className="space-y-1">
                    {comparison.matches.map((m, i) => {
                      const Icon = statutIcon[m.statut] ?? CheckCircle2;
                      return (
                        <li key={i} className="text-xs flex items-start gap-2">
                          <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${statutColor[m.statut] ?? ""}`} />
                          <div>
                            <span className="font-medium">{m.medicament}</span>{" "}
                            <span className={statutColor[m.statut] ?? ""}>({m.statut.replace("_", " ")})</span>
                            {m.commentaire && <span className="text-muted-foreground"> — {m.commentaire}</span>}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {comparison.points_manques_par_ia?.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-major mb-1">Points manqués par l'IA</div>
                  <ul className="list-disc pl-5 text-xs space-y-0.5">
                    {comparison.points_manques_par_ia.map((p, i) => <li key={i}>{p}</li>)}
                  </ul>
                </div>
              )}

              {comparison.points_manques_par_pharmacien?.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-major mb-1">Points non listés par le pharmacien</div>
                  <ul className="list-disc pl-5 text-xs space-y-0.5">
                    {comparison.points_manques_par_pharmacien.map((p, i) => <li key={i}>{p}</li>)}
                  </ul>
                </div>
              )}

              {comparison.conclusion && (
                <div className="text-xs border-l-2 border-indigo-400 pl-2 italic">
                  {comparison.conclusion}
                </div>
              )}

              {doc.compared_at && (
                <div className="text-[10px] text-muted-foreground">
                  Analysé le {format(new Date(doc.compared_at), "d MMM yyyy 'à' HH:mm", { locale: fr })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
