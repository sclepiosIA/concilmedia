import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TraitementInfo {
  id: string;
  dci: string | null;
  nom_commercial: string | null;
  dosage: string | null;
  dosage_unite: string | null;
  voie_administration: string | null;
  posologie_texte: string | null;
}

export interface ComorbiditeInfo {
  id: string;
  libelle: string;
  code_cim10: string | null;
}

export interface AllergieInfo {
  id: string;
  substance: string;
  reaction: string | null;
  severite: string | null;
}

export interface AlerteInfo {
  id: string;
  gravite: string | null;
  type_divergence: string;
  intention: string;
  libelle: string;
}

export interface PatientQuickInfo {
  traitements: TraitementInfo[];
  comorbidites: ComorbiditeInfo[];
  allergies: AllergieInfo[];
  alertes: AlerteInfo[];
}

const GRAVITE_RANK: Record<string, number> = {
  critique: 4,
  majeur: 3,
  modere: 2,
  mineur: 1,
};

export function usePatientsQuickInfo(patientIds: string[]) {
  const key = [...patientIds].sort().join(",");
  return useQuery({
    queryKey: ["patients-quick-info", key],
    enabled: patientIds.length > 0,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    placeholderData: keepPreviousData,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async (): Promise<Record<string, PatientQuickInfo>> => {
      const [traitRes, comoRes, allergRes, divsRes] = await Promise.all([
        supabase
          .from("traitements_habituels")
          .select("id, patient_id, dci, nom_commercial, dosage, dosage_unite, voie_administration, posologie_texte, actif")
          .in("patient_id", patientIds)
          .eq("actif", true),
        supabase
          .from("comorbidites")
          .select("id, patient_id, libelle, code_cim10, statut")
          .in("patient_id", patientIds)
          .eq("statut", "actif"),
        supabase
          .from("allergies")
          .select("id, patient_id, substance, reaction, severite")
          .in("patient_id", patientIds),
        supabase
          .from("conciliation_medicaments")
          .select("id, patient_id, gravite, statut, intention, type_divergence, medication_domicile, medication_hospitalisation")
          .in("patient_id", patientIds),
      ]);

      const result: Record<string, PatientQuickInfo> = {};
      for (const pid of patientIds) {
        result[pid] = { traitements: [], comorbidites: [], allergies: [], alertes: [] };
      }

      for (const t of traitRes.data ?? []) {
        const bag = result[t.patient_id];
        if (bag) bag.traitements.push(t as TraitementInfo);
      }
      for (const c of comoRes.data ?? []) {
        const bag = result[c.patient_id];
        if (bag) bag.comorbidites.push(c as ComorbiditeInfo);
      }
      for (const a of allergRes.data ?? []) {
        const bag = result[a.patient_id];
        if (bag) bag.allergies.push(a as AllergieInfo);
      }

      for (const d of divsRes.data ?? []) {
        if (d.statut === "resolu" || d.statut === "non_applicable") continue;
        const bag = result[d.patient_id];
        if (!bag) continue;
        const medDom = d.medication_domicile as { dci?: string; nom_commercial?: string } | null;
        const medHosp = d.medication_hospitalisation as { dci?: string; nom_commercial?: string } | null;
        const label =
          medDom?.dci ?? medDom?.nom_commercial ??
          medHosp?.dci ?? medHosp?.nom_commercial ??
          d.type_divergence;
        bag.alertes.push({
          id: d.id,
          gravite: d.gravite,
          type_divergence: d.type_divergence,
          intention: d.intention,
          libelle: label ?? d.type_divergence,
        });
      }

      // Sort alerts by severity desc
      for (const pid of patientIds) {
        result[pid].alertes.sort((a, b) =>
          (GRAVITE_RANK[b.gravite ?? ""] ?? 0) - (GRAVITE_RANK[a.gravite ?? ""] ?? 0),
        );
      }

      return result;
    },
  });
}
