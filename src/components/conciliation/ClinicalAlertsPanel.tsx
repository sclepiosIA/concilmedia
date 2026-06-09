import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useId, useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronDown,
  ShieldAlert,
  Stethoscope,
  Sliders,
  Copy,
  Pencil,
  Pill,
  Repeat,
  Sparkles,
  X,
} from "lucide-react";
import type { AIAnalysisPayload } from "@/lib/conciliation/analyze.functions";
import type { ItemDecision } from "@/lib/conciliation/validateConciliation.functions";

export type AlertCategory = ItemDecision["category"];

export interface ValidationControl {
  decisions: Record<string, ItemDecision>;
  onDecision: (key: string, decision: ItemDecision | null) => void;
  readOnly?: boolean;
}

function decisionKey(category: AlertCategory, index: number) {
  return `${category}:${index}`;
}


type Severity = "mineure" | "moderee" | "majeure" | "contre_indication" | string;

const SEV_STYLES: Record<
  string,
  { label: string; container: string; trigger: string; dot: string; badge: string }
> = {
  mineure: {
    label: "Mineure",
    container: "border-yellow-300 bg-yellow-50",
    trigger: "hover:bg-yellow-100/60",
    dot: "bg-yellow-500",
    badge: "bg-yellow-500 text-white hover:bg-yellow-500",
  },
  moderee: {
    label: "Modérée",
    container: "border-orange-300 bg-orange-50",
    trigger: "hover:bg-orange-100/60",
    dot: "bg-orange-500",
    badge: "bg-orange-500 text-white hover:bg-orange-500",
  },
  majeure: {
    label: "Majeure",
    container: "border-red-300 bg-red-50",
    trigger: "hover:bg-red-100/60",
    dot: "bg-red-600",
    badge: "bg-red-600 text-white hover:bg-red-600",
  },
  contre_indication: {
    label: "Contre-indication",
    container: "border-red-400 bg-red-100",
    trigger: "hover:bg-red-200/60",
    dot: "bg-red-700",
    badge: "bg-red-700 text-white hover:bg-red-700",
  },
  default: {
    label: "À évaluer",
    container: "border-slate-200 bg-slate-50",
    trigger: "hover:bg-slate-100/60",
    dot: "bg-slate-400",
    badge: "bg-slate-500 text-white hover:bg-slate-500",
  },
};

function sevStyle(s?: Severity) {
  if (!s) return SEV_STYLES.default;
  return SEV_STYLES[s.toLowerCase()] ?? SEV_STYLES.default;
}

function confidenceColor(c: number) {
  if (c >= 80) return "bg-emerald-500";
  if (c >= 60) return "bg-sky-500";
  if (c >= 40) return "bg-amber-500";
  return "bg-slate-400";
}

interface AlertItemProps {
  title: string;
  medicaments?: string;
  subtitle?: string;
  severite?: Severity;
  mecanisme?: string;
  risque?: string;
  recommandation?: string;
  alternative?: string;
  reference?: string;
  confiance?: number;
  icon?: typeof AlertTriangle;
  validation?: {
    decision: ItemDecision | undefined;
    onChange: (d: ItemDecision | null) => void;
    category: AlertCategory;
    index: number;
    readOnly?: boolean;
  };
}


function AlertItem({
  title,
  medicaments,
  subtitle,
  severite,
  mecanisme,
  risque,
  recommandation,
  alternative,
  reference,
  confiance,
  icon: Icon = AlertTriangle,
}: AlertItemProps) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const sev = sevStyle(severite);
  const conf = typeof confiance === "number" ? Math.max(0, Math.min(100, Math.round(confiance))) : null;

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={`rounded-md border ${sev.container} overflow-hidden mb-2 last:mb-0`}
    >
        <button
          type="button"
          aria-expanded={open}
          aria-controls={detailsId}
          onClick={() => setOpen((current) => !current)}
          className={`flex w-full items-start justify-between gap-3 px-3 py-2 text-left transition-colors ${sev.trigger}`}
        >
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <span className={`mt-1.5 h-2.5 w-2.5 rounded-full shrink-0 ${sev.dot}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Icon className="h-4 w-4 shrink-0" />
                <span className="font-semibold text-sm">{title}</span>
                <Badge className={`text-[10px] ${sev.badge}`}>{sev.label}</Badge>
                {conf !== null && (
                  <Badge variant="outline" className="text-[10px] bg-white">
                    Confiance IA {conf}%
                  </Badge>
                )}
              </div>
              {subtitle && <p className="text-xs mt-0.5 opacity-80">{subtitle}</p>}
            </div>
          </div>
          <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>
      <CollapsibleContent id={detailsId} className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
        <div className="px-3 pb-3">
          <div className="space-y-2 text-xs bg-white/80 rounded p-3 border">
          <Detail icon={Pill} label="Médicaments concernés" value={medicaments || title} />
          <Detail icon={AlertTriangle} label="Gravité" value={sev.label} />
          <Detail icon={Stethoscope} label="Mécanisme / explication clinique" value={mecanisme || "Non renseigné dans l'analyse."} />
          <Detail icon={ShieldAlert} label="Risque clinique" value={risque || "Non renseigné dans l'analyse."} />
          <Detail icon={Sliders} label="Recommandation pratique" value={recommandation || "Non renseignée dans l'analyse."} />
          <Detail icon={Repeat} label="Alternative thérapeutique" value={alternative || "Non proposée dans cette recommandation."} />
          <Detail icon={BookOpen} label="Références" value={reference || "Référence non renseignée dans l'analyse."} />
          {conf !== null && (
            <div className="flex gap-2 pt-1">
              <Sparkles className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="font-semibold uppercase tracking-wide text-[10px] text-muted-foreground">
                  Score de confiance IA
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="h-1.5 flex-1 rounded-full bg-slate-200 overflow-hidden">
                    <div className={`h-full ${confidenceColor(conf)}`} style={{ width: `${conf}%` }} />
                  </div>
                  <span className="text-xs font-semibold tabular-nums">{conf}%</span>
                </div>
              </div>
            </div>
          )}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function Detail({ icon: Icon, label, value }: { icon: typeof BookOpen; label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <div className="font-semibold uppercase tracking-wide text-[10px] text-muted-foreground">{label}</div>
        <div className="text-foreground leading-snug whitespace-pre-wrap">{value}</div>
      </div>
    </div>
  );
}

export function ClinicalAlertsPanel({ payload }: { payload: AIAnalysisPayload }) {
  const interactions = payload.interactions ?? [];
  const ci = payload.contre_indications ?? [];
  const adaptations = payload.adaptations_posologiques ?? [];
  const doublons = payload.doublons_therapeutiques ?? [];
  const allergies = payload.allergies_croisees ?? [];
  const hautRisque = payload.medicaments_haut_risque ?? [];

  const hasAny =
    interactions.length + ci.length + adaptations.length + doublons.length + allergies.length + hautRisque.length > 0;
  if (!hasAny) return null;

  return (
    <div className="space-y-4">
      {interactions.length > 0 && (
        <Section title="Interactions médicamenteuses" count={interactions.length} icon={Copy}>
          {interactions.map((i, k) => (
            <AlertItem
              key={`int-${k}`}
              title={`${i.dci_1} ↔ ${i.dci_2}`}
              medicaments={`${i.dci_1}, ${i.dci_2}`}
              severite={i.severite}
              mecanisme={i.mecanisme}
              risque={i.risque}
              recommandation={i.recommandation}
              alternative={i.alternative}
              reference={i.reference}
              confiance={i.confiance}
            />
          ))}
        </Section>
      )}

      {ci.length > 0 && (
        <Section title="Contre-indications" count={ci.length} icon={ShieldAlert}>
          {ci.map((c, k) => (
            <AlertItem
              key={`ci-${k}`}
              title={c.medicament}
              medicaments={c.medicament}
              subtitle={c.raison}
              severite={c.severite ?? "contre_indication"}
              mecanisme={c.mecanisme ?? c.raison}
              risque={c.risque}
              recommandation={c.recommandation}
              alternative={c.alternative}
              reference={c.reference}
              confiance={c.confiance}
            />
          ))}
        </Section>
      )}

      {adaptations.length > 0 && (
        <Section title="Adaptations posologiques" count={adaptations.length} icon={Sliders}>
          {adaptations.map((a, k) => (
            <AlertItem
              key={`ad-${k}`}
              title={a.medicament}
              medicaments={a.medicament}
              subtitle={a.raison}
              severite={a.severite ?? "moderee"}
              mecanisme={a.mecanisme ?? a.raison}
              risque={a.risque}
              recommandation={a.recommandation}
              alternative={a.alternative}
              reference={a.reference}
              confiance={a.confiance}
            />
          ))}
        </Section>
      )}

      {doublons.length > 0 && (
        <Section title="Doublons thérapeutiques" count={doublons.length} icon={Copy}>
          {doublons.map((d, k) => (
            <AlertItem
              key={`db-${k}`}
              title={d.medicaments.join(" + ")}
              medicaments={d.medicaments.join(", ")}
              subtitle={`Classe : ${d.classe}`}
              severite={d.severite ?? "moderee"}
              mecanisme={d.mecanisme}
              risque={d.risque}
              recommandation={d.recommandation}
              alternative={d.alternative}
              reference={d.reference}
              confiance={d.confiance}
            />
          ))}
        </Section>
      )}

      {allergies.length > 0 && (
        <Section title="Allergies croisées" count={allergies.length} icon={ShieldAlert}>
          {allergies.map((a, k) => (
            <AlertItem
              key={`al-${k}`}
              title={`${a.allergene} ↔ ${a.medicament}`}
              medicaments={a.medicament}
              severite={a.severite ?? "majeure"}
              risque={a.risque}
              recommandation={a.recommandation}
              alternative={a.alternative}
              reference={a.reference}
              confiance={a.confiance}
            />
          ))}
        </Section>
      )}

      {hautRisque.length > 0 && (
        <Section title="Médicaments à haut risque" count={hautRisque.length} icon={ShieldAlert}>
          {hautRisque.map((h, k) => (
            <AlertItem
              key={`hr-${k}`}
              title={h.medicament}
              medicaments={h.medicament}
              subtitle={`Classe : ${h.classe}`}
              severite={h.severite ?? "majeure"}
              mecanisme={h.raison}
              risque={h.risque}
              recommandation={h.recommandation}
              alternative={h.alternative}
              reference={h.reference}
              confiance={h.confiance}
            />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  count,
  icon: Icon,
  children,
}: {
  title: string;
  count: number;
  icon: typeof AlertTriangle;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border bg-white p-3">
      <div className="flex items-center gap-2 font-medium text-sm mb-2">
        <Icon className="h-4 w-4 text-primary" /> {title}
        <Badge variant="secondary" className="ml-1">
          {count}
        </Badge>
      </div>
      <div className="space-y-0">{children}</div>
    </div>
  );
}
