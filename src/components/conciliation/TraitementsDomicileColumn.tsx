import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Home, Pill, Sun, CloudSun, Sunset, Moon, Trash2 } from "lucide-react";
import { OrdonnanceUploader } from "@/components/conciliation/OrdonnanceUploader";

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
  indication: string | null;
  source: string | null;
};

const SOURCE_LABEL: Record<string, string> = {
  ordonnance: "Ordonnance",
  patient: "Patient",
  MT: "MT",
  pharmacie: "Pharmacie",
  autre: "Autre",
};

function PriseCell({
  value,
  icon: Icon,
  label,
}: {
  value: string | null;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
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

export function TraitementsDomicileColumn({ patientId }: { patientId: string }) {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["traitements", patientId],
    queryFn: async () =>
      ((
        await supabase
          .from("traitements_habituels")
          .select("*")
          .eq("patient_id", patientId)
          .eq("actif", true)
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

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Home className="h-4 w-4" /> Traitement domicile ({data.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <OrdonnanceUploader patientId={patientId} />
        {data.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <Pill className="h-8 w-8 mx-auto mb-2 opacity-40" />
            Aucun traitement habituel
          </div>
        ) : (
          <div className="divide-y">
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
                  <PriseCell value={t.posologie_matin} icon={Sun} label="Matin" />
                  <PriseCell value={t.posologie_midi} icon={CloudSun} label="Midi" />
                  <PriseCell value={t.posologie_soir} icon={Sunset} label="Soir" />
                  <PriseCell value={t.posologie_coucher} icon={Moon} label="Coucher" />
                </div>

                <div className="flex flex-col gap-1 text-xs min-w-[140px]">
                  {t.indication && <span className="text-foreground/80">{t.indication}</span>}
                  {t.source && (
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
        )}
      </CardContent>
    </Card>
  );
}
