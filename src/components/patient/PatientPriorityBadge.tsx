import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Flame } from "lucide-react";
import {
  computePatientPriority,
  PRIORITY_COLORS,
  PRIORITY_LABEL,
} from "@/lib/conciliation/patientPriority";

export function usePatientPriority(patientId: string) {
  return useQuery({
    queryKey: ["patient-priority", patientId],
    queryFn: async () => {
      const [patient, comorb, allergies, traits] = await Promise.all([
        supabase.from("patients").select("date_naissance").eq("id", patientId).maybeSingle(),
        supabase.from("comorbidites").select("libelle").eq("patient_id", patientId).eq("statut", "actif"),
        supabase.from("allergies").select("severite").eq("patient_id", patientId),
        supabase.from("traitements_habituels").select("dci,nom_commercial").eq("patient_id", patientId).eq("actif", true),
      ]);
      const age = patient.data?.date_naissance
        ? Math.floor((Date.now() - new Date(patient.data.date_naissance).getTime()) / 31557600000)
        : null;
      const libs = (comorb.data ?? []).map((c) => c.libelle ?? "");
      const sev = (allergies.data ?? []).filter((a) => a.severite === "severe" || a.severite === "anaphylaxie").length;
      const dcis = (traits.data ?? []).map((t) => t.dci || t.nom_commercial || "").filter(Boolean);
      return computePatientPriority({
        age,
        nb_comorbidites: libs.length,
        comorbidites_libelles: libs,
        nb_allergies_severes: sev,
        traitements_dci: dcis,
      });
    },
  });
}

export function PatientPriorityBadge({ patientId, showScore = true }: { patientId: string; showScore?: boolean }) {
  const { data } = usePatientPriority(patientId);
  if (!data) return null;
  return (
    <Badge variant="outline" className={`gap-1 ${PRIORITY_COLORS[data.niveau]}`}>
      <Flame className="h-3 w-3" /> Priorité {PRIORITY_LABEL[data.niveau]}
      {showScore && ` · ${data.score}/100`}
    </Badge>
  );
}
