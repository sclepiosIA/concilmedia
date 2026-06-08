import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Home } from "lucide-react";

export function TraitementsDomicileColumn({ patientId }: { patientId: string }) {
  const { data = [] } = useQuery({
    queryKey: ["traitements", patientId],
    queryFn: async () => (await supabase.from("traitements_habituels").select("*").eq("patient_id", patientId).eq("actif", true)).data ?? [],
  });
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Home className="h-4 w-4" /> Traitement domicile ({data.length})</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {data.length === 0 && <p className="text-xs text-muted-foreground">Aucun traitement habituel</p>}
        {data.map((t) => (
          <div key={t.id} className="border rounded-md p-2">
            <div className="font-medium text-sm">{t.dci || t.nom_commercial}</div>
            <div className="flex gap-1 flex-wrap mt-1">
              {t.dosage && <Badge variant="outline" className="text-xs">{t.dosage} {t.dosage_unite}</Badge>}
              {t.voie_administration && <Badge variant="secondary" className="text-xs">{t.voie_administration}</Badge>}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {[t.posologie_matin && `${t.posologie_matin} M`, t.posologie_midi && `${t.posologie_midi} Mi`, t.posologie_soir && `${t.posologie_soir} S`, t.posologie_coucher && `${t.posologie_coucher} C`].filter(Boolean).join(" / ")}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
