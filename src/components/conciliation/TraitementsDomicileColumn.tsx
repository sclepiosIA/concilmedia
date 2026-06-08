import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Home } from "lucide-react";
import { accentForDci } from "./medAccent";

export function TraitementsDomicileColumn({ patientId }: { patientId: string }) {
  const { data = [] } = useQuery({
    queryKey: ["traitements", patientId],
    queryFn: async () =>
      (await supabase.from("traitements_habituels").select("*").eq("patient_id", patientId).eq("actif", true)).data ?? [],
  });
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Home className="h-4 w-4" /> Traitement domicile ({data.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {data.length === 0 && <p className="text-xs text-muted-foreground">Aucun traitement habituel</p>}
        {data.map((t) => {
          const name = t.dci || t.nom_commercial || "—";
          const accent = accentForDci(name);
          const posology = [
            t.posologie_matin && `${t.posologie_matin}-M`,
            t.posologie_midi && `${t.posologie_midi}-Mi`,
            t.posologie_soir && `${t.posologie_soir}-S`,
            t.posologie_coucher && `${t.posologie_coucher}-C`,
          ]
            .filter(Boolean)
            .join(" / ");
          return (
            <div
              key={t.id}
              className="border rounded-md pl-2.5 pr-2 py-1.5 border-l-[3px] bg-card hover:bg-accent/30 transition-colors"
              style={{ borderLeftColor: accent }}
            >
              <div className="flex items-baseline justify-between gap-2">
                <div className="font-semibold text-sm leading-tight truncate">{name}</div>
                {t.dosage && (
                  <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-muted whitespace-nowrap">
                    {t.dosage}
                    {t.dosage_unite ? ` ${t.dosage_unite}` : ""}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                {t.voie_administration && <span className="uppercase tracking-wide">{t.voie_administration}</span>}
                {posology && <span className="font-mono">{posology}</span>}
              </div>
              {t.indication && (
                <div className="text-[11px] text-muted-foreground/80 italic mt-0.5 truncate">{t.indication}</div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
