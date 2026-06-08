import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
// tabs removed
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, FilePlus2, Sparkles, FileText } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { AntecedentsSection } from "@/components/patient/AntecedentsSection";
import { AllergiesSection } from "@/components/patient/AllergiesSection";
import { ComorbiditesSection } from "@/components/patient/ComorbiditesSection";
import { TraitementsHabituelsSection } from "@/components/patient/TraitementsHabituelsSection";
import { EpisodesSection } from "@/components/patient/EpisodesSection";
import { BiologieSection } from "@/components/patient/BiologieSection";
import { BulkPatientImportModal } from "@/components/conciliation/BulkPatientImportModal";
import { SynthesePatientDialog } from "@/components/patient/SynthesePatientDialog";
import { ClinicalProfileCard } from "@/components/patient/ClinicalProfileCard";
import { MedicationProfileCard } from "@/components/patient/MedicationProfileCard";

export const Route = createFileRoute("/_authenticated/patients/$patientId")({
  head: () => ({ meta: [{ title: "Fiche patient" }] }),
  component: PatientDetailPage,
});

function PatientDetailPage() {
  const { patientId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [bulkOpen, setBulkOpen] = useState(false);
  const [syntheseOpen, setSyntheseOpen] = useState(false);


  const { data: patient } = useQuery({
    queryKey: ["patient", patientId],
    queryFn: async () => {
      const { data, error } = await supabase.from("patients").select("*").eq("id", patientId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: allergies = [] } = useQuery({
    queryKey: ["allergies", patientId],
    queryFn: async () => (await supabase.from("allergies").select("*").eq("patient_id", patientId)).data ?? [],
  });

  const createEpisode = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("episodes")
        .insert({ patient_id: patientId, motif: "Nouvel épisode", service: "Médecine" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (ep) => {
      qc.invalidateQueries({ queryKey: ["episodes", patientId] });
      toast.success("Épisode créé");
      navigate({ to: "/episodes/$episodeId", params: { episodeId: ep.id } });
    },
  });

  if (!patient) return <div className="container py-8">Chargement…</div>;

  const age = patient.date_naissance
    ? Math.floor((Date.now() - new Date(patient.date_naissance).getTime()) / 31557600000)
    : null;
  const allergiesSeveres = allergies.filter((a) => a.severite === "severe" || a.severite === "anaphylaxie");

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl">
      <Link to="/patients" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-3">
        <ChevronLeft className="h-4 w-4" /> Retour
      </Link>

      <Card className="mb-6">
        <CardContent className="py-5 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">{patient.nom.toUpperCase()} {patient.prenom}</h1>
            <div className="text-sm text-muted-foreground mt-1">
              {patient.date_naissance && `${format(new Date(patient.date_naissance), "d MMMM yyyy", { locale: fr })}`}
              {age !== null && ` • ${age} ans`}
              {patient.sexe && ` • ${patient.sexe}`}
              {patient.poids_kg && ` • ${patient.poids_kg} kg`}
              {patient.taille_cm && ` • ${patient.taille_cm} cm`}
            </div>
            {allergiesSeveres.length > 0 && (
              <div className="mt-2 flex gap-1 flex-wrap">
                {allergiesSeveres.map((a) => (
                  <Badge key={a.id} variant="destructive">⚠ {a.substance}</Badge>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setBulkOpen(true)}>
              <Sparkles className="h-4 w-4 mr-1" /> Importer PDF (IA)
            </Button>
            <Button variant="outline" onClick={() => setSyntheseOpen(true)}>
              <FileText className="h-4 w-4 mr-1" /> Synthèse patient
            </Button>
            <Button onClick={() => createEpisode.mutate()} disabled={createEpisode.isPending}>
              <FilePlus2 className="h-4 w-4 mr-1" /> Nouvel épisode
            </Button>
          </div>
        </CardContent>
      </Card>

      <BulkPatientImportModal open={bulkOpen} onOpenChange={setBulkOpen} targetPatientId={patientId} />
      <SynthesePatientDialog patientId={patientId} open={syntheseOpen} onOpenChange={setSyntheseOpen} />

      <div className="mb-6">
        <ClinicalProfileCard patientId={patientId} />
      </div>

      <div className="space-y-6">
        <section><h2 className="text-lg font-semibold mb-3">Antécédents</h2><AntecedentsSection patientId={patientId} /></section>
        <section>
          <h2 className="text-lg font-semibold mb-3">Traitements</h2>
          <div className="mb-3"><MedicationProfileCard patientId={patientId} /></div>
          <TraitementsHabituelsSection patientId={patientId} />
        </section>
        <section><h2 className="text-lg font-semibold mb-3">Biologie</h2><BiologieSection patientId={patientId} /></section>
        <section><h2 className="text-lg font-semibold mb-3">Épisodes</h2><EpisodesSection patientId={patientId} /></section>
      </div>
    </div>
  );
}

// Suppress unused warning for CardHeader/CardTitle in some builds
void CardHeader; void CardTitle;
