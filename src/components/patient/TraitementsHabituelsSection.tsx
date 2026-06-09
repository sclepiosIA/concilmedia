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
import { Trash2, Pill, Sun, CloudSun, Sunset, Moon, FileText, Clock } from "lucide-react";
import { toast } from "sonner";
import { OrdonnanceUploader } from "@/components/conciliation/OrdonnanceUploader";
import { SourceDocumentLink } from "@/components/conciliation/SourceDocumentLink";


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

function PriseCell({ value, icon: Icon, label }: { value: string | null; icon: React.ComponentType<{ className?: string }>; label: string }) {
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
      ) : (
        <Card>
          <CardContent className="p-0 divide-y">
            {/* En-tête */}
            <div className="hidden md:grid grid-cols-[1fr_auto_auto_auto] gap-4 px-4 py-2 text-[11px] uppercase tracking-wide text-muted-foreground bg-muted/40">
              <div>Médicament</div>
              <div className="text-center">M • Mi • S • Co</div>
              <div>Indication / Source</div>
              <div></div>
            </div>
            {data.map((t) => (
              <div
                key={t.id}
                className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-4 px-4 py-3 items-center hover:bg-muted/30 transition-colors"
              >
                {/* Médicament */}
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

                {/* Schéma de prise */}
                <div className="flex gap-1 justify-start md:justify-center">
                  <PriseCell value={t.posologie_matin} icon={Sun} label="Matin" />
                  <PriseCell value={t.posologie_midi} icon={CloudSun} label="Midi" />
                  <PriseCell value={t.posologie_soir} icon={Sunset} label="Soir" />
                  <PriseCell value={t.posologie_coucher} icon={Moon} label="Coucher" />
                </div>

                {/* Indication / durée / source */}
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
                  {t.source && (
                    <span className="text-muted-foreground">
                      Source : {SOURCE_LABEL[t.source] ?? t.source}
                    </span>
                  )}
                  {t.source_document_id && <SourceDocumentLink documentId={t.source_document_id} />}
                </div>

                {/* Actions */}
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
