import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Lightbulb } from "lucide-react";
import { ComplexityBadge } from "@/components/patient/ClinicalProfileCard";
import { computeComplexity, generateRecommendations } from "@/lib/clinical/complexityScore";
import type { MedicationConciliation } from "@/hooks/useMedicationReconciliation";

export function ClinicalRecommendationsCard({
  patientId,
  conciliations,
}: {
  patientId: string;
  conciliations: MedicationConciliation[];
}) {
  const { data: comorbidites = [] } = useQuery({
    queryKey: ["comorbidites", patientId],
    queryFn: async () =>
      (await supabase.from("comorbidites").select("*").eq("patient_id", patientId).eq("statut", "actif")).data ?? [],
  });

  const labels = comorbidites.map((c) => c.libelle);
  const complexity = computeComplexity(labels);
  const recs = generateRecommendations({
    comorbidities: labels,
    divergences: conciliations.map((c) => ({
      dci: c.medication_domicile?.dci ?? "",
      classe: c.classe_atc ?? undefined,
      type: c.type_divergence,
    })),
  });

  return (
    <Card>
      <CardContent className="py-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 font-medium text-sm">
            <Lightbulb className="h-4 w-4 text-primary" /> Recommandations cliniques
          </div>
          {labels.length > 0 && <ComplexityBadge score={complexity.score} niveau={complexity.niveau} />}
        </div>
        {recs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune recommandation spécifique pour l'instant.</p>
        ) : (
          <ul className="text-sm list-disc pl-5 space-y-1">
            {recs.map((r) => <li key={r}>{r}</li>)}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
