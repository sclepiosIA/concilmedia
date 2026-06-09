import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
// tabs removed
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, FilePlus2, FileText, Upload } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { TraitementsHabituelsSection } from "@/components/patient/TraitementsHabituelsSection";
import { EpisodesSection } from "@/components/patient/EpisodesSection";
import { BiologieSection } from "@/components/patient/BiologieSection";
import { BulkPatientImportModal } from "@/components/conciliation/BulkPatientImportModal";
import { SynthesePatientDialog } from "@/components/patient/SynthesePatientDialog";
import { ClinicalProfileCard } from "@/components/patient/ClinicalProfileCard";
import { MedicationProfileCard } from "@/components/patient/MedicationProfileCard";
import { analyzeLettreAdmission } from "@/lib/conciliation/extractLettreAdmission.functions";

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
  const fileInputRef = useRef<HTMLInputElement>(null);


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

  const { data: lettreAdmission } = useQuery({
    queryKey: ["lettre-admission", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents_sources")
        .select("*")
        .eq("patient_id", patientId)
        .eq("document_type", "lettre_admission")
        .order("created_at", { ascending: false })
        .maybeSingle();
      if (error) throw error;
      return data;
    },
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

  const uploadLettre = useMutation({
    mutationFn: async (file: File) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");

      const safeName = file.name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9._-]/g, "_");
      const fileName = `${Date.now()}_${safeName}`;
      const storagePath = `${user.id}/${patientId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("ordonnances")
        .upload(storagePath, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase.from("documents_sources").insert({
        patient_id: patientId,
        storage_path: storagePath,
        file_name: file.name,
        mime_type: file.type,
        file_size: file.size,
        document_type: "lettre_admission",
        uploaded_by: user.id,
      });
      if (dbError) throw dbError;

      // Analyse IA → remplissage automatique du profil
      const fileBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1] ?? "");
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const analysis = await analyzeLettreAdmission({
        data: { patientId, fileBase64, mimeType: file.type || "application/pdf" },
      });

      return { storagePath, analysis };
    },
    onSuccess: ({ analysis }) => {
      qc.invalidateQueries({ queryKey: ["lettre-admission", patientId] });
      qc.invalidateQueries({ queryKey: ["patient", patientId] });
      qc.invalidateQueries({ queryKey: ["allergies", patientId] });
      qc.invalidateQueries({ queryKey: ["antecedents", patientId] });
      qc.invalidateQueries({ queryKey: ["comorbidites", patientId] });
      const parts: string[] = [];
      if (analysis.patient_updated) parts.push("profil mis à jour");
      if (analysis.allergies_inserted) parts.push(`${analysis.allergies_inserted} allergie(s)`);
      if (analysis.antecedents_inserted) parts.push(`${analysis.antecedents_inserted} antécédent(s)`);
      if (analysis.comorbidites_inserted) parts.push(`${analysis.comorbidites_inserted} comorbidité(s)`);
      toast.success(
        parts.length
          ? `Lettre analysée : ${parts.join(", ")}`
          : "Lettre importée (aucune nouvelle donnée extraite)"
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    onError: (err) => {
      toast.error("Erreur lors de l'import : " + (err as Error).message);
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
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{patient.nom.toUpperCase()} {patient.prenom}</h1>
              <Button
                variant={lettreAdmission ? "secondary" : "outline"}
                size="sm"
                className="h-8 gap-2"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadLettre.isPending}
                title={lettreAdmission ? "Remplacer la lettre d'admission" : "Importer une lettre d'admission"}
              >
                <Upload className="h-4 w-4" />
                <span>{uploadLettre.isPending ? "Analyse en cours…" : `Lettre d'admission${lettreAdmission ? " ✓" : ""}`}</span>
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadLettre.mutate(file);
                }}
              />
              {lettreAdmission && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1 text-xs"
                  onClick={() => reanalyze.mutate()}
                  disabled={reanalyze.isPending || uploadLettre.isPending}
                  title="Relancer l'analyse IA sur la lettre déjà importée"
                >
                  {reanalyze.isPending ? "Analyse…" : "🔄 Analyser"}
                </Button>
              )}
            </div>
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
            <Button variant="outline" onClick={() => setSyntheseOpen(true)}>
              <FileText className="h-4 w-4 mr-1" /> Synthèse patient
            </Button>
            <Button onClick={() => setBulkOpen(true)}>
              <FilePlus2 className="h-4 w-4 mr-1" /> Nouvelle conciliation
            </Button>
          </div>
        </CardContent>
      </Card>

      <BulkPatientImportModal open={bulkOpen} onOpenChange={setBulkOpen} targetPatientId={patientId} />
      <SynthesePatientDialog patientId={patientId} open={syntheseOpen} onOpenChange={setSyntheseOpen} />

      <div className="space-y-6">
        <ClinicalProfileCard patientId={patientId} />
        
        <section>
          <h2 className="text-lg font-semibold mb-3">Traitements</h2>
          <div className="mb-3"><MedicationProfileCard patientId={patientId} /></div>
          <TraitementsHabituelsSection patientId={patientId} />
        </section>
        <section><h2 className="text-lg font-semibold mb-3">Biologie</h2><BiologieSection patientId={patientId} /></section>
      </div>
    </div>
  );
}

// Suppress unused warning for CardHeader/CardTitle in some builds
void CardHeader; void CardTitle;
