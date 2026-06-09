import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Hospital, Plus } from "lucide-react";
import { toast } from "sonner";
import { PrescriptionsHospitalieresColumn } from "@/components/conciliation/PrescriptionsHospitalieresColumn";

export function PrescriptionsHospitalieresSection({ patientId }: { patientId: string }) {
  const qc = useQueryClient();

  const { data: episode, isLoading } = useQuery({
    queryKey: ["latest-episode", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("episodes")
        .select("id")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const createEpisode = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("episodes")
        .insert({ patient_id: patientId, motif: "Prescriptions hospitalières", service: "Médecine" })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["latest-episode", patientId] });
      qc.invalidateQueries({ queryKey: ["episodes", patientId] });
      toast.success("Épisode créé");
    },
    onError: (e) => toast.error("Erreur : " + (e as Error).message),
  });

  if (isLoading) return null;

  if (!episode) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground space-y-3">
          <Hospital className="h-8 w-8 mx-auto opacity-40" />
          <div>Aucun épisode actif pour ce patient.</div>
          <Button size="sm" onClick={() => createEpisode.mutate()} disabled={createEpisode.isPending}>
            <Plus className="h-4 w-4 mr-1" />
            {createEpisode.isPending ? "Création…" : "Créer un épisode pour ajouter des prescriptions"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return <PrescriptionsHospitalieresColumn episodeId={episode.id} patientId={patientId} />;
}
