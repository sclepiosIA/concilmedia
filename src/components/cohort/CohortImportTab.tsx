import { useState, type ChangeEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Upload, Loader2, Plus, FolderPlus } from "lucide-react";
import { toast } from "sonner";
import { createCohort, listCohorts } from "@/lib/cohort/cohort.functions";
import { BulkPatientImportModal } from "@/components/conciliation/BulkPatientImportModal";
import { CohortPatientsRosterUploader } from "@/components/cohort/CohortPatientsRosterUploader";
import { CohortDatasetUploader } from "@/components/cohort/CohortDatasetUploader";

export function CohortImportTab({ activeCohortId, onCohortSelected }: { activeCohortId: string | null; onCohortSelected: (id: string) => void }) {
  const qc = useQueryClient();
  const createFn = useServerFn(createCohort);
  const listFn = useServerFn(listCohorts);
  const cohortsQ = useQuery({ queryKey: ["cohorts"], queryFn: () => listFn() });

  const [tag, setTag] = useState("");
  const [label, setLabel] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  const create = useMutation({
    mutationFn: async () => createFn({ data: { tag: tag.trim(), label: label.trim() || null } }),
    onSuccess: (c) => {
      toast.success(`Cohorte "${c.tag}" prête`);
      qc.invalidateQueries({ queryKey: ["cohorts"] });
      onCohortSelected(c.id);
      setTag(""); setLabel("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  const onFilesPicked = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    if (!activeCohortId) { toast.error("Sélectionnez ou créez une cohorte d'abord"); return; }
    setPendingFiles(files);
    setModalOpen(true);
    e.target.value = "";
  };

  return (
    <div className="space-y-6">
      <Card className="p-4 space-y-3">
        <h3 className="font-semibold flex items-center gap-2"><FolderPlus className="h-4 w-4" /> Nouvelle cohorte</h3>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] gap-2">
          <div>
            <Label htmlFor="tag" className="text-xs">Tag (sans espace)</Label>
            <Input id="tag" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="lot-mars-cardio" />
          </div>
          <div>
            <Label htmlFor="label" className="text-xs">Libellé (optionnel)</Label>
            <Input id="label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Lot mars 2026 — Cardio" />
          </div>
          <div className="flex items-end">
            <Button onClick={() => create.mutate()} disabled={create.isPending || !tag.trim()}>
              {create.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
              Créer
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Cohortes existantes</h3>
        </div>
        {cohortsQ.isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
        {cohortsQ.data?.cohorts.length === 0 && <p className="text-sm text-muted-foreground">Aucune cohorte. Créez-en une ci-dessus.</p>}
        <div className="space-y-1">
          {cohortsQ.data?.cohorts.map((c) => (
            <button
              key={c.id}
              onClick={() => onCohortSelected(c.id)}
              className={`w-full text-left p-2 rounded-md border hover:bg-accent flex items-center gap-2 ${activeCohortId === c.id ? "border-primary bg-accent" : ""}`}
            >
              <Badge variant={activeCohortId === c.id ? "default" : "outline"}>{c.tag}</Badge>
              {c.label && <span className="text-sm text-muted-foreground">{c.label}</span>}
              <span className="ml-auto text-xs text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</span>
            </button>
          ))}
        </div>
      </Card>

      <CohortDatasetUploader cohortId={activeCohortId} />

      <CohortPatientsRosterUploader cohortId={activeCohortId} />

      <Card className="p-4 space-y-3">
        <h3 className="font-semibold">Upload de fichiers patients (multi-patient)</h3>
        <p className="text-xs text-muted-foreground">
          {activeCohortId ? "L'IA triera automatiquement par patient, classera les documents (ordonnances, lettres, bio, CRH) et créera les épisodes." : "Sélectionnez une cohorte d'abord."}
        </p>
        <label>
          <input
            type="file"
            accept="application/pdf,image/*"
            multiple
            disabled={!activeCohortId}
            onChange={onFilesPicked}
            className="hidden"
          />
          <div className={`border-2 border-dashed rounded-lg p-6 text-center ${activeCohortId ? "cursor-pointer hover:bg-accent" : "opacity-50 cursor-not-allowed"}`}>
            <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
            <div className="text-sm font-medium">Cliquez pour sélectionner les PDF / images</div>
            <div className="text-xs text-muted-foreground mt-1">Jusqu'à 1000 fichiers, 10 Mo chacun</div>
          </div>
        </label>
      </Card>

      <BulkPatientImportModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        initialFiles={pendingFiles}
        cohortId={activeCohortId}
        onCompleted={() => {
          qc.invalidateQueries({ queryKey: ["cohortPatients", activeCohortId] });
        }}
      />
    </div>
  );
}
