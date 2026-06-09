import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, Pill, ShieldAlert, Stethoscope } from "lucide-react";
import type { PatientQuickInfo } from "@/hooks/usePatientsQuickInfo";

interface Props {
  info?: PatientQuickInfo;
}

const SEVERITE_DOT: Record<string, string> = {
  legere: "bg-yellow-500",
  moderee: "bg-orange-500",
  severe: "bg-red-500",
  anaphylaxie: "bg-red-700",
};

const GRAVITE_DOT: Record<string, string> = {
  mineur: "bg-yellow-500",
  modere: "bg-orange-500",
  majeur: "bg-red-500",
  critique: "bg-red-700",
};

function IconBadge({
  icon,
  count,
  label,
  children,
}: {
  icon: React.ReactNode;
  count: number;
  label: string;
  children: React.ReactNode;
}) {
  const muted = count === 0;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-xs ${
            muted ? "opacity-40 border-border" : "border-border bg-muted/50"
          }`}
          aria-label={`${count} ${label}`}
        >
          {icon}
          <span className="font-semibold tabular-nums">{count}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <div className="space-y-1">
          <div className="font-semibold text-xs">{label}</div>
          {children}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export function PatientRowQuickInfo({ info }: Props) {
  const traitements = info?.traitements ?? [];
  const comorbidites = info?.comorbidites ?? [];
  const allergies = info?.allergies ?? [];
  const alertes = info?.alertes ?? [];

  const showT = traitements.slice(0, 8);
  const showC = comorbidites.slice(0, 8);
  const showA = allergies.slice(0, 8);
  const showAl = alertes.slice(0, 5);

  return (
    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <IconBadge
        icon={<Pill className="h-3.5 w-3.5" />}
        count={traitements.length}
        label="Traitements habituels"
      >
        {traitements.length === 0 ? (
          <div className="text-xs opacity-80">Aucun traitement renseigné</div>
        ) : (
          <ul className="text-xs space-y-0.5">
            {showT.map((t) => (
              <li key={t.id}>
                <span className="font-medium">{t.dci ?? t.nom_commercial ?? "—"}</span>
                {(t.dosage || t.dosage_unite) && (
                  <span className="opacity-80"> {t.dosage}{t.dosage_unite ? ` ${t.dosage_unite}` : ""}</span>
                )}
                {t.voie_administration && <span className="opacity-60"> · {t.voie_administration}</span>}
                {t.posologie_texte && <span className="opacity-60"> — {t.posologie_texte}</span>}
              </li>
            ))}
            {traitements.length > showT.length && (
              <li className="opacity-60 italic">…et {traitements.length - showT.length} de plus</li>
            )}
          </ul>
        )}
      </IconBadge>

      <IconBadge
        icon={<Stethoscope className="h-3.5 w-3.5" />}
        count={comorbidites.length}
        label="Antécédents / comorbidités"
      >
        {comorbidites.length === 0 ? (
          <div className="text-xs opacity-80">Aucun antécédent renseigné</div>
        ) : (
          <ul className="text-xs space-y-0.5">
            {showC.map((c) => (
              <li key={c.id}>
                <span className="font-medium">{c.libelle}</span>
                {c.code_cim10 && <span className="opacity-60"> · {c.code_cim10}</span>}
              </li>
            ))}
            {comorbidites.length > showC.length && (
              <li className="opacity-60 italic">…et {comorbidites.length - showC.length} de plus</li>
            )}
          </ul>
        )}
      </IconBadge>

      <IconBadge
        icon={<ShieldAlert className="h-3.5 w-3.5" />}
        count={allergies.length}
        label="Allergies"
      >
        {allergies.length === 0 ? (
          <div className="text-xs opacity-80">Aucune allergie renseignée</div>
        ) : (
          <ul className="text-xs space-y-0.5">
            {showA.map((a) => (
              <li key={a.id} className="flex items-start gap-1.5">
                <span
                  className={`inline-block w-1.5 h-1.5 rounded-full mt-1.5 ${
                    SEVERITE_DOT[a.severite ?? ""] ?? "bg-muted-foreground"
                  }`}
                />
                <span>
                  <span className="font-medium">{a.substance}</span>
                  {a.reaction && <span className="opacity-80"> — {a.reaction}</span>}
                  {a.severite && <span className="opacity-60"> ({a.severite})</span>}
                </span>
              </li>
            ))}
            {allergies.length > showA.length && (
              <li className="opacity-60 italic">…et {allergies.length - showA.length} de plus</li>
            )}
          </ul>
        )}
      </IconBadge>

      <IconBadge
        icon={<AlertTriangle className="h-3.5 w-3.5" />}
        count={alertes.length}
        label="Alertes de conciliation"
      >
        {alertes.length === 0 ? (
          <div className="text-xs opacity-80">Aucune alerte non résolue</div>
        ) : (
          <ul className="text-xs space-y-0.5">
            {showAl.map((a) => (
              <li key={a.id} className="flex items-start gap-1.5">
                <span
                  className={`inline-block w-1.5 h-1.5 rounded-full mt-1.5 ${
                    GRAVITE_DOT[a.gravite ?? ""] ?? "bg-muted-foreground"
                  }`}
                />
                <span>
                  <span className="font-medium">{a.libelle}</span>
                  {a.gravite && <span className="opacity-60"> · {a.gravite}</span>}
                  {a.intention === "non_intentionnel" && <span className="opacity-60"> · NI</span>}
                </span>
              </li>
            ))}
            {alertes.length > showAl.length && (
              <li className="opacity-60 italic">…et {alertes.length - showAl.length} de plus</li>
            )}
          </ul>
        )}
      </IconBadge>
    </div>
  );
}
