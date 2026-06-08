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
  ClipboardCheck,
} from "lucide-react";
import {
  computeComplexity,
  COMPLEXITY_LABEL,
  type ComplexityLevel,
} from "@/lib/clinical/complexityScore";

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

function buildRiskProfile(comorb: string[]): string[] {
  const set = comorb.map(normalize);
  const has = (kw: string) => set.some((s) => s.includes(kw));
  const risks: string[] = [];
  if (has("hta") || has("hypertension") || has("coronar") || has("infarctus") || has("avc") || has("ait") || has("fibrillation") || has("insuffisance cardiaque")) {
    risks.push("Risque cardiovasculaire élevé");
  }
  if (has("renal") || has("rein") || has("irc")) risks.push("Vigilance rénale");
  if (has("diabete") || has("dyslipid") || has("cholesterol")) risks.push("Risque métabolique élevé");
  if (has("obesite") || has("imc")) risks.push("Obésité");
  if (has("bpco") || has("asthme")) risks.push("Vigilance respiratoire");
  return risks;
}

function buildVigilance(comorb: string[]): string[] {
  const set = comorb.map(normalize);
  const has = (kw: string) => set.some((s) => s.includes(kw));
  const items: string[] = [];
  if (has("diabete")) items.push("Vérifier les traitements antidiabétiques");
  if (has("renal") || has("rein") || has("irc")) items.push("Vérifier les adaptations posologiques rénales");
  if (has("hta") || has("hypertension") || has("insuffisance cardiaque")) items.push("Vérifier les traitements antihypertenseurs");
  if (has("fibrillation") || has("avc") || has("ait")) items.push("Vérifier la couverture anticoagulante");
  items.push("Vérifier les interactions potentielles");
  items.push("Vérifier les médicaments manquants lors des transitions de soins");
  return items;
}

export function ClinicalProfileCard({ patientId }: { patientId: string }) {
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

  const labels = comorbidites.map((c) => c.libelle);
  const complexity = computeComplexity(labels);
  const risks = buildRiskProfile(labels);
  const vigilance = buildVigilance(labels);
  const complexityTone: Tone = complexity.niveau === "eleve" ? "red" : complexity.niveau === "modere" ? "orange" : "green";

  if (labels.length === 0 && allergies.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-4 text-sm text-muted-foreground">
          Ajoutez des comorbidités et allergies pour générer le profil patient et la vigilance médicamenteuse.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="py-4 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 font-semibold text-sm uppercase tracking-wide">
            <Sparkles className="h-4 w-4 text-primary" />
            Profil patient
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
            tone={allergies.length === 0 ? "green" : "red"}
            icon={allergies.length === 0 ? ShieldCheck : AlertTriangle}
            title="Allergies"
          >
            {allergies.length === 0 ? (
              <span className="text-green-800">Aucune allergie connue</span>
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

          <ProfileTile tone="orange" icon={Stethoscope} title="Profil de risque">
            {risks.length === 0 ? (
              <span className="text-muted-foreground">Aucun risque particulier identifié</span>
            ) : (
              <ul className="space-y-0.5 list-disc pl-5 text-amber-900">
                {risks.map((r) => <li key={r}>{r}</li>)}
              </ul>
            )}
          </ProfileTile>

          <ProfileTile tone="orange" icon={ClipboardCheck} title="Points de vigilance pour la conciliation">
            <ul className="space-y-0.5 list-disc pl-5 text-amber-900">
              {vigilance.map((v) => <li key={v}>{v}</li>)}
            </ul>
          </ProfileTile>

          <div className="md:col-span-2">
            <ProfileTile tone={complexityTone} icon={Activity} title="Complexité patient">
              <div className="flex items-center gap-3">
                <Badge variant="outline" className={`text-base px-3 py-1 ${TONE[complexity.niveau]}`}>
                  {COMPLEXITY_LABEL[complexity.niveau]}
                </Badge>
                <span className="text-sm text-muted-foreground">Score : <strong className="text-foreground">{complexity.score} pts</strong></span>
              </div>
            </ProfileTile>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
