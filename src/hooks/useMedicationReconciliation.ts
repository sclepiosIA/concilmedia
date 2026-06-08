import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface MedicationConciliation {
  id: string;
  episode_id: string;
  patient_id: string;
  phase: "entree" | "sortie";
  medication_domicile: {
    dci: string;
    dosage?: string;
    posologie?: string;
    voie?: string;
    indication?: string;
    source?: string;
  };
  medication_hospitalisation: {
    dci?: string;
    dosage?: string;
    posologie?: string;
    prescription_id?: string;
  } | null;
  type_divergence: "omission" | "ajout" | "modification_dose" | "modification_freq" | "duplication" | "aucune";
  intention: "intentionnel" | "non_intentionnel" | "a_evaluer";
  justification: string | null;
  action_corrective: string | null;
  statut: "non_traite" | "en_cours" | "resolu" | "non_applicable";
  pharmacien_id: string | null;
  date_analyse: string | null;
  date_validation: string | null;
  created_at: string;
}

export function useMedicationReconciliation(episodeId: string) {
  const queryClient = useQueryClient();
  const key = ["conciliation", episodeId];

  const { data: conciliations = [], isLoading, refetch } = useQuery({
    queryKey: key,
    queryFn: async () => {
      if (!episodeId) return [];
      const { data, error } = await supabase
        .from("conciliation_medicaments")
        .select("*")
        .eq("episode_id", episodeId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as MedicationConciliation[];
    },
    enabled: !!episodeId,
  });

  const addConciliation = useMutation({
    mutationFn: async (item: Omit<MedicationConciliation, "id" | "created_at">) => {
      const { error } = await supabase.from("conciliation_medicaments").insert(item as never);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  const updateConciliation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<MedicationConciliation> & { id: string }) => {
      const { error } = await supabase.from("conciliation_medicaments").update(updates as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key });
      toast.success("Ligne mise à jour");
    },
  });

  const validateConciliation = useMutation({
    mutationFn: async (id: string) => {
      const { data: user } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("conciliation_medicaments")
        .update({
          statut: "resolu",
          pharmacien_id: user.user?.id,
          date_validation: new Date().toISOString(),
        } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key });
      toast.success("Divergence validée");
    },
  });

  const detectDivergences = useMutation({
    mutationFn: async () => {
      const { data: episode } = await supabase
        .from("episodes")
        .select("patient_id")
        .eq("id", episodeId)
        .maybeSingle();
      if (!episode) throw new Error("Épisode introuvable");

      const [{ data: traitements }, { data: prescriptions }, { data: existing }] = await Promise.all([
        supabase.from("traitements_habituels").select("*").eq("patient_id", episode.patient_id).eq("actif", true),
        supabase.from("prescriptions_hospitalieres").select("*").eq("episode_id", episodeId).eq("actif", true),
        supabase.from("conciliation_medicaments").select("medication_domicile").eq("episode_id", episodeId),
      ]);

      const existingDci = new Set(
        (existing ?? [])
          .map((c) => (c.medication_domicile as { dci?: string } | null)?.dci?.toLowerCase())
          .filter(Boolean),
      );

      const buildPosologie = (t: NonNullable<typeof traitements>[number]) => {
        const parts: string[] = [];
        if (t.posologie_matin) parts.push(`${t.posologie_matin} matin`);
        if (t.posologie_midi) parts.push(`${t.posologie_midi} midi`);
        if (t.posologie_soir) parts.push(`${t.posologie_soir} soir`);
        if (t.posologie_coucher) parts.push(`${t.posologie_coucher} coucher`);
        return parts.length ? parts.join(", ") : undefined;
      };

      const divergences: Array<Omit<MedicationConciliation, "id" | "created_at">> = [];
      for (const t of traitements ?? []) {
        const dci = (t.dci || t.nom_commercial || "").toLowerCase();
        if (!dci || existingDci.has(dci)) continue;
        const match = (prescriptions ?? []).find(
          (p) =>
            p.medicament?.toLowerCase().includes(dci) || dci.includes(p.medicament?.toLowerCase() ?? ""),
        );
        const domicile = {
          dci: t.dci || t.nom_commercial || "Inconnu",
          dosage: t.dosage ? `${t.dosage} ${t.dosage_unite ?? ""}`.trim() : undefined,
          posologie: buildPosologie(t),
          voie: t.voie_administration ?? undefined,
          indication: t.indication ?? undefined,
          source: t.source ?? undefined,
        };
        if (!match) {
          divergences.push({
            episode_id: episodeId,
            patient_id: episode.patient_id,
            phase: "entree",
            medication_domicile: domicile,
            medication_hospitalisation: null,
            type_divergence: "omission",
            intention: "a_evaluer",
            justification: null,
            action_corrective: null,
            statut: "non_traite",
            pharmacien_id: null,
            date_analyse: new Date().toISOString(),
            date_validation: null,
          });
        } else if (t.dosage && match.dosage && t.dosage !== match.dosage) {
          divergences.push({
            episode_id: episodeId,
            patient_id: episode.patient_id,
            phase: "entree",
            medication_domicile: domicile,
            medication_hospitalisation: {
              dci: match.medicament,
              dosage: match.dosage ?? undefined,
              posologie: match.posologie ?? undefined,
              prescription_id: match.id,
            },
            type_divergence: "modification_dose",
            intention: "a_evaluer",
            justification: null,
            action_corrective: null,
            statut: "non_traite",
            pharmacien_id: null,
            date_analyse: new Date().toISOString(),
            date_validation: null,
          });
        }
      }

      if (divergences.length) {
        const { error } = await supabase.from("conciliation_medicaments").insert(divergences as never);
        if (error) throw error;
      }
      return divergences.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: key });
      if (count > 0) toast.info(`${count} divergence(s) détectée(s)`);
      else toast.success("Aucune nouvelle divergence");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  const stats = {
    total: conciliations.length,
    nonTraite: conciliations.filter((c) => c.statut === "non_traite").length,
    enCours: conciliations.filter((c) => c.statut === "en_cours").length,
    resolu: conciliations.filter((c) => c.statut === "resolu").length,
    omissions: conciliations.filter((c) => c.type_divergence === "omission").length,
    modifications: conciliations.filter((c) => c.type_divergence.startsWith("modification")).length,
  };

  return {
    conciliations,
    isLoading,
    stats,
    refetch,
    addConciliation: addConciliation.mutate,
    updateConciliation: updateConciliation.mutate,
    validateConciliation: validateConciliation.mutate,
    detectDivergences: detectDivergences.mutate,
    isDetecting: detectDivergences.isPending,
  };
}
