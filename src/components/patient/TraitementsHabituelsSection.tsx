import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Trash2, Pill, Sunrise, Sun, Sunset, Moon, FileText, Clock, Stethoscope } from "lucide-react";
import { OrdonnanceUploader } from "@/components/conciliation/OrdonnanceUploader";
import { SourceDocumentLink } from "@/components/conciliation/SourceDocumentLink";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";


type Traitement = {
  id: string;
  dci: string | null;
  nom_commercial: string | null;
  dosage: string | null;
  dosage_unite: string | null;
  voie_administration: string | null;
  posologie_matin: string | null;
  posologie_midi: string | null;
  posologie_soir: string | null;
  posologie_coucher: string | null;
  posologie_texte: string | null;
  indication: string | null;
  duree: string | null;
  source: string | null;
  source_document_id: string | null;
};

const SOURCE_LABEL: Record<string, string> = {
  ordonnance: "Ordonnance",
  patient: "Patient",
  MT: "MT",
  pharmacie: "Pharmacie",
  autre: "Autre",
};

function PriseCell({ value, icon: Icon, label, shortLabel }: { value: string | null; icon: React.ComponentType<{ className?: string }>; label: string; shortLabel: string }) {
  const normalizedValue = value?.trim() ?? "";
  const active = normalizedValue !== "" && normalizedValue !== "0";
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            aria-label={`${label} : ${active ? normalizedValue : "aucune prise"}`}
            className={`flex h-12 w-12 flex-col items-center justify-center rounded-md border text-[11px] font-semibold transition-colors ${
              active
                ? "border-primary/50 bg-primary/10 text-primary shadow-sm"
                : "border-border bg-muted/30 text-muted-foreground/45"
            }`}
          >
            <span className="mb-0.5 flex items-center gap-0.5 text-[9px] uppercase leading-none text-current">
              <Icon className="h-4 w-4" />
              {shortLabel}
            </span>
            <span className="leading-none">{active ? normalizedValue : "—"}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function TraitementsHabituelsSection({ patientId }: { patientId: string }) {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["traitements", patientId],
    queryFn: async () =>
      ((
        await supabase
          .from("traitements_habituels")
          .select("*")
          .eq("patient_id", patientId)
          .order("created_at", { ascending: false })
      ).data ?? []) as Traitement[],
  });
  const { data: sources = [] } = useQuery({
    queryKey: ["documents_sources", patientId],
    queryFn: async () =>
      ((
        await supabase
          .from("documents_sources")
          .select("id, prescriber_name, prescriber_specialty, prescription_date, document_type, file_name")
          .eq("patient_id", patientId)
      ).data ?? []) as Array<{ id: string; prescriber_name: string | null; prescriber_specialty: string | null; prescription_date: string | null; document_type: string | null; file_name: string | null }>,
  });
  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("traitements_habituels").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["traitements", patientId] }),
  });

  // Indicateur BME : nb lignes, nb sources PDF distinctes, dernière mise à jour
  const sourceIds = new Set(data.map((t) => t.source_document_id).filter(Boolean) as string[]);
  const latestUpdate = data.reduce<string | null>((acc, t) => {
    const c = (t as unknown as { created_at?: string }).created_at;
    if (!c) return acc;
    return !acc || c > acc ? c : acc;
  }, null);
  const formattedDate = latestUpdate ? new Date(latestUpdate).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : null;

  return (
    <div className="space-y-3">
      <OrdonnanceUploader patientId={patientId} />

      {/* Indicateur de complétude du Bilan Médicamenteux d'Entrée (BME) */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="py-3 px-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <div className="flex items-center gap-2 font-medium">
            <Pill className="h-4 w-4 text-primary" />
            <span>Bilan médicamenteux d'entrée</span>
          </div>
          <Badge variant={data.length > 0 ? "default" : "secondary"} className="font-mono">
            {data.length} ligne{data.length > 1 ? "s" : ""}
          </Badge>
          <span className="flex items-center gap-1 text-muted-foreground">
            <FileText className="h-3.5 w-3.5" />
            {sourceIds.size} source{sourceIds.size > 1 ? "s" : ""} PDF
          </span>
          {formattedDate && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              MAJ {formattedDate}
            </span>
          )}
        </CardContent>
      </Card>




      {data.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            <Pill className="h-8 w-8 mx-auto mb-2 opacity-40" />
            Aucun traitement habituel renseigné
          </CardContent>
        </Card>
      ) : (() => {
        // Regroupement par prescripteur (via source_document_id → documents_sources)
        const sourceById = new Map(sources.map((s) => [s.id, s] as const));
        const UNKNOWN_KEY = "__unknown__";
        const groups = new Map<string, { label: string; specialty: string | null; date: string | null; sourceId: string | null; items: Traitement[] }>();
        for (const t of data) {
          const src = t.source_document_id ? sourceById.get(t.source_document_id) : null;
          const key = src?.prescriber_name?.trim() ? `${src.prescriber_name}|${src.prescription_date ?? ""}` : (t.source_document_id ?? UNKNOWN_KEY);
          const existing = groups.get(key) ?? {
            label: src?.prescriber_name?.trim() || (src?.file_name ?? "Prescripteur non identifié"),
            specialty: src?.prescriber_specialty ?? null,
            date: src?.prescription_date ?? null,
            sourceId: t.source_document_id ?? null,
            items: [] as Traitement[],
          };
          existing.items.push(t);
          groups.set(key, existing);
        }
        const groupList = Array.from(groups.entries()).sort(([, a], [, b]) => (b.date ?? "").localeCompare(a.date ?? ""));

        return (
          <Accordion type="multiple" defaultValue={groupList.map(([k]) => k)} className="space-y-2">
            {groupList.map(([key, g]) => (
              <AccordionItem key={key} value={key} className="border rounded-md bg-card">
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <div className="flex items-center gap-3 flex-wrap text-left">
                    <Stethoscope className="h-4 w-4 text-primary shrink-0" />
                    <span className="font-medium">{g.label}</span>
                    {g.specialty && <Badge variant="secondary" className="text-xs">{g.specialty}</Badge>}
                    {g.date && (
                      <span className="text-xs text-muted-foreground">
                        {new Date(g.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
                      </span>
                    )}
                    <Badge variant="outline" className="text-xs">{g.items.length} ligne{g.items.length > 1 ? "s" : ""}</Badge>
                    {g.sourceId && <SourceDocumentLink documentId={g.sourceId} label="PDF" />}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-0 pb-0">
                  <div className="divide-y">
                    {g.items.map((t) => (
                      <div
                        key={t.id}
                        className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-4 px-4 py-3 items-center hover:bg-muted/30 transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Pill className="h-4 w-4 text-primary shrink-0" />
                            <span className="font-medium truncate">{t.dci || t.nom_commercial}</span>
                            {t.dosage && (
                              <Badge variant="outline" className="font-mono text-xs">
                                {t.dosage}{t.dosage_unite ? ` ${t.dosage_unite}` : ""}
                              </Badge>
                            )}
                            {t.voie_administration && (
                              <Badge variant="secondary" className="text-xs">{t.voie_administration}</Badge>
                            )}
                          </div>
                          {t.dci && t.nom_commercial && t.dci !== t.nom_commercial && (
                            <div className="text-xs text-muted-foreground ml-6 mt-0.5">{t.nom_commercial}</div>
                          )}
                        </div>

                        <div className="flex gap-1 justify-start md:justify-center">
                          <PriseCell value={t.posologie_matin} icon={Sunrise} label="Matin" shortLabel="M" />
                          <PriseCell value={t.posologie_midi} icon={Sun} label="Midi" shortLabel="Mi" />
                          <PriseCell value={t.posologie_soir} icon={Sunset} label="Soir" shortLabel="S" />
                          <PriseCell value={t.posologie_coucher} icon={Moon} label="Coucher" shortLabel="Co" />
                        </div>

                        <div className="flex flex-col gap-1 text-xs min-w-[160px]">
                          {t.posologie_texte && (
                            <span className="text-foreground/80 italic">{t.posologie_texte}</span>
                          )}
                          {t.indication && <span className="text-foreground/80">{t.indication}</span>}
                          {t.duree && (
                            <span className="text-foreground/80">
                              <span className="font-medium">Durée :</span> {t.duree}
                            </span>
                          )}
                          {t.source && !t.source_document_id && (
                            <span className="text-muted-foreground">
                              Source : {SOURCE_LABEL[t.source] ?? t.source}
                            </span>
                          )}
                        </div>

                        <div className="flex justify-end">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => del.mutate(t.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        );
      })()}
    </div>
  );
}
