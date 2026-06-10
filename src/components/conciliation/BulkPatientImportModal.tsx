import { useState, useEffect, type ChangeEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Trash2, Sparkles, Loader2, Check, AlertTriangle, X, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { extractPatientDossier, commitBulkImport, type ExtractedDossier } from "@/lib/conciliation/bulkImport.functions";

const docTypeLabel: Record<string, string> = {
  ordonnance_ville: "Ordo ville",
  ordonnance_hospitaliere: "Ordo hospi",
  compte_rendu: "Compte-rendu",
  bilan_bio: "Bilan bio",
  autre: "Autre",
};

const MAX_FILES = 1000;
const MAX_SIZE = 10 * 1024 * 1024;
const EXTRACT_CONCURRENCY = 3; // appels IA parallèles pendant l'extraction
const COMMIT_BATCH_SIZE = 25; // taille de lot pour l'enregistrement serveur

type ItemStatus = "pending" | "extracting" | "ready" | "error";
type Item = {
  id: string;
  file: File;
  status: ItemStatus;
  error?: string;
  dossier?: ExtractedDossier;
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(",")[1] ?? "");
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export function BulkPatientImportModal({ open, onOpenChange, targetPatientId, initialFiles, onCompleted }: { open: boolean; onOpenChange: (v: boolean) => void; targetPatientId?: string; initialFiles?: File[]; onCompleted?: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const extract = useServerFn(extractPatientDossier);
  const commit = useServerFn(commitBulkImport);
  const [items, setItems] = useState<Item[]>([]);
  const [phase, setPhase] = useState<"upload" | "extracting" | "review" | "done">("upload");
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState<{ created: number; updated: number; failed: { name: string; error: string }[]; created_episode_ids: string[] } | null>(null);

  useEffect(() => {
    if (open && initialFiles && initialFiles.length > 0) {
      const valid = initialFiles.filter((f) => f.size <= MAX_SIZE).slice(0, MAX_FILES);
      setItems(valid.map((f) => ({ id: `${f.name}-${f.lastModified}-${Math.random()}`, file: f, status: "pending" as ItemStatus })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const fs = Array.from(e.target.files ?? []);
    const valid = fs.filter((f) => {
      if (f.size > MAX_SIZE) { toast.error(`${f.name} > 10 Mo`); return false; }
      return true;
    });
    const combined = [...items, ...valid.map((f) => ({ id: `${f.name}-${f.lastModified}-${Math.random()}`, file: f, status: "pending" as ItemStatus }))];
    if (combined.length > MAX_FILES) { toast.error(`Max ${MAX_FILES} fichiers`); return; }
    setItems(combined);
    e.target.value = "";
  };

  const removeItem = (id: string) => setItems((p) => p.filter((i) => i.id !== id));

  const startExtraction = async () => {
    if (items.length === 0) return;
    setPhase("extracting");
    setProgress(0);
    const total = items.length;
    let done = 0;
    const updated: Item[] = [...items];
    for (let i = 0; i < updated.length; i++) {
      updated[i] = { ...updated[i], status: "extracting" };
      setItems([...updated]);
      try {
        const b64 = await fileToBase64(updated[i].file);
        const d = await extract({ data: { fileBase64: b64, mimeType: updated[i].file.type || "application/pdf", fileName: updated[i].file.name } });
        updated[i] = { ...updated[i], status: "ready", dossier: d };
      } catch (e) {
        updated[i] = { ...updated[i], status: "error", error: e instanceof Error ? e.message : "Erreur" };
      }
      done++;
      setProgress(Math.round((done / total) * 100));
      setItems([...updated]);
    }
    setPhase("review");
  };

  const updateDossier = (id: string, patch: (d: ExtractedDossier) => ExtractedDossier) => {
    setItems((p) => p.map((i) => (i.id === id && i.dossier ? { ...i, dossier: patch(i.dossier) } : i)));
  };

  const importMut = useMutation({
    mutationFn: async () => {
      const ready = items.filter((i) => i.status === "ready" && i.dossier);
      const payload = await Promise.all(ready.map(async (i) => {
        const b64 = await fileToBase64(i.file);
        const base = {
          ...i.dossier!,
          file_base64: b64,
          mime_type: i.file.type || "application/pdf",
          file_size: i.file.size,
          source_file: i.file.name,
        };
        return targetPatientId ? { ...base, existing_patient_id: targetPatientId } : base;
      }));
      return commit({ data: { items: payload } });
    },
    onSuccess: (r) => {
      setSummary(r);
      setPhase("done");
      qc.invalidateQueries({ queryKey: ["patients"] });
      if (targetPatientId) {
        qc.invalidateQueries({ queryKey: ["patient", targetPatientId] });
        qc.invalidateQueries({ queryKey: ["antecedents", targetPatientId] });
        qc.invalidateQueries({ queryKey: ["comorbidites", targetPatientId] });
        qc.invalidateQueries({ queryKey: ["allergies", targetPatientId] });
        qc.invalidateQueries({ queryKey: ["traitements", targetPatientId] });
        qc.invalidateQueries({ queryKey: ["biologie", targetPatientId] });
        qc.invalidateQueries({ queryKey: ["episodes", targetPatientId] });
      }
      const epMsg = r.created_episode_ids.length > 0 ? ` • ${r.created_episode_ids.length} épisode(s) créé(s)` : "";
      toast.success(targetPatientId ? `Données ajoutées${epMsg}` : `${r.created} créé(s), ${r.updated} mis à jour${epMsg}`);
      onCompleted?.();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur import"),
  });

  const reset = () => { setItems([]); setPhase("upload"); setProgress(0); setSummary(null); };
  const close = () => { reset(); onOpenChange(false); };

  const readyCount = items.filter((i) => i.status === "ready").length;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> Import PDF en masse — Extraction IA
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-4">
          {phase === "upload" && (
            <>
              <label>
                <input type="file" accept="application/pdf,image/*" multiple onChange={onFiles} className="hidden" />
                <div className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-accent">
                  <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <div className="font-medium">Cliquez pour sélectionner vos PDF</div>
                  <div className="text-xs text-muted-foreground mt-1">Max {MAX_FILES} fichiers, 10 Mo chacun</div>
                </div>
              </label>
              {items.length > 0 && (
                <div className="border rounded-md divide-y">
                  {items.map((i) => (
                    <div key={i.id} className="p-2 flex items-center gap-2 text-sm">
                      <span className="flex-1 truncate">{i.file.name}</span>
                      <span className="text-xs text-muted-foreground">{(i.file.size / 1024).toFixed(0)} ko</span>
                      <Button size="icon" variant="ghost" onClick={() => removeItem(i.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {phase === "extracting" && (
            <div className="space-y-3">
              <Progress value={progress} />
              <div className="text-sm text-muted-foreground text-center">Extraction en cours… {progress}%</div>
              <div className="border rounded-md divide-y max-h-[50vh] overflow-auto">
                {items.map((i) => (
                  <div key={i.id} className="p-2 flex items-center gap-2 text-sm">
                    {i.status === "extracting" && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                    {i.status === "ready" && <Check className="h-4 w-4 text-green-600" />}
                    {i.status === "error" && <X className="h-4 w-4 text-destructive" />}
                    {i.status === "pending" && <span className="h-4 w-4" />}
                    <span className="flex-1 truncate">{i.file.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {phase === "review" && (
            <Accordion type="multiple" className="space-y-2">
              {items.map((i) => (
                <AccordionItem key={i.id} value={i.id} className="border rounded-md px-3">
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-2 flex-1 text-left flex-wrap">
                      {i.status === "ready" && i.dossier?.existing_patient_id && <Badge variant="outline" className="border-yellow-500 text-yellow-700"><AlertTriangle className="h-3 w-3 mr-1" />Doublon</Badge>}
                      {i.status === "ready" && !i.dossier?.existing_patient_id && <Badge variant="outline" className="border-green-500 text-green-700"><Check className="h-3 w-3 mr-1" />Prêt</Badge>}
                      {i.status === "error" && <Badge variant="destructive">Erreur</Badge>}
                      {i.dossier?.document_type && <Badge variant="secondary">{docTypeLabel[i.dossier.document_type] ?? i.dossier.document_type}</Badge>}
                      <span className="font-medium">
                        {i.dossier?.patient.nom?.toUpperCase()} {i.dossier?.patient.prenom}
                      </span>
                      <span className="text-xs text-muted-foreground ml-auto">{i.file.name}</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    {i.status === "error" && <div className="text-sm text-destructive p-2">{i.error}</div>}
                    {i.dossier && <DossierEditor dossier={i.dossier} onChange={(p) => updateDossier(i.id, p)} />}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}

          {phase === "done" && summary && (
            <div className="space-y-3 text-center py-6">
              <Check className="h-12 w-12 text-green-600 mx-auto" />
              <div className="text-lg font-medium">Import terminé</div>
              <div className="text-sm text-muted-foreground">
                {summary.created} patient(s) créé(s), {summary.updated} mis à jour
                {summary.created_episode_ids.length > 0 && ` • ${summary.created_episode_ids.length} épisode(s) créé(s)`}
              </div>
              {summary.created_episode_ids.length > 0 && (
                <div className="flex justify-center">
                  <Button onClick={() => { const id = summary.created_episode_ids[0]; close(); navigate({ to: "/episodes/$episodeId", params: { episodeId: id } }); }}>
                    Ouvrir la conciliation <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              )}
              {summary.failed.length > 0 && (
                <div className="border rounded-md p-3 text-left text-sm">
                  <div className="font-medium text-destructive mb-1">{summary.failed.length} échec(s)</div>
                  {summary.failed.map((f, idx) => <div key={idx} className="text-xs">• {f.name}: {f.error}</div>)}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {phase === "upload" && (
            <>
              <Button variant="outline" onClick={close}>Annuler</Button>
              <Button onClick={startExtraction} disabled={items.length === 0}>
                <Sparkles className="h-4 w-4 mr-1" /> Analyser ({items.length})
              </Button>
            </>
          )}
          {phase === "review" && (
            <>
              <Button variant="outline" onClick={reset}>Recommencer</Button>
              <Button onClick={() => importMut.mutate()} disabled={readyCount === 0 || importMut.isPending}>
                {importMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
                Importer {readyCount} patient(s)
              </Button>
            </>
          )}
          {phase === "done" && <Button onClick={close}>Fermer</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DossierEditor({ dossier, onChange }: { dossier: ExtractedDossier; onChange: (p: (d: ExtractedDossier) => ExtractedDossier) => void }) {
  return (
    <Tabs defaultValue="identite" className="w-full">
      <TabsList className="grid grid-cols-5 w-full">
        <TabsTrigger value="identite">Identité</TabsTrigger>
        <TabsTrigger value="clinique">ATCD/Co/Allg ({dossier.antecedents.length + dossier.comorbidites.length + dossier.allergies.length})</TabsTrigger>
        <TabsTrigger value="biologie">Bio ({dossier.biologie.length})</TabsTrigger>
        <TabsTrigger value="traitements">Trt habituels ({dossier.traitements.length})</TabsTrigger>
        <TabsTrigger value="hospi">Presc. hospi ({dossier.prescriptions_hospitalieres.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="identite" className="space-y-2 pt-3">
        <div className="grid grid-cols-2 gap-2">
          <div><Label>Nom</Label><Input value={dossier.patient.nom ?? ""} onChange={(e) => onChange((d) => ({ ...d, patient: { ...d.patient, nom: e.target.value } }))} /></div>
          <div><Label>Prénom</Label><Input value={dossier.patient.prenom ?? ""} onChange={(e) => onChange((d) => ({ ...d, patient: { ...d.patient, prenom: e.target.value } }))} /></div>
          <div><Label>Date naissance</Label><Input type="date" value={dossier.patient.date_naissance ?? ""} onChange={(e) => onChange((d) => ({ ...d, patient: { ...d.patient, date_naissance: e.target.value } }))} /></div>
          <div><Label>Sexe</Label><Input value={dossier.patient.sexe ?? ""} onChange={(e) => onChange((d) => ({ ...d, patient: { ...d.patient, sexe: e.target.value as "M" | "F" | "autre" } }))} /></div>
          <div><Label>Poids (kg)</Label><Input type="number" value={dossier.patient.poids_kg ?? ""} onChange={(e) => onChange((d) => ({ ...d, patient: { ...d.patient, poids_kg: e.target.value ? Number(e.target.value) : null } }))} /></div>
          <div><Label>Taille (cm)</Label><Input type="number" value={dossier.patient.taille_cm ?? ""} onChange={(e) => onChange((d) => ({ ...d, patient: { ...d.patient, taille_cm: e.target.value ? Number(e.target.value) : null } }))} /></div>
        </div>
        {dossier.episode_context && (dossier.episode_context.motif || dossier.episode_context.service || dossier.episode_context.date_admission) && (
          <div className="text-xs bg-blue-50 text-blue-800 p-2 rounded">
            <strong>Contexte d'épisode détecté :</strong>{" "}
            {dossier.episode_context.motif ?? ""} {dossier.episode_context.service ? `• ${dossier.episode_context.service}` : ""} {dossier.episode_context.date_admission ? `• admis le ${dossier.episode_context.date_admission}` : ""}
          </div>
        )}
        {dossier.existing_patient_id && (
          <div className="text-xs text-yellow-700 bg-yellow-50 p-2 rounded">
            ⚠ Un patient existant correspond. L'import ajoutera ces données au dossier existant.
          </div>
        )}
      </TabsContent>

      <TabsContent value="clinique" className="space-y-3 pt-3">
        <ListSection title="Antécédents" items={dossier.antecedents} render={(a) => `[${a.type}] ${a.description}${a.date_evenement ? ` (${a.date_evenement})` : ""}`} onRemove={(idx) => onChange((d) => ({ ...d, antecedents: d.antecedents.filter((_, i) => i !== idx) }))} />
        <ListSection title="Comorbidités" items={dossier.comorbidites} render={(c) => `${c.libelle} — ${c.statut}`} onRemove={(idx) => onChange((d) => ({ ...d, comorbidites: d.comorbidites.filter((_, i) => i !== idx) }))} />
        <ListSection title="Allergies" items={dossier.allergies} render={(a) => `${a.substance}${a.reaction ? ` → ${a.reaction}` : ""}${a.severite ? ` (${a.severite})` : ""}`} onRemove={(idx) => onChange((d) => ({ ...d, allergies: d.allergies.filter((_, i) => i !== idx) }))} />
      </TabsContent>

      <TabsContent value="biologie" className="pt-3">
        <ListSection title="Résultats biologiques" items={dossier.biologie} render={(b) => `${b.parametre}: ${b.valeur ?? b.valeur_texte ?? "—"} ${b.unite ?? ""}${b.date_prelevement ? ` (${b.date_prelevement})` : ""}`} onRemove={(idx) => onChange((d) => ({ ...d, biologie: d.biologie.filter((_, i) => i !== idx) }))} />
      </TabsContent>

      <TabsContent value="traitements" className="pt-3">
        <ListSection title="Traitements habituels" items={dossier.traitements} render={(t) => `${t.dci}${t.dosage ? ` ${t.dosage}${t.dosage_unite ?? ""}` : ""}${t.voie_administration ? ` ${t.voie_administration}` : ""}`} onRemove={(idx) => onChange((d) => ({ ...d, traitements: d.traitements.filter((_, i) => i !== idx) }))} />
      </TabsContent>

      <TabsContent value="hospi" className="pt-3">
        <ListSection title="Prescriptions hospitalières" items={dossier.prescriptions_hospitalieres} render={(p) => `${p.medicament}${p.dosage ? ` ${p.dosage}` : ""}${p.posologie ? ` — ${p.posologie}` : ""}${p.voie_administration ? ` (${p.voie_administration})` : ""}`} onRemove={(idx) => onChange((d) => ({ ...d, prescriptions_hospitalieres: d.prescriptions_hospitalieres.filter((_, i) => i !== idx) }))} />
        <div className="text-xs text-muted-foreground mt-2">Si ≥ 1 ligne, un épisode sera créé automatiquement et la conciliation lancée.</div>
      </TabsContent>
    </Tabs>
  );
}

function ListSection<T>({ title, items, render, onRemove }: { title: string; items: T[]; render: (item: T) => string; onRemove: (idx: number) => void }) {
  return (
    <div>
      <div className="text-sm font-medium mb-1">{title} ({items.length})</div>
      {items.length === 0 ? (
        <div className="text-xs text-muted-foreground italic">Aucun</div>
      ) : (
        <div className="border rounded-md divide-y">
          {items.map((it, idx) => (
            <div key={idx} className="p-2 flex items-center gap-2 text-sm">
              <span className="flex-1">{render(it)}</span>
              <Button size="icon" variant="ghost" onClick={() => onRemove(idx)}><Trash2 className="h-3 w-3" /></Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
