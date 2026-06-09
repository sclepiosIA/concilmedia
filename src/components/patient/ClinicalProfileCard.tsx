import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Activity,
  ShieldCheck,
  AlertTriangle,
  HeartPulse,
  Stethoscope,
  Scale,
} from "lucide-react";
import {
  computeComplexity,
  COMPLEXITY_LABEL,
  type ComplexityLevel,
} from "@/lib/clinical/complexityScore";
import { computeBmi } from "@/lib/clinical/bmi";

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

type Tone = "green" | "orange" | "red";

const TONE_STYLES: Record<Tone, { card: string; head: string; icon: string }> = {
  green: {
    card: "border-green-200 bg-green-50/60",
    head: "text-green-900",
    icon: "bg-green-100 text-green-700",
  },
  orange: {
    card: "border-amber-200 bg-amber-50/60",
    head: "text-amber-900",
    icon: "bg-amber-100 text-amber-700",
  },
  red: {
    card: "border-red-200 bg-red-50/60",
    head: "text-red-900",
    icon: "bg-red-100 text-red-700",
  },
};

function ProfileTile({
  tone,
  icon: Icon,
  title,
  children,
}: {
  tone: Tone;
  icon: typeof HeartPulse;
  title: string;
  children: React.ReactNode;
}) {
  const s = TONE_STYLES[tone];
  return (
    <div className={`rounded-lg border ${s.card} p-3 space-y-2`}>
      <div className={`flex items-center gap-2 text-sm font-semibold ${s.head}`}>
        <span className={`h-7 w-7 rounded-full flex items-center justify-center ${s.icon}`}>
          <Icon className="h-4 w-4" />
        </span>
        {title}
      </div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function buildRiskProfile(comorb: string[], bmi: number | null): { label: string; tone: Tone }[] {
  const set = comorb.map(normalize);
  const has = (kw: string) => set.some((s) => s.includes(kw));
  const risks: { label: string; tone: Tone }[] = [];
  if (has("hta") || has("hypertension") || has("coronar") || has("infarctus") || has("avc") || has("ait") || has("fibrillation") || has("insuffisance cardiaque")) {
    risks.push({ label: "Risque cardiovasculaire élevé", tone: "red" });
  }
  if (has("renal") || has("rein") || has("irc")) risks.push({ label: "Vigilance rénale", tone: "orange" });
  if (has("diabete") || has("dyslipid") || has("cholesterol")) risks.push({ label: "Risque métabolique élevé", tone: "orange" });
  if (has("obesite") || (bmi !== null && bmi >= 30)) risks.push({ label: "Risque lié à l'obésité", tone: "orange" });
  if (has("bpco") || has("asthme")) risks.push({ label: "Vigilance respiratoire", tone: "orange" });
  return risks;
}


export function ClinicalProfileCard({ patientId }: { patientId: string }) {
  const { data: patient } = useQuery({
    queryKey: ["patient", patientId],
    queryFn: async () =>
      (await supabase.from("patients").select("*").eq("id", patientId).maybeSingle()).data,
  });
  const { data: comorbidites = [] } = useQuery({
    queryKey: ["comorbidites", patientId],
    queryFn: async () =>
      (await supabase.from("comorbidites").select("*").eq("patient_id", patientId).eq("statut", "actif")).data ?? [],
  });
  const { data: allergies = [] } = useQuery({
    queryKey: ["allergies", patientId],
    queryFn: async () =>
      (await supabase.from("allergies").select("*").eq("patient_id", patientId)).data ?? [],
  });
  const { data: traitements = [] } = useQuery({
    queryKey: ["traitements", patientId],
    queryFn: async () =>
      (await supabase.from("traitements_habituels").select("*").eq("patient_id", patientId).eq("actif", true)).data ?? [],
  });

  const labels = comorbidites.map((c) => c.libelle);
  const bmi = computeBmi(patient?.poids_kg ?? null, patient?.taille_cm ?? null);
  const baseComplexity = computeComplexity(labels);
  // Extension du score : âge, polymédication, obésité, IR
  const age = patient?.date_naissance
    ? Math.floor((Date.now() - new Date(patient.date_naissance).getTime()) / 31557600000)
    : null;
  let extra = 0;
  const detail = [...baseComplexity.detail];
  if (age !== null && age >= 75) { extra += 2; detail.push({ label: "Âge ≥ 75 ans", weight: 2 }); }
  else if (age !== null && age >= 65) { extra += 1; detail.push({ label: "Âge 65-74 ans", weight: 1 }); }
  if (traitements.length >= 10) { extra += 3; detail.push({ label: "Polymédication majeure (≥10)", weight: 3 }); }
  else if (traitements.length >= 5) { extra += 2; detail.push({ label: "Polymédication (≥5)", weight: 2 }); }
  if (bmi && bmi.imc >= 30) { extra += 1; detail.push({ label: "Obésité (IMC ≥ 30)", weight: 1 }); }
  const score = baseComplexity.score + extra;
  const niveau: ComplexityLevel = score >= 9 ? "eleve" : score >= 5 ? "modere" : "faible";
  const complexity = { score, niveau, detail };

  const risks = buildRiskProfile(labels, bmi?.imc ?? null);

  return (
    <Card className="border-primary/20 shadow-sm">
      <CardContent className="py-4 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 font-semibold text-sm uppercase tracking-wide">
            <Sparkles className="h-4 w-4 text-primary" />
            Profil patient et vigilance médicamenteuse
          </div>
          <ComplexityBadge score={complexity.score} niveau={complexity.niveau} />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <ProfileTile tone="red" icon={HeartPulse} title="Comorbidités">
            {labels.length === 0 ? (
              <span className="text-muted-foreground">Aucune comorbidité renseignée</span>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {labels.map((l) => (
                  <Badge key={l} variant="outline" className="bg-white border-red-200 text-red-800">{l}</Badge>
                ))}
              </div>
            )}
          </ProfileTile>

          <ProfileTile
            tone={bmi ? bmi.tone : "green"}
            icon={Scale}
            title="IMC & morphologie"
          >
            {!bmi ? (
              <span className="text-muted-foreground">Poids et taille requis pour calculer l'IMC</span>
            ) : (
              <div className="space-y-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold">{bmi.imc}</span>
                  <span className="text-xs text-muted-foreground">kg/m²</span>
                </div>
                <div className="text-sm font-medium">{bmi.label}</div>
                <div className="text-xs text-muted-foreground">
                  {patient?.poids_kg} kg · {patient?.taille_cm} cm
                </div>
              </div>
            )}
          </ProfileTile>

          <ProfileTile
            tone={allergies.length === 0 ? "green" : "red"}
            icon={allergies.length === 0 ? ShieldCheck : AlertTriangle}
            title="Allergies"
          >
            {allergies.length === 0 ? (
              <span className="text-green-800 font-medium">Aucune allergie connue</span>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {allergies.map((a) => (
                  <Badge key={a.id} variant="outline" className="bg-white border-red-200 text-red-800">
                    ⚠ {a.substance}
                  </Badge>
                ))}
              </div>
            )}
          </ProfileTile>

          <ProfileTile tone="orange" icon={Stethoscope} title="Profil de risque clinique">
            {risks.length === 0 ? (
              <span className="text-muted-foreground">Aucun risque particulier identifié</span>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {risks.map((r) => (
                  <Badge
                    key={r.label}
                    variant="outline"
                    className={`bg-white ${r.tone === "red" ? "border-red-300 text-red-800" : "border-amber-300 text-amber-900"}`}
                  >
                    {r.label}
                  </Badge>
                ))}
              </div>
            )}
          </ProfileTile>
        </div>
      </CardContent>
    </Card>
  );
}
