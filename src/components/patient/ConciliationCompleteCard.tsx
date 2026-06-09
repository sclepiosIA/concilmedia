import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Loader2, ClipboardList, Stethoscope, Activity, ShieldAlert, FileText, ShieldCheck, Pencil, ArrowLeftRight, AlertCircle, Clock } from "lucide-react";
import { analyzePatientConciliationComplete } from "@/lib/conciliation/analyzePatientConciliationComplete.functions";
import type { AIAnalysisPayload } from "@/lib/conciliation/analyze.functions";
import { ClinicalAlertsPanel } from "@/components/conciliation/ClinicalAlertsPanel";
import {
  saveConciliationValidation,
  getConciliationValidation,
  deleteConciliationValidation,
  type ItemDecision,
} from "@/lib/conciliation/validateConciliation.functions";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import { fr } from "date-fns/locale";

function decisionKey(category: ItemDecision["category"], index: number) {
  return `${category}:${index}`;
}

export function ConciliationCompleteCard({ patientId }: { patientId: string }) {
  const qc = useQueryClient();
  const analyzeFn = useServerFn(analyzePatientConciliationComplete);
  const saveFn = useServerFn(saveConciliationValidation);
  const getValidationFn = useServerFn(getConciliationValidation);
  const deleteValidationFn = useServerFn(deleteConciliationValidation);

  const { data: latest } = useQuery({
    queryKey: ["patient-conciliation-complete", patientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("conciliation_ai_analyses")
        .select("*")
        .eq("patient_id", patientId)
        .is("episode_id", null)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .eq("analysis_type" as any, "conciliation_complete")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const analysisId = latest?.id;

  const { data: validation } = useQuery({
    queryKey: ["conciliation-validation", analysisId],
    queryFn: () => (analysisId ? getValidationFn({ data: { analysisId } }) : null),
    enabled: !!analysisId,
  });

  const mut = useMutation({
    mutationFn: () => analyzeFn({ data: { patientId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patient-conciliation-complete", patientId] });
      toast.success("Conciliation pharmaceutique complète terminée");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur IA"),
  });

  const payload = latest?.payload as unknown as AIAnalysisPayload | undefined;

  // ---- local validation state ----
  const [decisions, setDecisions] = useState<Record<string, ItemDecision>>({});
  const [pharmacienNom, setPharmacienNom] = useState("");
  const [commentaireGlobal, setCommentaireGlobal] = useState("");
  const [editingValidation, setEditingValidation] = useState(false);

  // Hydrate local state from saved validation OR from auth user
  useEffect(() => {
    if (validation) {
      const next: Record<string, ItemDecision> = {};
      const raw = (validation.item_decisions ?? []) as ItemDecision[];
      for (const d of raw) next[decisionKey(d.category, d.index)] = d;
      setDecisions(next);
      setPharmacienNom(validation.pharmacien_nom ?? "");
      setCommentaireGlobal(validation.commentaire_global ?? "");
      setEditingValidation(false);
    } else {
      setDecisions({});
      setCommentaireGlobal("");
      // prefill from auth user
      supabase.auth.getUser().then(({ data }) => {
        const u = data.user;
        if (!u) return;
        const fullName =
          (u.user_metadata?.full_name as string | undefined) ||
          (u.user_metadata?.name as string | undefined) ||
          u.email ||
          "";
        setPharmacienNom((prev) => prev || fullName);
      });
    }
  }, [validation, analysisId]);

  const isLocked = !!validation && !editingValidation;

  const handleDecision = (key: string, decision: ItemDecision | null) => {
    setDecisions((prev) => {
      const next = { ...prev };
      if (decision === null) delete next[key];
      else next[key] = decision;
      return next;
    });
  };

  const totalAlertes = payload
    ? (payload.divergences_conciliation?.length ?? 0) +
      (payload.interactions?.length ?? 0) +
      (payload.contre_indications?.length ?? 0) +
      (payload.adaptations_posologiques?.length ?? 0) +
      (payload.doublons_therapeutiques?.length ?? 0) +
      (payload.medicaments_haut_risque?.length ?? 0) +
      (payload.allergies_croisees?.length ?? 0)
    : 0;

  const counts = useMemo(() => {
    const c = { accepted: 0, modified: 0, rejected: 0 };
    for (const d of Object.values(decisions)) c[d.status]++;
    return c;
  }, [decisions]);

  const saveMut = useMutation({
    mutationFn: () => {
      if (!analysisId) throw new Error("Aucune analyse à valider");
      if (!pharmacienNom.trim()) throw new Error("Nom du pharmacien requis");
      return saveFn({
        data: {
          analysisId,
          patientId,
          pharmacienNom: pharmacienNom.trim(),
          commentaireGlobal: commentaireGlobal.trim() || undefined,
          itemDecisions: Object.values(decisions),
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conciliation-validation", analysisId] });
      toast.success("Conciliation validée");
      setEditingValidation(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  const cancelMut = useMutation({
    mutationFn: () => {
      if (!analysisId) throw new Error("Aucune analyse");
      return deleteValidationFn({ data: { analysisId } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conciliation-validation", analysisId] });
      toast.success("Validation annulée");
      setEditingValidation(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  return (
    <div className="space-y-4">
      {/* Header status + actions */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {validation ? (
            <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white">
              <ShieldCheck className="h-3 w-3 mr-1" />
              Validée par {validation.pharmacien_nom ?? "—"} • {format(new Date(validation.validated_at), "d MMM yyyy 'à' HH:mm", { locale: fr })}
            </Badge>
          ) : payload ? (
            <Badge variant="outline" className="border-amber-400 text-amber-700">À valider</Badge>
          ) : null}
          {latest?.created_at && (
            <span className="text-xs text-muted-foreground">
              Analyse {formatDistanceToNow(new Date(latest.created_at), { addSuffix: true, locale: fr })}
            </span>
          )}
        </div>
        <Button onClick={() => mut.mutate()} disabled={mut.isPending} size="sm" variant={payload ? "outline" : "default"}>
          {mut.isPending ? (
            <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Analyse en cours…</>
          ) : (
            <><Sparkles className="h-4 w-4 mr-1" /> {payload ? "Relancer l'IA" : "Lancer la conciliation complète"}</>
          )}
        </Button>
      </div>

      {!payload && !mut.isPending && (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          Cliquez sur « Lancer la conciliation complète » pour analyser le dossier (traitements ville, prescriptions hospitalières, biologie, allergies, comorbidités).
        </div>
      )}

      {payload && (
        <>
          <section className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4 space-y-3">
            <header className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">A. Résultats de conciliation médicamenteuse</h3>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="text-[10px]">
                  {totalAlertes} problème{totalAlertes > 1 ? "s" : ""}
                </Badge>
                {totalAlertes > 0 && (
                  <>
                    <Badge className="text-[10px] bg-emerald-600 hover:bg-emerald-600">✓ {counts.accepted}</Badge>
                    <Badge className="text-[10px] bg-amber-600 hover:bg-amber-600">✎ {counts.modified}</Badge>
                    <Badge className="text-[10px] bg-slate-600 hover:bg-slate-600">✗ {counts.rejected}</Badge>
                  </>
                )}
              </div>
            </header>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Comparaison traitements ville ↔ prescriptions hospitalières dans le contexte clinique. Validez chaque alerte (accepter / modifier / refuser).
            </p>
            {totalAlertes > 0 ? (
              <ClinicalAlertsPanel
                payload={payload}
                validation={{
                  decisions,
                  onDecision: handleDecision,
                  readOnly: isLocked,
                }}
              />
            ) : (
              <p className="text-xs text-muted-foreground italic">Aucun problème médicamenteux détecté.</p>
            )}
          </section>

          <section className="rounded-lg border-2 border-sky-300 bg-sky-50/60 p-4 space-y-3">
            <header className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Stethoscope className="h-4 w-4 text-sky-700" />
                <h3 className="text-sm font-semibold text-sky-900">B. Aide à la décision pharmaceutique</h3>
              </div>
              <Badge
                variant={payload.score_risque > 60 ? "destructive" : payload.score_risque > 30 ? "default" : "secondary"}
                className="text-[10px]"
              >
                Score de risque {payload.score_risque}/100
              </Badge>
            </header>

            {payload.synthese && (
              <div className="rounded-md border bg-white p-3 space-y-1">
                <div className="flex items-center gap-2 text-xs font-semibold text-sky-900">
                  <FileText className="h-3.5 w-3.5" /> Synthèse de conciliation
                </div>
                <p className="text-xs leading-relaxed">{payload.synthese}</p>
              </div>
            )}

            {payload.divergences_conciliation && payload.divergences_conciliation.length > 0 && (
              <div className="rounded-md border bg-white p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-sky-900">
                  <ArrowLeftRight className="h-3.5 w-3.5" /> Tableau des divergences ville ↔ hôpital
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead className="text-muted-foreground">
                      <tr className="border-b">
                        <th className="text-left py-1 pr-2 font-medium">Type</th>
                        <th className="text-left py-1 pr-2 font-medium">Ville</th>
                        <th className="text-left py-1 pr-2 font-medium">Hôpital</th>
                        <th className="text-left py-1 pr-2 font-medium">Sévérité</th>
                        <th className="text-left py-1 font-medium">Action recommandée</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payload.divergences_conciliation.map((d, i) => {
                        const sevColor =
                          d.severite === "critique" ? "bg-red-700 text-white" :
                          d.severite === "majeure" ? "bg-red-600 text-white" :
                          d.severite === "moderee" ? "bg-orange-500 text-white" :
                          "bg-yellow-500 text-white";
                        const typeLabels: Record<string, string> = {
                          omission: "Omission",
                          ajout_non_justifie: "Ajout non justifié",
                          switch: "Switch",
                          modification_posologie: "Modif. posologie",
                          substitution_classe: "Substitution classe",
                        };
                        return (
                          <tr key={i} className="border-b last:border-0 align-top">
                            <td className="py-1.5 pr-2"><Badge variant="outline" className="text-[10px]">{typeLabels[d.type] ?? d.type}</Badge></td>
                            <td className="py-1.5 pr-2">{d.medicament_ville ?? <span className="text-muted-foreground italic">—</span>}</td>
                            <td className="py-1.5 pr-2">{d.medicament_hopital ?? <span className="text-muted-foreground italic">—</span>}</td>
                            <td className="py-1.5 pr-2"><Badge className={`text-[10px] ${sevColor}`}>{d.severite}</Badge></td>
                            <td className="py-1.5 leading-snug">{d.recommandation}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {payload.actions_prioritaires && payload.actions_prioritaires.length > 0 && (
              <div className="rounded-md border bg-white p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-sky-900">
                  <AlertCircle className="h-3.5 w-3.5" /> Actions pharmaceutiques prioritaires
                </div>
                <ul className="space-y-2">
                  {payload.actions_prioritaires
                    .slice()
                    .sort((a, b) => {
                      const order = { immediate: 0, "24h": 1, differee: 2 } as const;
                      return (order[a.urgence as keyof typeof order] ?? 3) - (order[b.urgence as keyof typeof order] ?? 3);
                    })
                    .map((a, i) => {
                      const urgenceColor =
                        a.urgence === "immediate" ? "bg-red-600 text-white" :
                        a.urgence === "24h" ? "bg-orange-500 text-white" :
                        "bg-slate-500 text-white";
                      const urgenceLabel =
                        a.urgence === "immediate" ? "Immédiat" :
                        a.urgence === "24h" ? "Sous 24h" :
                        "Différé";
                      return (
                        <li key={i} className="text-xs border-l-2 border-sky-300 pl-2 space-y-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge className={`text-[10px] ${urgenceColor}`}><Clock className="h-2.5 w-2.5 mr-0.5" />{urgenceLabel}</Badge>
                            <Badge variant="outline" className="text-[10px]">→ {a.destinataire}</Badge>
                          </div>
                          <div className="font-medium leading-snug">{a.action}</div>
                          {a.justification && <div className="text-muted-foreground leading-snug">{a.justification}</div>}
                        </li>
                      );
                    })}
                </ul>
              </div>
            )}

            {payload.conclusion_clinique && (
              <div className="rounded-md border bg-white p-3 space-y-1">
                <div className="flex items-center gap-2 text-xs font-semibold text-sky-900">
                  <ShieldAlert className="h-3.5 w-3.5" /> Conduite à tenir
                </div>
                <p className="text-xs leading-relaxed">{payload.conclusion_clinique}</p>
              </div>
            )}

            {payload.surveillance && payload.surveillance.length > 0 && (
              <div className="rounded-md border bg-white p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-sky-900">
                  <Activity className="h-3.5 w-3.5" /> Surveillance recommandée
                </div>
                <ul className="space-y-1.5">
                  {payload.surveillance.map((s, i) => (
                    <li key={i} className="text-xs border-l-2 border-sky-300 pl-2">
                      <div className="font-medium">
                        {s.parametre} <span className="text-muted-foreground font-normal">• {s.frequence}</span>
                      </div>
                      <div className="text-muted-foreground leading-snug">{s.justification}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>


          {/* Validation panel */}
          <section className="rounded-lg border-2 border-emerald-300 bg-emerald-50/40 p-4 space-y-3">
            <header className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-700" />
                <h3 className="text-sm font-semibold text-emerald-900">Validation pharmacien</h3>
              </div>
              {isLocked && (
                <Button variant="outline" size="sm" onClick={() => setEditingValidation(true)}>
                  <Pencil className="h-3 w-3 mr-1" /> Modifier la validation
                </Button>
              )}
            </header>

            {isLocked ? (
              <div className="text-xs space-y-1">
                <div>
                  <span className="font-semibold">Pharmacien :</span> {validation?.pharmacien_nom ?? "—"}
                </div>
                <div>
                  <span className="font-semibold">Date :</span>{" "}
                  {validation?.validated_at && format(new Date(validation.validated_at), "d MMMM yyyy 'à' HH:mm", { locale: fr })}
                </div>
                {validation?.commentaire_global && (
                  <div className="mt-2">
                    <div className="font-semibold">Commentaire :</div>
                    <p className="whitespace-pre-wrap text-muted-foreground">{validation.commentaire_global}</p>
                  </div>
                )}
                <div className="mt-2 text-muted-foreground">
                  {counts.accepted} accepté{counts.accepted > 1 ? "s" : ""} • {counts.modified} modifié{counts.modified > 1 ? "s" : ""} • {counts.rejected} refusé{counts.rejected > 1 ? "s" : ""}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold mb-1 block">Nom du pharmacien <span className="text-red-600">*</span></label>
                    <Input
                      value={pharmacienNom}
                      onChange={(e) => setPharmacienNom(e.target.value)}
                      placeholder="Dr. Dupont"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold mb-1 block">Commentaire global (optionnel)</label>
                  <Textarea
                    value={commentaireGlobal}
                    onChange={(e) => setCommentaireGlobal(e.target.value)}
                    placeholder="Synthèse de la conciliation, points transmis au prescripteur…"
                    className="text-xs min-h-[70px]"
                  />
                </div>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="text-xs text-muted-foreground">
                    {counts.accepted} accepté{counts.accepted > 1 ? "s" : ""} • {counts.modified} modifié{counts.modified > 1 ? "s" : ""} • {counts.rejected} refusé{counts.rejected > 1 ? "s" : ""} sur {totalAlertes}
                  </div>
                  <div className="flex gap-2">
                    {editingValidation && (
                      <Button variant="ghost" size="sm" onClick={() => setEditingValidation(false)}>
                        Annuler
                      </Button>
                    )}
                    {validation && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => cancelMut.mutate()}
                        disabled={cancelMut.isPending}
                      >
                        Annuler la validation
                      </Button>
                    )}
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => saveMut.mutate()}
                      disabled={saveMut.isPending || !pharmacienNom.trim()}
                    >
                      {saveMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-1" />}
                      {validation ? "Mettre à jour la validation" : "Valider la conciliation"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
