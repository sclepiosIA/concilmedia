import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Pill, Euro } from "lucide-react";
import type { AIAnalysisPayload } from "@/lib/conciliation/analyze.functions";

export function ShortagesEconomicsPanel({ payload }: { payload: AIAnalysisPayload }) {
  const tensions = payload.tensions_approvisionnement ?? [];
  const relais = payload.relais_iv_po ?? [];
  const eco = payload.economie;
  const hasAny = tensions.length > 0 || relais.length > 0 || (eco && (eco.substitutions_generiques?.length ?? 0) > 0);
  if (!hasAny) return null;

  return (
    <div className="space-y-3">
      {tensions.length > 0 && (
        <Card className="border-amber-300 bg-amber-50/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-amber-900">
              <AlertTriangle className="h-4 w-4" /> Tensions & ruptures d'approvisionnement
              <Badge variant="secondary" className="ml-auto text-[10px]">{tensions.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {tensions.map((t, i) => (
              <div key={i} className="rounded-md border bg-white p-2 text-xs space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{t.medicament}</span>
                  <Badge variant="outline" className="text-[10px] uppercase">{t.statut}</Badge>
                </div>
                {t.raison && <div className="text-muted-foreground"><span className="font-medium">Cause:</span> {t.raison}</div>}
                {t.alternative && <div><span className="font-medium">Alternative:</span> {t.alternative}</div>}
                {t.recommandation && <div className="text-amber-900"><span className="font-medium">→</span> {t.recommandation}</div>}
                {t.reference && <div className="text-[10px] text-muted-foreground">Réf : {t.reference}</div>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {relais.length > 0 && (
        <Card className="border-emerald-300 bg-emerald-50/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-emerald-900">
              <Pill className="h-4 w-4" /> Relais IV → PO suggérés
              <Badge variant="secondary" className="ml-auto text-[10px]">{relais.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {relais.map((r, i) => (
              <div key={i} className="rounded-md border bg-white p-2 text-xs space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">{r.medicament}</span>
                  <Badge variant="outline" className="text-[10px]">{r.voie_actuelle} → PO</Badge>
                  <span className="text-muted-foreground text-[10px]">Biodispo PO {Math.round((r.biodisponibilite_po ?? 0) * 100)}%</span>
                </div>
                <div><span className="font-medium">Posologie PO :</span> {r.posologie_po_proposee}</div>
                {r.critere_clinique && <div className="text-muted-foreground">{r.critere_clinique}</div>}
                {r.economie_eur_jour ? <div className="text-emerald-900">Économie ≈ {r.economie_eur_jour.toFixed(2)} €/jour</div> : null}
                {r.reference && <div className="text-[10px] text-muted-foreground">Réf : {r.reference}</div>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {eco && (eco.cout_journalier_total_eur > 0 || (eco.substitutions_generiques?.length ?? 0) > 0) && (
        <Card className="border-violet-300 bg-violet-50/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-violet-900">
              <Euro className="h-4 w-4" /> Médico-économie
              <Badge variant="secondary" className="ml-auto text-[10px]">
                {eco.cout_journalier_total_eur.toFixed(2)} €/jour
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {eco.synthese_medicoeconomique && (
              <p className="text-xs leading-relaxed">{eco.synthese_medicoeconomique}</p>
            )}
            {(eco.substitutions_generiques?.length ?? 0) > 0 && (
              <div className="rounded-md border bg-white p-2 space-y-1">
                <div className="text-[11px] font-semibold text-violet-900">Substitutions génériques proposées</div>
                <ul className="space-y-1">
                  {eco.substitutions_generiques.map((s, i) => (
                    <li key={i} className="text-xs border-l-2 border-violet-300 pl-2">
                      <span className="font-medium">{s.medicament}</span> → {s.generique_propose}
                      {s.economie_eur_par_jour ? (
                        <span className="text-violet-900"> · −{s.economie_eur_par_jour.toFixed(2)} €/j</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
