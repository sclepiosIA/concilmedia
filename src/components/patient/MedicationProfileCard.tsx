import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Pill, AlertTriangle, ShieldCheck, Layers, ClipboardCheck, Activity } from "lucide-react";
import { classifyDci, ATC_LABELS, type AtcClassKey } from "@/lib/conciliation/atcInteractions";

type Tone = "green" | "orange" | "red";

const TONE_STYLES: Record<Tone, { card: string; head: string; icon: string }> = {
  green: { card: "border-green-200 bg-green-50/60", head: "text-green-900", icon: "bg-green-100 text-green-700" },
  orange: { card: "border-amber-200 bg-amber-50/60", head: "text-amber-900", icon: "bg-amber-100 text-amber-700" },
  red: { card: "border-red-200 bg-red-50/60", head: "text-red-900", icon: "bg-red-100 text-red-700" },
};

function Tile({ tone, icon: Icon, title, children }: { tone: Tone; icon: typeof Pill; title: string; children: React.ReactNode }) {
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

const HIGH_RISK: AtcClassKey[] = ["anticoagulant", "insuline", "antiepileptique", "antiarythmique", "opioide", "ains"];

function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function MedicationProfileCard({ patientId }: { patientId: string }) {
  const { data: traitements = [] } = useQuery({
    queryKey: ["traitements", patientId],
    queryFn: async () =>
      (await supabase.from("traitements_habituels").select("*").eq("patient_id", patientId).eq("actif", true)).data ?? [],
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

  const n = traitements.length;
  if (n === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-4 text-sm text-muted-foreground">
          Ajoutez des traitements habituels pour générer la synthèse médicamenteuse.
        </CardContent>
      </Card>
    );
  }

  // Classes ATC
  const classes = new Map<AtcClassKey, string[]>();
  for (const t of traitements) {
    const dci = t.dci || t.nom_commercial || "";
    if (!dci) continue;
    const cls = classifyDci(dci);
    if (!classes.has(cls)) classes.set(cls, []);
    classes.get(cls)!.push(dci);
  }
  const highRisk = Array.from(classes.entries()).filter(([k]) => HIGH_RISK.includes(k));

  // Polymédication
  const polyTone: Tone = n >= 10 ? "red" : n >= 5 ? "orange" : "green";
  const polyLabel = n >= 10 ? "Polymédication majeure" : n >= 5 ? "Polymédication" : "Médication limitée";

  // Vigilances croisées
  const comoN = comorbidites.map((c) => normalize(c.libelle));
  const has = (kw: string) => comoN.some((s) => s.includes(kw));
  const vigilance: string[] = [];
  if (classes.has("anticoagulant")) vigilance.push("Surveiller le risque hémorragique (INR / fonction rénale)");
  if (classes.has("antidiabetique") || classes.has("insuline")) vigilance.push("Surveiller le risque d'hypoglycémie");
  if ((classes.has("iec_ara2") || classes.has("diuretique")) && has("renal")) vigilance.push("Adapter les doses à la fonction rénale (DFG)");
  if (classes.has("ains") && has("renal")) vigilance.push("AINS à éviter en insuffisance rénale");
  if (classes.has("ains") && classes.has("anticoagulant")) vigilance.push("Association AINS + anticoagulant : risque hémorragique majoré");
  if (classes.has("betabloquant") && has("bpco")) vigilance.push("Préférer un bêtabloquant cardio-sélectif (BPCO)");
  if (classes.has("benzodiazepine") || classes.has("opioide")) vigilance.push("Risque de sédation / chute — réévaluer l'indication");
  if (n >= 5) vigilance.push("Polymédication : vérifier les interactions et la pertinence de chaque ligne");
  vigilance.push("Vérifier les omissions / divergences lors des transitions de soins");

  return (
    <Card>
      <CardContent className="py-4 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 font-semibold text-sm uppercase tracking-wide">
            <Pill className="h-4 w-4 text-primary" />
            Synthèse médicamenteuse & vigilance
          </div>
          <Badge variant="outline" className={TONE_STYLES[polyTone].card + " " + TONE_STYLES[polyTone].head}>
            <Activity className="h-3 w-3 mr-1" /> {n} traitement{n > 1 ? "s" : ""} · {polyLabel}
          </Badge>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Tile tone="orange" icon={Layers} title="Classes thérapeutiques">
            <div className="flex flex-wrap gap-1.5">
              {Array.from(classes.entries()).map(([k, dcis]) => (
                <Badge
                  key={k}
                  variant="outline"
                  className={`bg-white ${HIGH_RISK.includes(k) ? "border-red-300 text-red-800" : "border-amber-200 text-amber-900"}`}
                >
                  {ATC_LABELS[k]} · {dcis.length}
                </Badge>
              ))}
            </div>
          </Tile>

          <Tile
            tone={highRisk.length === 0 ? "green" : "red"}
            icon={highRisk.length === 0 ? ShieldCheck : AlertTriangle}
            title="Médicaments à haut risque"
          >
            {highRisk.length === 0 ? (
              <span className="text-green-800">Aucun médicament à marge thérapeutique étroite identifié</span>
            ) : (
              <ul className="space-y-0.5 list-disc pl-5 text-red-900">
                {highRisk.map(([k, dcis]) => (
                  <li key={k}><strong>{ATC_LABELS[k]}</strong> : {dcis.join(", ")}</li>
                ))}
              </ul>
            )}
          </Tile>

          <Tile
            tone={allergies.length === 0 ? "green" : "red"}
            icon={allergies.length === 0 ? ShieldCheck : AlertTriangle}
            title="Croisement allergies"
          >
            {allergies.length === 0 ? (
              <span className="text-green-800">Aucune allergie connue à croiser</span>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {allergies.map((a) => (
                  <Badge key={a.id} variant="outline" className="bg-white border-red-200 text-red-800">⚠ {a.substance}</Badge>
                ))}
              </div>
            )}
          </Tile>

          <Tile tone="orange" icon={ClipboardCheck} title="Points de vigilance pharmacologique">
            <ul className="space-y-0.5 list-disc pl-5 text-amber-900">
              {vigilance.map((v) => <li key={v}>{v}</li>)}
            </ul>
          </Tile>
        </div>
      </CardContent>
    </Card>
  );
}
