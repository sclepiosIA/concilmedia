import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Activity } from "lucide-react";
import { computeComplexity, generateClinicalProfile, COMPLEXITY_LABEL, type ComplexityLevel } from "@/lib/clinical/complexityScore";

const TONE: Record<ComplexityLevel, string> = {
  faible: "bg-green-100 text-green-800 border-green-200",
  modere: "bg-amber-100 text-amber-800 border-amber-200",
  eleve: "bg-red-100 text-red-800 border-red-200",
};

export function ComplexityBadge({ score, niveau }: { score: number; niveau: ComplexityLevel }) {
  return (
    <Badge variant="outline" className={`gap-1 ${TONE[niveau]}`}>
      <Activity className="h-3 w-3" /> Complexité {COMPLEXITY_LABEL[niveau]} · {score} pts
    </Badge>
  );
}

export function ClinicalProfileCard({ patientId }: { patientId: string }) {
  const { data: comorbidites = [] } = useQuery({
    queryKey: ["comorbidites", patientId],
    queryFn: async () =>
      (await supabase.from("comorbidites").select("*").eq("patient_id", patientId).eq("statut", "actif")).data ?? [],
  });

  const labels = comorbidites.map((c) => c.libelle);
  const complexity = computeComplexity(labels);
  const { vigilance } = generateClinicalProfile(labels);

  if (labels.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-4 text-sm text-muted-foreground">
          Ajoutez des comorbidités pour générer le profil clinique IA et le score de complexité.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="py-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 font-medium text-sm">
            <Sparkles className="h-4 w-4 text-primary" /> Profil clinique IA
          </div>
          <ComplexityBadge score={complexity.score} niveau={complexity.niveau} />
        </div>

        <div className="flex gap-1 flex-wrap">
          {labels.map((l) => (
            <Badge key={l} variant="secondary">{l}</Badge>
          ))}
        </div>

        

        {vigilance.length > 0 && (
          <div className="rounded-md bg-amber-50 border border-amber-200 p-3 space-y-1">
            <div className="text-xs font-semibold text-amber-900 uppercase tracking-wide">Facteurs de vigilance</div>
            <ul className="text-sm text-amber-900 list-disc pl-5 space-y-0.5">
              {vigilance.map((v) => <li key={v}>{v}</li>)}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
