import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ChevronDown, ChevronUp, BookOpen, ShieldAlert, Stethoscope, Sliders, Copy } from "lucide-react";
import type { AIAnalysisPayload } from "@/lib/conciliation/analyze.functions";

type Severity = "mineure" | "moderee" | "majeure" | "contre_indication" | string;

const SEV_STYLES: Record<string, { label: string; cls: string; dot: string }> = {
  mineure: { label: "Mineure", cls: "bg-blue-50 border-blue-200 text-blue-900", dot: "bg-blue-500" },
  moderee: { label: "Modérée", cls: "bg-amber-50 border-amber-200 text-amber-900", dot: "bg-amber-500" },
  majeure: { label: "Majeure", cls: "bg-orange-50 border-orange-200 text-orange-900", dot: "bg-orange-500" },
  contre_indication: { label: "Contre-indication", cls: "bg-red-50 border-red-200 text-red-900", dot: "bg-red-600" },
  default: { label: "À évaluer", cls: "bg-slate-50 border-slate-200 text-slate-900", dot: "bg-slate-400" },
};

function sevStyle(s?: Severity) {
  if (!s) return SEV_STYLES.default;
  return SEV_STYLES[s.toLowerCase()] ?? SEV_STYLES.default;
}

interface AlertItemProps {
  title: string;
  subtitle?: string;
  severite?: Severity;
  mecanisme?: string;
  risque?: string;
  recommandation?: string;
  reference?: string;
  icon?: typeof AlertTriangle;
}

function AlertItem({ title, subtitle, severite, mecanisme, risque, recommandation, reference, icon: Icon = AlertTriangle }: AlertItemProps) {
  const [open, setOpen] = useState(false);
  const sev = sevStyle(severite);
  return (
    <div className={`rounded-md border ${sev.cls}`}>
      <div className="p-3 flex items-start gap-3">
        <span className={`mt-1 h-2.5 w-2.5 rounded-full shrink-0 ${sev.dot}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Icon className="h-4 w-4 shrink-0" />
            <span className="font-semibold text-sm">{title}</span>
            {severite && <Badge variant="outline" className="bg-white text-xs">{sev.label}</Badge>}
          </div>
          {subtitle && <p className="text-xs mt-0.5 opacity-80">{subtitle}</p>}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 mt-1 text-xs hover:bg-white/60"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <><ChevronUp className="h-3.5 w-3.5 mr-1" /> Masquer les détails</> : <><ChevronDown className="h-3.5 w-3.5 mr-1" /> Voir les détails</>}
          </Button>
          {open && (
            <div className="mt-2 space-y-2 text-xs bg-white/70 rounded p-2 border">
              {mecanisme && (
                <Detail icon={Stethoscope} label="Explication clinique" value={mecanisme} />
              )}
              {risque && (
                <Detail icon={ShieldAlert} label="Risque encouru" value={risque} />
              )}
              {recommandation && (
                <Detail icon={Sliders} label="Recommandation pratique" value={recommandation} />
              )}
              {reference && (
                <Detail icon={BookOpen} label="Référence" value={reference} />
              )}
              {!mecanisme && !risque && !recommandation && !reference && (
                <p className="italic opacity-70">Aucun détail supplémentaire fourni par l'IA.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Detail({ icon: Icon, label, value }: { icon: typeof BookOpen; label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <div className="font-semibold uppercase tracking-wide text-[10px] text-muted-foreground">{label}</div>
        <div className="text-foreground leading-snug">{value}</div>
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

  const hasAny = interactions.length + ci.length + adaptations.length + doublons.length + allergies.length + hautRisque.length > 0;
  if (!hasAny) return null;

  return (
    <div className="space-y-4">
      {interactions.length > 0 && (
        <Section title="Interactions médicamenteuses" count={interactions.length} icon={Copy}>
          {interactions.map((i, k) => (
            <AlertItem
              key={k}
              title={`${i.dci_1} ↔ ${i.dci_2}`}
              severite={i.severite}
              mecanisme={i.mecanisme}
              risque={i.risque}
              recommandation={i.recommandation}
              reference={i.reference}
            />
          ))}
        </Section>
      )}

      {ci.length > 0 && (
        <Section title="Contre-indications" count={ci.length} icon={ShieldAlert}>
          {ci.map((c, k) => (
            <AlertItem
              key={k}
              title={c.medicament}
              subtitle={c.raison}
              severite={c.severite ?? "contre_indication"}
              mecanisme={c.mecanisme ?? c.raison}
              risque={c.risque}
              recommandation={c.recommandation}
              reference={c.reference}
            />
          ))}
        </Section>
      )}

      {adaptations.length > 0 && (
        <Section title="Adaptations posologiques" count={adaptations.length} icon={Sliders}>
          {adaptations.map((a, k) => (
            <AlertItem
              key={k}
              title={a.medicament}
              subtitle={a.raison}
              severite={a.severite ?? "moderee"}
              mecanisme={a.mecanisme ?? a.raison}
              risque={a.risque}
              recommandation={a.recommandation}
              reference={a.reference}
            />
          ))}
        </Section>
      )}

      {doublons.length > 0 && (
        <Section title="Doublons thérapeutiques" count={doublons.length} icon={Copy}>
          {doublons.map((d, k) => (
            <AlertItem
              key={k}
              title={d.medicaments.join(" + ")}
              subtitle={`Classe : ${d.classe}`}
              severite={d.severite ?? "moderee"}
              mecanisme={d.mecanisme}
              risque={d.risque}
              recommandation={d.recommandation}
              reference={d.reference}
            />
          ))}
        </Section>
      )}

      {allergies.length > 0 && (
        <Section title="Allergies croisées" count={allergies.length} icon={ShieldAlert}>
          {allergies.map((a, k) => (
            <AlertItem
              key={k}
              title={`${a.allergene} ↔ ${a.medicament}`}
              severite={a.severite ?? "majeure"}
              risque={a.risque}
              recommandation={a.recommandation}
              reference={a.reference}
            />
          ))}
        </Section>
      )}

      {hautRisque.length > 0 && (
        <Section title="Médicaments à haut risque" count={hautRisque.length} icon={ShieldAlert}>
          {hautRisque.map((h, k) => (
            <AlertItem
              key={k}
              title={h.medicament}
              subtitle={`Classe : ${h.classe}`}
              severite={h.severite ?? "majeure"}
              mecanisme={h.raison}
              risque={h.risque}
              recommandation={h.recommandation}
              reference={h.reference}
            />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ title, count, icon: Icon, children }: { title: string; count: number; icon: typeof AlertTriangle; children: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-white p-3">
      <div className="flex items-center gap-2 font-medium text-sm mb-2">
        <Icon className="h-4 w-4 text-primary" /> {title}
        <Badge variant="secondary" className="ml-1">{count}</Badge>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
