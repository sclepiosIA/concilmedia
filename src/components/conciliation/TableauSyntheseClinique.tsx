import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Sparkles, AlertTriangle, CheckCircle2, ClipboardList } from "lucide-react";
import { computeComplexity, generateClinicalProfile } from "@/lib/clinical/complexityScore";
import type { AIAnalysisPayload } from "@/lib/conciliation/analyze.functions";

type Level = "ok" | "warn" | "alert";

const LEVEL_BG: Record<Level, string> = {
  ok: "bg-emerald-50/60 hover:bg-emerald-100/60",
  warn: "bg-amber-50/60 hover:bg-amber-100/60",
  alert: "bg-red-50/60 hover:bg-red-100/60",
};
const LEVEL_BORDER: Record<Level, string> = {
  ok: "border-emerald-200",
  warn: "border-amber-200",
  alert: "border-red-200",
};
const LEVEL_TEXT: Record<Level, string> = {
  ok: "text-emerald-700",
  warn: "text-amber-700",
  alert: "text-red-700",
};
const LEVEL_BADGE: Record<Level, { variant: "default" | "secondary" | "destructive" | "outline"; className: string; label: string }> = {
  ok: { variant: "default", className: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200", label: "Faible" },
  warn: { variant: "default", className: "bg-amber-100 text-amber-700 hover:bg-amber-100 border-amber-200", label: "Modéré" },
  alert: { variant: "destructive", className: "bg-red-100 text-red-700 hover:bg-red-100 border-red-200", label: "Élevé" },
};

function LevelBadge({ level }: { level: Level }) {
  const cfg = LEVEL_BADGE[level];
  return (
    <Badge variant={cfg.variant} className={`text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </Badge>
  );
}

export function TableauSyntheseClinique({ episodeId, patientId }: { episodeId: string; patientId: string }) {
  const { data: patient } = useQuery({
    queryKey: ["patient", patientId],
    queryFn: async () => (await supabase.from("patients").select("*").eq("id", patientId).maybeSingle()).data,
  });
  const { data: comorbidites = [] } = useQuery({
    queryKey: ["comorbidites", patientId],
    queryFn: async () => (await supabase.from("comorbidites").select("*").eq("patient_id", patientId).eq("statut", "actif")).data ?? [],
  });
  const { data: allergies = [] } = useQuery({
    queryKey: ["allergies", patientId],
    queryFn: async () => (await supabase.from("allergies").select("*").eq("patient_id", patientId)).data ?? [],
  });
  const { data: traitements = [] } = useQuery({
    queryKey: ["traitements", patientId],
    queryFn: async () => (await supabase.from("traitements_habituels").select("id").eq("patient_id", patientId).eq("actif", true)).data ?? [],
  });
  const { data: divergences = [] } = useQuery({
    queryKey: ["conciliation", episodeId],
    queryFn: async () => (await supabase.from("conciliation_medicaments").select("id, statut").eq("episode_id", episodeId)).data ?? [],
  });
  const { data: risk } = useQuery({
    queryKey: ["risk_score", episodeId],
    queryFn: async () => (await supabase.from("risk_scores").select("*").eq("episode_id", episodeId).order("created_at", { ascending: false }).limit(1).maybeSingle()).data,
  });
  const { data: aiAnalysis } = useQuery({
    queryKey: ["episode-ai-analysis", episodeId],
    queryFn: async () => (await supabase.from("conciliation_ai_analyses").select("payload").eq("episode_id", episodeId).order("created_at", { ascending: false }).limit(1).maybeSingle()).data,
  });

  if (!patient) return null;

  const age = patient.date_naissance
    ? Math.floor((Date.now() - new Date(patient.date_naissance).getTime()) / 31557600000)
    : null;
  const imc = patient.poids_kg && patient.taille_cm
    ? patient.poids_kg / Math.pow(patient.taille_cm / 100, 2)
    : null;
  const imcClasse = imc
    ? imc >= 40 ? "Obésité morbide"
    : imc >= 35 ? "Obésité classe II"
    : imc >= 30 ? "Obésité classe I"
    : imc >= 25 ? "Surpoids"
    : imc >= 18.5 ? "Normal"
    : "Maigreur"
    : null;

  const comorbLabels = comorbidites.map((c) => c.libelle);
  const complexity = computeComplexity(comorbLabels);
  const has = (kw: string) => comorbLabels.some((l) => l.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(kw));
  const hasHTA = has("hypertension") || has("hta");
  const hasDT2 = has("diabete");
  const hasIRC = has("insuffisance renale");
  const hasObesite = has("obesite") || (imc !== null && imc >= 30);
  const allergiesCount = allergies.length;
  const allergiesText = allergiesCount === 0 ? "Aucune connue" : allergies.map((a) => a.substance).join(", ");
  const allergiesSeveres = allergies.some((a) => a.severite === "severe" || a.severite === "anaphylaxie");
  const nbMed = traitements.length;
  const divTotal = divergences.length;
  const divOpen = divergences.filter((d) => d.statut !== "resolu").length;
  const securityScore = risk?.score ?? null;

  const ageLevel: Level = age !== null && age >= 75 ? "warn" : age !== null && age >= 65 ? "warn" : "ok";
  const imcLevel: Level = imc === null ? "ok" : imc >= 30 ? "warn" : imc >= 25 ? "warn" : "ok";
  const nbMedLevel: Level = nbMed >= 10 ? "alert" : nbMed >= 5 ? "warn" : "ok";
  const complexityLevel: Level = complexity.niveau === "eleve" ? "alert" : complexity.niveau === "modere" ? "warn" : "ok";
  const securityLevel: Level = securityScore === null ? "ok" : securityScore >= 70 ? "alert" : securityScore >= 40 ? "warn" : "ok";
  const divergenceLevel: Level = divTotal === 0 ? "ok" : divOpen > 0 ? "alert" : "warn";

  const rows: Array<{ label: string; value: string; level: Level }> = [
    { label: "Âge", value: age !== null ? `${age} ans` : "—", level: ageLevel },
    { label: "IMC", value: imc !== null ? `${imc.toFixed(1)} kg/m² (${imcClasse})` : "—", level: imcLevel },
    { label: "HTA", value: hasHTA ? "Oui" : "Non", level: hasHTA ? "warn" : "ok" },
    { label: "Diabète type 2", value: hasDT2 ? "Oui" : "Non", level: hasDT2 ? "warn" : "ok" },
    { label: "Insuffisance rénale chronique", value: hasIRC ? "Oui" : "Non", level: hasIRC ? "alert" : "ok" },
    { label: "Obésité", value: hasObesite ? "Oui" : "Non", level: hasObesite ? "warn" : "ok" },
    { label: "Allergies", value: allergiesText, level: allergiesSeveres ? "alert" : allergiesCount > 0 ? "warn" : "ok" },
    { label: "Nombre de médicaments", value: String(nbMed), level: nbMedLevel },
    { label: "Complexité patient", value: `${complexity.score} / 15`, level: complexityLevel },
    { label: "Score sécurité médicamenteuse", value: securityScore !== null ? `${securityScore} / 100` : "Non calculé", level: securityLevel },
    { label: "Divergences détectées", value: divTotal === 0 ? "0" : `${divTotal}${divOpen > 0 ? ` (${divOpen} ouvertes)` : ""}`, level: divergenceLevel },
  ];

  const payload = aiAnalysis?.payload as unknown as AIAnalysisPayload | undefined;
  const clinicalProfile = generateClinicalProfile(comorbLabels);
  const synthese = payload?.synthese ?? clinicalProfile.profile;
  const vigilance = clinicalProfile.vigilance.length > 0
    ? clinicalProfile.vigilance
    : payload?.adaptations_posologiques?.map((a) => `${a.medicament} — ${a.recommandation}`) ?? [];
  const niveauRisque: Level = securityLevel === "alert" || divergenceLevel === "alert" || complexityLevel === "alert" ? "alert"
    : securityLevel === "warn" || divergenceLevel === "warn" ? "warn" : "ok";
  const recommandation = niveauRisque === "alert"
    ? "Patient à risque élevé de divergence médicamenteuse. Une validation médicale est recommandée avant finalisation de la conciliation."
    : niveauRisque === "warn"
    ? "Patient à risque modéré. Vérifier les points de vigilance ci-dessus avant validation."
    : "Profil à faible risque — poursuivre la conciliation selon le protocole standard.";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base uppercase tracking-wide">
          <ClipboardList className="h-5 w-5" />
          Tableau de synthèse clinique et médicamenteuse
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="font-semibold text-foreground">Élément</TableHead>
                <TableHead className="font-semibold text-foreground">Donnée patient</TableHead>
                <TableHead className="font-semibold text-foreground w-[160px]">Niveau</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.label} className={`${LEVEL_BG[r.level]} transition-colors`}>
                  <TableCell className="font-medium">{r.label}</TableCell>
                  <TableCell className={LEVEL_TEXT[r.level]}>{r.value}</TableCell>
                  <TableCell><LevelBadge level={r.level} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="border-t pt-4">
          <h3 className="text-base font-bold uppercase tracking-wide flex items-center gap-2 mb-3">
            <Sparkles className="h-4 w-4 text-primary" /> Synthèse IA
          </h3>

          <div className="space-y-3 text-sm">
            <div>
              <div className="font-semibold mb-1">Analyse du profil</div>
              <p className="text-muted-foreground">{synthese}</p>
            </div>

            {vigilance.length > 0 && (
              <div>
                <div className="font-semibold mb-1 flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4 text-amber-600" /> Points de vigilance
                </div>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  {vigilance.map((v, i) => <li key={i}>{v}</li>)}
                </ul>
              </div>
            )}

            <div>
              <div className="font-semibold mb-1 flex items-center gap-1">
                {niveauRisque === "alert"
                  ? <AlertTriangle className="h-4 w-4 text-red-600" />
                  : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                Recommandation globale
              </div>
              <p className={`p-3 rounded-md border ${niveauRisque === "alert" ? "bg-red-50 border-red-200 text-red-900" : niveauRisque === "warn" ? "bg-amber-50 border-amber-200 text-amber-900" : "bg-emerald-50 border-emerald-200 text-emerald-900"}`}>
                {recommandation}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
