import { useState, type ChangeEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { getCohortPatients } from "@/lib/cohort/cohort.functions";
import { uploadPharmacistGoldStandard } from "@/lib/cohort/goldStandard.functions";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(",")[1] ?? "");
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export function GoldStandardTab({ cohortId }: { cohortId: string }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getCohortPatients);
  const uploadFn = useServerFn(uploadPharmacistGoldStandard);
  const data = useQuery({ queryKey: ["cohortPatients", cohortId], queryFn: () => getFn({ data: { cohortId } }) });
  const [uploadingPid, setUploadingPid] = useState<string | null>(null);

  const onFile = async (patientId: string, episodeId: string | null, e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { toast.error("Fichier > 10 Mo"); return; }
    setUploadingPid(patientId);
    try {
      const b64 = await fileToBase64(f);
      const r = await uploadFn({
        data: {
          patientId,
          episodeId,
          cohortId,
          fileBase64: b64,
          mimeType: f.type || "application/pdf",
          fileName: f.name,
        },
      });
      toast.success(`Gold standard extrait : ${r.gold.nb_divergences} divergence(s)`);
      qc.invalidateQueries({ queryKey: ["cohortPatients", cohortId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur upload");
    } finally {
      setUploadingPid(null);
    }
  };

  return (
    <div className="space-y-3">
      <Card className="p-4">
        <h3 className="font-semibold">Documents pharmacien (gold standard)</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Upload du document de conciliation finalisée par le pharmacien pour chaque patient. L'IA en extrait les divergences pour servir de référence.
        </p>
      </Card>

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted text-xs">
            <tr>
              <th className="text-left p-2">Patient</th>
              <th className="text-left p-2">Gold standard</th>
              <th className="text-left p-2">Triage</th>
              <th className="text-left p-2">Divergences</th>
              <th className="text-right p-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {data.data?.patients.map((p) => {
              const ep = data.data?.episodes.find((e) => e.patient_id === p.id);
              const g = data.data?.gold.find((x) => x.patient_id === p.id);
              return (
                <tr key={p.id} className="border-t">
                  <td className="p-2 font-medium">{p.nom?.toUpperCase()} {p.prenom}</td>
                  <td className="p-2">
                    {g ? (
                      <Badge variant="default"><Check className="h-3 w-3 mr-1" />{g.file_name}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Manquant</span>
                    )}
                  </td>
                  <td className="p-2">{g?.triage_complexe === true ? <Badge>Complexe</Badge> : g?.triage_complexe === false ? <Badge variant="outline">Simple</Badge> : "—"}</td>
                  <td className="p-2">{g?.nb_divergences ?? "—"}</td>
                  <td className="p-2 text-right">
                    <label>
                      <input type="file" accept="application/pdf,image/*" className="hidden"
                        disabled={uploadingPid !== null}
                        onChange={(e) => onFile(p.id, ep?.id ?? null, e)} />
                      <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs border rounded-md ${uploadingPid === p.id ? "opacity-50" : "cursor-pointer hover:bg-accent"}`}>
                        {uploadingPid === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                        {g ? "Remplacer" : "Upload"}
                      </span>
                    </label>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// re-export for Button kept simple (used inline above)
export { Button };
