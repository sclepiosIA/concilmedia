import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Heart, Droplet, Activity, Scale, Brain, Wind, AlertTriangle } from "lucide-react";
import { computeComplexity, generateClinicalProfile, COMPLEXITY_LABEL, type ComplexityLevel } from "@/lib/clinical/complexityScore";

const TONE: Record<ComplexityLevel, string> = {
  faible: "bg-green-100 text-green-800 border-green-200",
  modere: "bg-amber-100 text-amber-800 border-amber-200",
  eleve: "bg-red-100 text-red-800 border-red-200",
};

const RING: Record<ComplexityLevel, string> = {
  faible: "text-green-500",
  modere: "text-amber-500",
  eleve: "text-red-500",
};

export function ComplexityBadge({ score, niveau }: { score: number; niveau: ComplexityLevel }) {
  return (
    <Badge variant="outline" className={`gap-1 ${TONE[niveau]}`}>
      <Activity className="h-3 w-3" /> Complexité {COMPLEXITY_LABEL[niveau]} · {score} pts
    </Badge>
  );
}

function ComplexityGauge({ score, niveau }: { score: number; niveau: ComplexityLevel }) {
  const max = 15;
  const pct = Math.min(100, Math.round((score / max) * 100));
  const r = 36;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <div className="flex items-center gap-3">
      <div className="relative h-24 w-24">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeWidth="8" className="text-muted/30" />
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c}`}
            className={RING[niveau]}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-xl font-bold leading-none">{score}</div>
          <div className="text-[10px] text-muted-foreground">/ {max} pts</div>
        </div>
      </div>
      <div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Complexité</div>
        <div className={`font-semibold ${RING[niveau]}`}>{COMPLEXITY_LABEL[niveau]}</div>
      </div>
    </div>
  );
}

interface OrganTile {
  key: string;
  label: string;
  icon: typeof Heart;
  active: boolean;
  match: string[];
}

function OrganMap({ labels, imc }: { labels: string[]; imc: number | null }) {
  const norm = labels.map((l) =>
    l.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
  );
  const has = (kws: string[]) => kws.some((k) => norm.some((n) => n.includes(k)));

  const tiles: (OrganTile & { detail?: string })[] = [
    { key: "cv", label: "Cardiovasculaire", icon: Heart, match: ["hta", "hypertension", "coronar", "infarctus", "fibrillation", "insuffisance cardiaque"], active: false },
    { key: "rein", label: "Rénal", icon: Droplet, match: ["renal", "rein", "irc"], active: false },
    { key: "metab", label: "Métabolique", icon: Activity, match: ["diabete", "dyslipid", "cholesterol"], active: false },
    { key: "poids", label: "Pondéral", icon: Scale, match: ["obesite", "imc"], active: false, detail: imc !== null ? `BMI ${imc.toFixed(1)}` : undefined },
    { key: "neuro", label: "Neuro", icon: Brain, match: ["avc", "ait", "epilep", "parkinson", "demence"], active: false },
    { key: "resp", label: "Respiratoire", icon: Wind, match: ["bpco", "asthme", "pneumo"], active: false },
  ].map((t) => ({ ...t, active: has(t.match) }));

  const visible = tiles.filter((t) => t.active);
  if (visible.length === 0) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {visible.map((t) => {
        const Icon = t.icon;
        return (
          <div key={t.key} className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50/60 p-2">
            <div className="h-8 w-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
              <Icon className="h-4 w-4" />
            </div>
            <div className="text-xs">
              <div className="font-medium text-red-900">{t.label}</div>
              <div className="text-red-700/80">{t.detail ?? "Atteint"}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ClinicalProfileCard({ patientId }: { patientId: string }) {
  const { data: comorbidites = [] } = useQuery({
    queryKey: ["comorbidites", patientId],
    queryFn: async () =>
      (await supabase.from("comorbidites").select("*").eq("patient_id", patientId).eq("statut", "actif")).data ?? [],
  });
  const { data: patient } = useQuery({
    queryKey: ["patient", patientId, "imc"],
    queryFn: async () =>
      (await supabase.from("patients").select("poids_kg, taille_cm").eq("id", patientId).maybeSingle()).data,
  });
  const imc =
    patient?.poids_kg && patient?.taille_cm
      ? patient.poids_kg / Math.pow(patient.taille_cm / 100, 2)
      : null;

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
      <CardContent className="py-4 space-y-4">
        <div className="flex items-center gap-2 font-medium text-sm">
          <Sparkles className="h-4 w-4 text-primary" /> Profil clinique IA
        </div>

        <div className="grid gap-4 md:grid-cols-[auto_1fr] items-start">
          <ComplexityGauge score={complexity.score} niveau={complexity.niveau} />
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Comorbidités</div>
            <div className="flex gap-1 flex-wrap">
              {labels.map((l) => (
                <Badge key={l} variant="secondary">{l}</Badge>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Organes & systèmes concernés</div>
          <OrganMap labels={labels} imc={imc} />
        </div>

        {vigilance.length > 0 && (
          <div className="rounded-md bg-amber-50 border border-amber-200 p-3 space-y-1">
            <div className="text-xs font-semibold text-amber-900 uppercase tracking-wide flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" /> Facteurs de vigilance
            </div>
            <ul className="text-sm text-amber-900 list-disc pl-5 space-y-0.5">
              {vigilance.map((v) => <li key={v}>{v}</li>)}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
