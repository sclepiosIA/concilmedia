import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sparkles, Loader2, Download, AlertTriangle } from "lucide-react";
import { analyzePatientSynthesis } from "@/lib/conciliation/analyzePatientSynthesis.functions";
import { generatePatientSynthesisPdf } from "@/lib/conciliation/pdfExport.functions";
import type { AIAnalysisPayload } from "@/lib/conciliation/analyze.functions";
import { toast } from "sonner";

export function SynthesePatientDialog({ patientId, open, onOpenChange, autoAnalyze = false }: { patientId: string; open: boolean; onOpenChange: (v: boolean) => void; autoAnalyze?: boolean }) {
  const qc = useQueryClient();
  const analyzeFn = useServerFn(analyzePatientSynthesis);
  const pdfFn = useServerFn(generatePatientSynthesisPdf);

  const { data: patient } = useQuery({
    queryKey: ["patient", patientId],
    queryFn: async () => (await supabase.from("patients").select("*").eq("id", patientId).maybeSingle()).data,
  });
  const { data: ant = [] } = useQuery({ queryKey: ["antecedents", patientId], queryFn: async () => (await supabase.from("antecedents").select("*").eq("patient_id", patientId).eq("actif", true)).data ?? [] });
  const { data: com = [] } = useQuery({ queryKey: ["comorbidites", patientId], queryFn: async () => (await supabase.from("comorbidites").select("*").eq("patient_id", patientId).eq("statut", "actif")).data ?? [] });
  const { data: all = [] } = useQuery({ queryKey: ["allergies", patientId], queryFn: async () => (await supabase.from("allergies").select("*").eq("patient_id", patientId)).data ?? [] });
  const { data: trt = [] } = useQuery({ queryKey: ["traitements", patientId], queryFn: async () => (await supabase.from("traitements_habituels").select("*").eq("patient_id", patientId).eq("actif", true)).data ?? [] });
  const { data: bio = [] } = useQuery({
    queryKey: ["biologie", patientId],
    queryFn: async () => (await supabase.from("biologie_resultats").select("*").eq("patient_id", patientId).order("date_prelevement", { ascending: false, nullsFirst: false }).limit(50)).data ?? [],
  });
  const { data: analysis } = useQuery({
    queryKey: ["patient-synthesis-analysis", patientId],
    queryFn: async () => (await supabase.from("conciliation_ai_analyses").select("*").eq("patient_id", patientId).is("episode_id", null).order("created_at", { ascending: false }).limit(1).maybeSingle()).data,
  });

  const mut = useMutation({
    mutationFn: () => analyzeFn({ data: { patientId } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["patient-synthesis-analysis", patientId] }); toast.success("Analyse IA terminée"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur IA"),
  });

  const payload = analysis?.payload as unknown as AIAnalysisPayload | undefined;
  const bioLatest = new Map<string, typeof bio[number]>();
  for (const b of bio) { const k = b.parametre.toLowerCase(); if (!bioLatest.has(k)) bioLatest.set(k, b); }
  const allergiesSeveres = all.filter((a) => a.severite === "severe" || a.severite === "anaphylaxie");

  const downloadPdf = async () => {
    try {
      const r = await pdfFn({ data: { patientId } });
      const bin = atob(r.base64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([arr], { type: "application/pdf" }));
      const a = document.createElement("a"); a.href = url; a.download = r.filename; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur PDF"); }
  };

  if (!patient) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2 pr-8">
            <span>Fiche de synthèse patient</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => mut.mutate()} disabled={mut.isPending}>
                {mut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                {payload ? "Relancer l'analyse" : "Lancer l'analyse"}
              </Button>
              <Button size="sm" onClick={downloadPdf}><Download className="h-4 w-4 mr-1" /> PDF</Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-4 text-sm">
          <div className="border rounded p-3">
            <div className="font-bold text-base">{patient.nom?.toUpperCase()} {patient.prenom}</div>
            <div className="text-muted-foreground text-xs">
              {patient.date_naissance && new Date(patient.date_naissance).toLocaleDateString("fr-FR")}
              {patient.sexe && ` • ${patient.sexe}`}
              {patient.poids_kg && ` • ${patient.poids_kg} kg`}
              {patient.taille_cm && ` • ${patient.taille_cm} cm`}
            </div>
            {allergiesSeveres.length > 0 && (
              <div className="mt-2 flex gap-1 flex-wrap">
                {allergiesSeveres.map((a) => <Badge key={a.id} variant="destructive">⚠ {a.substance}</Badge>)}
              </div>
            )}
          </div>

          <Section title={`Antécédents (${ant.length})`}>
            {ant.map((a) => <div key={a.id} className="text-xs">• [{a.type}] {a.description}{a.date_evenement ? ` (${a.date_evenement})` : ""}</div>)}
            {ant.length === 0 && <div className="text-xs text-muted-foreground italic">Aucun</div>}
          </Section>

          <Section title={`Comorbidités (${com.length})`}>
            {com.map((c) => <div key={c.id} className="text-xs">• {c.libelle}</div>)}
            {com.length === 0 && <div className="text-xs text-muted-foreground italic">Aucune</div>}
          </Section>

          <Section title={`Allergies (${all.length})`}>
            {all.map((a) => <div key={a.id} className="text-xs">• {a.substance}{a.reaction ? ` → ${a.reaction}` : ""}{a.severite ? ` (${a.severite})` : ""}</div>)}
            {all.length === 0 && <div className="text-xs text-muted-foreground italic">Aucune</div>}
          </Section>

          <Section title={`Biologie récente (${bioLatest.size})`}>
            <div className="grid grid-cols-2 gap-1">
              {[...bioLatest.values()].map((b) => (
                <div key={b.id} className="text-xs border rounded px-2 py-1">
                  <strong>{b.parametre}</strong> {b.valeur ?? b.valeur_texte ?? "—"} {b.unite ?? ""}{" "}
                  <span className="text-muted-foreground">{b.date_prelevement ? `(${b.date_prelevement})` : ""}</span>
                </div>
              ))}
            </div>
            {bioLatest.size === 0 && <div className="text-xs text-muted-foreground italic">Aucune valeur</div>}
          </Section>

          <Section title={`Traitements habituels (${trt.length})`}>
            {trt.map((t) => (
              <div key={t.id} className="text-xs">
                • <strong>{t.dci}</strong> {t.dosage ?? ""}{t.dosage_unite ?? ""} {t.voie_administration ?? ""}
                {(t.posologie_matin || t.posologie_midi || t.posologie_soir || t.posologie_coucher) &&
                  ` — ${[t.posologie_matin, t.posologie_midi, t.posologie_soir, t.posologie_coucher].map((x) => x ?? "0").join("-")}`}
                {t.indication && <span className="text-muted-foreground"> ({t.indication})</span>}
              </div>
            ))}
            {trt.length === 0 && <div className="text-xs text-muted-foreground italic">Aucun</div>}
          </Section>

          {payload && (
            <div className="border rounded p-3 bg-muted/30">
              <div className="font-semibold flex items-center gap-2 mb-2"><Sparkles className="h-4 w-4 text-primary" /> Analyse pharmaceutique IA — Score {payload.score_risque}/100</div>
              <p className="text-xs mb-2">{payload.synthese}</p>
              {payload.interactions?.length > 0 && <AnalysisBlock title="Interactions" items={payload.interactions.map((i) => `${i.dci_1} ↔ ${i.dci_2} (${i.severite}) — ${i.recommandation}`)} />}
              {payload.contre_indications?.length > 0 && <AnalysisBlock title="Contre-indications" items={payload.contre_indications.map((c) => `${c.medicament} — ${c.raison} → ${c.recommandation}`)} />}
              {payload.doublons_therapeutiques?.length > 0 && <AnalysisBlock title="Doublons" items={payload.doublons_therapeutiques.map((d) => `${d.medicaments.join(" + ")} (${d.classe})`)} />}
              {payload.adaptations_posologiques?.length > 0 && <AnalysisBlock title="Adaptations posologiques" items={payload.adaptations_posologiques.map((a) => `${a.medicament} — ${a.raison} → ${a.recommandation}`)} />}
            </div>
          )}
          {!payload && (
            <div className="text-xs text-muted-foreground text-center py-3 border rounded border-dashed">
              <AlertTriangle className="h-4 w-4 inline mr-1" /> Aucune analyse IA — cliquez sur "Lancer l'analyse".
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-semibold text-xs uppercase text-muted-foreground mb-1">{title}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function AnalysisBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mt-2">
      <div className="text-xs font-medium">{title}</div>
      <ul className="text-xs list-disc list-inside">{items.map((it, i) => <li key={i}>{it}</li>)}</ul>
    </div>
  );
}
