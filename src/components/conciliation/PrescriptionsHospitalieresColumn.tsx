import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Hospital, Pill, Plus, Trash2, Sparkles, Sunrise, Sun, Sunset, Moon, AlertTriangle, Check, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { PrescriptionHospitaliereUploader } from "./PrescriptionHospitaliereUploader";
import { MatchStatusBadge, MatchLegend } from "./MatchStatusBadge";
import {
  matchPrescription,
  STATUS_META,
  type MatchStatus,
  type DomicileTraitement,
  type HospPrescription,
} from "@/lib/conciliation/prescriptionMatch";
import { matchPrescriptionAI } from "@/lib/conciliation/matchPrescriptionAI.functions";
import { scoreOmissionsSeverity } from "@/lib/conciliation/scoreOmissions.functions";
import { ShieldAlert } from "lucide-react";

type Prescription = {
  id: string;
  medicament: string;
  nom_commercial: string | null;
  dosage: string | null;
  dosage_unite: string | null;
  posologie: string | null;
  posologie_matin: string | null;
  posologie_midi: string | null;
  posologie_soir: string | null;
  posologie_coucher: string | null;
  voie_administration: string | null;
  indication: string | null;
  prescripteur: string | null;
  source: string | null;
  match_status: string | null;
  match_reason: string | null;
  match_source: string | null;
  match_recommandation: string | null;
};

const SOURCE_LABEL: Record<string, string> = {
  ordonnance_ocr: "Ordonnance OCR",
  ordonnance: "Ordonnance",
  manuel: "Manuel",
  autre: "Autre",
};

function PriseCell({
  value,
  icon: Icon,
  label,
  shortLabel,
}: {
  value: string | null;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  shortLabel: string;
}) {
  const normalizedValue = value?.trim() ?? "";
  const active = normalizedValue !== "" && normalizedValue !== "0";
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            aria-label={`${label} : ${active ? normalizedValue : "aucune prise"}`}
            className={`flex h-12 w-12 flex-col items-center justify-center rounded-md border text-[11px] font-semibold transition-colors ${
              active
                ? "border-primary/50 bg-primary/10 text-primary shadow-sm"
                : "border-border bg-muted/30 text-muted-foreground/45"
            }`}
          >
            <span className="mb-0.5 flex items-center gap-0.5 text-[9px] uppercase leading-none text-current">
              <Icon className="h-4 w-4" />
              {shortLabel}
            </span>
            <span className="leading-none">{active ? normalizedValue : "—"}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Parse "1-0-1", "1—1—1", "1-1-1-0", "1/0/1/0" → [matin, midi, soir, coucher]. */
function parsePosologie(s: string | null): [string | null, string | null, string | null, string | null] {
  if (!s) return [null, null, null, null];
  const parts = s.split(/[-—–\/]/).map((p) => p.trim()).filter((p) => /^\d+([.,]\d+)?$/.test(p));
  if (parts.length === 3) return [parts[0], parts[1], parts[2], null];
  if (parts.length === 4) return [parts[0], parts[1], parts[2], parts[3]];
  return [null, null, null, null];
}

function resolvePrises(p: Prescription): [string | null, string | null, string | null, string | null] {
  if (p.posologie_matin || p.posologie_midi || p.posologie_soir || p.posologie_coucher) {
    return [p.posologie_matin, p.posologie_midi, p.posologie_soir, p.posologie_coucher];
  }
  return parsePosologie(p.posologie);
}
function dciKey(s: string | null | undefined): string {
  const raw = (s ?? "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return raw.split(" ")[0] ?? "";
}

type Omission = { id: string; episode_id: string; traitement_id: string; justifiee: boolean; commentaire: string | null };


export function PrescriptionsHospitalieresColumn({ episodeId, patientId }: { episodeId: string; patientId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [justifyId, setJustifyId] = useState<string | null>(null);
  const [justifyText, setJustifyText] = useState("");


  const { data = [] } = useQuery({
    queryKey: ["prescriptions", episodeId],
    queryFn: async () =>
      ((
        await supabase
          .from("prescriptions_hospitalieres")
          .select("*")
          .eq("episode_id", episodeId)
          .eq("actif", true)
          .order("created_at", { ascending: false })
      ).data ?? []) as unknown as Prescription[],
  });

  const { data: domicile = [] } = useQuery({
    queryKey: ["traitements", patientId],
    queryFn: async () =>
      ((
        await supabase
          .from("traitements_habituels")
          .select("id,dci,nom_commercial,dosage,dosage_unite,voie_administration,posologie_matin,posologie_midi,posologie_soir,posologie_coucher,posologie_texte")
          .eq("patient_id", patientId)
          .eq("actif", true)
      ).data ?? []) as unknown as DomicileTraitement[],
  });

  const { data: omissions = [] } = useQuery({
    queryKey: ["prescription_omissions", episodeId],
    queryFn: async () =>
      ((
        await supabase
          .from("prescription_omissions" as never)
          .select("*")
          .eq("episode_id", episodeId)
      ).data ?? []) as unknown as Omission[],
  });

  const presentKeys = new Set(
    data.map((p) => dciKey(p.medicament ?? p.nom_commercial ?? "")).filter(Boolean),
  );
  const justifiedTraitementIds = new Set(omissions.filter((o) => o.justifiee).map((o) => o.traitement_id));
  const missingTreatmentsRaw = domicile.filter((t) => {
    if (justifiedTraitementIds.has(t.id)) return false;
    const k = dciKey(t.dci ?? t.nom_commercial ?? "");
    return k.length > 0 && !presentKeys.has(k);
  });

  const scoreOmissions = useServerFn(scoreOmissionsSeverity);
  const missingIdsKey = missingTreatmentsRaw.map((t) => t.id).sort().join(",");
  const { data: severityMap = {} } = useQuery({
    queryKey: ["omission_severity", episodeId, missingIdsKey],
    enabled: missingTreatmentsRaw.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const items = missingTreatmentsRaw.map((t) => ({
        traitement_id: t.id,
        dci: t.dci ?? t.nom_commercial ?? "?",
        atc_class: null,
      }));
      const r = await scoreOmissions({ data: { episodeId, patientId, items } });
      const map: Record<string, { severity_score: number; level: "high" | "moderate" | "low" }> = {};
      for (const x of r.results) map[x.traitement_id] = { severity_score: x.severity_score, level: x.level };
      return map;
    },
  });

  const missingTreatments = [...missingTreatmentsRaw].sort((a, b) => {
    const sa = severityMap[a.id]?.severity_score ?? 0;
    const sb = severityMap[b.id]?.severity_score ?? 0;
    return sb - sa;
  });
  const highCount = missingTreatments.filter((t) => severityMap[t.id]?.level === "high").length;

  const addFromDomicile = useMutation({
    mutationFn: async (t: DomicileTraitement) => {
      const { error } = await supabase.from("prescriptions_hospitalieres").insert({
        episode_id: episodeId,
        patient_id: patientId,
        medicament: t.dci ?? t.nom_commercial ?? "Médicament",
        nom_commercial: t.nom_commercial ?? null,
        dosage: t.dosage ?? null,
        dosage_unite: t.dosage_unite ?? null,
        voie_administration: t.voie_administration ?? null,
        posologie_matin: t.posologie_matin ?? null,
        posologie_midi: t.posologie_midi ?? null,
        posologie_soir: t.posologie_soir ?? null,
        posologie_coucher: t.posologie_coucher ?? null,
        posologie: t.posologie_texte ?? null,
        source: "omission_corrigee",
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prescriptions", episodeId] });
      toast.success("Traitement ajouté à la prescription hospitalière");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const justifyOmission = useMutation({
    mutationFn: async ({ traitementId, commentaire }: { traitementId: string; commentaire: string }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("prescription_omissions" as never).upsert(
        {
          episode_id: episodeId,
          traitement_id: traitementId,
          justifiee: true,
          commentaire: commentaire || null,
          created_by: u.user?.id ?? null,
        } as never,
        { onConflict: "episode_id,traitement_id" } as never,
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prescription_omissions", episodeId] });
      setJustifyId(null);
      setJustifyText("");
      toast.success("Omission marquée comme souhaitée");
    },
    onError: (e) => toast.error((e as Error).message),
  });


  const runAI = useServerFn(matchPrescriptionAI);
  const evaluatedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!data.length) return;
    for (const p of data) {
      if (p.match_status && p.match_status !== "en_cours") continue;
      if (evaluatedRef.current.has(p.id)) continue;
      evaluatedRef.current.add(p.id);

      const result = matchPrescription(p as HospPrescription, domicile);
      const initialStatus: MatchStatus = result.needsAI ? "en_cours" : result.status;

      void supabase
        .from("prescriptions_hospitalieres")
        .update({
          match_status: initialStatus,
          match_reason: result.reason,
          match_source: "deterministe",
          match_analyzed_at: new Date().toISOString(),
        })
        .eq("id", p.id)
        .then(() => {
          if (!result.needsAI) {
            qc.invalidateQueries({ queryKey: ["prescriptions", episodeId] });
            return;
          }
          runAI({ data: { prescriptionId: p.id, patientId } })
            .catch(() => {
              // Si l'IA échoue, on conserve l'analyse déterministe sans afficher de trace technique.
              supabase
                .from("prescriptions_hospitalieres")
                .update({
                  match_status: result.status === "gris" ? "gris" : "orange",
                  match_reason: result.reason,
                  match_source: "deterministe",
                })
                .eq("id", p.id)
                .then(() => qc.invalidateQueries({ queryKey: ["prescriptions", episodeId] }));
            })
            .finally(() => {
              qc.invalidateQueries({ queryKey: ["prescriptions", episodeId] });
            });
        });
    }
  }, [data, domicile, runAI, qc, episodeId, patientId]);



  const add = useMutation({
    mutationFn: async (v: Record<string, string>) => {
      if (!v.medicament) throw new Error("Médicament requis");
      const { error } = await supabase.from("prescriptions_hospitalieres").insert({
        episode_id: episodeId,
        patient_id: patientId,
        medicament: v.medicament,
        dosage: v.dosage || null,
        dosage_unite: v.dosage_unite || null,
        voie_administration: v.voie_administration || null,
        posologie_matin: v.posologie_matin || null,
        posologie_midi: v.posologie_midi || null,
        posologie_soir: v.posologie_soir || null,
        posologie_coucher: v.posologie_coucher || null,
        posologie: v.posologie || null,
        indication: v.indication || null,
        source: "manuel",
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prescriptions", episodeId] });
      setOpen(false);
      toast.success("Prescription ajoutée");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("prescriptions_hospitalieres").update({ actif: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prescriptions", episodeId] }),
  });

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Hospital className="h-4 w-4" /> Prescriptions hospitalières ({data.length})
        </CardTitle>
        <Button size="icon" variant="ghost" onClick={() => setOpen((o) => !o)}>
          <Plus className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {missingTreatments.length > 0 && (
          <div className="rounded-md border border-amber-300/60 bg-amber-50/60 dark:bg-amber-950/20 p-2 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-900 dark:text-amber-200 flex-wrap">
              <AlertTriangle className="h-3.5 w-3.5" />
              {missingTreatments.length} médicament{missingTreatments.length > 1 ? "s" : ""} du domicile non repris
              {highCount > 0 && (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4 ml-1">
                  <ShieldAlert className="h-3 w-3 mr-0.5" />{highCount} grave{highCount > 1 ? "s" : ""}
                </Badge>
              )}
            </div>
            <div className="space-y-1.5">
              {missingTreatments.map((t) => {
                const sev = severityMap[t.id];
                const sevBadge = sev ? (
                  sev.level === "high" ? (
                    <TooltipProvider delayDuration={150}><Tooltip><TooltipTrigger asChild>
                      <Badge variant="destructive" className="text-[10px] px-1 py-0 h-4 gap-0.5"><ShieldAlert className="h-3 w-3" />Grave</Badge>
                    </TooltipTrigger><TooltipContent>Score ML omission&nbsp;: {sev.severity_score.toFixed(2)} — médicament à haut risque</TooltipContent></Tooltip></TooltipProvider>
                  ) : sev.level === "moderate" ? (
                    <TooltipProvider delayDuration={150}><Tooltip><TooltipTrigger asChild>
                      <Badge className="text-[10px] px-1 py-0 h-4 bg-orange-500 hover:bg-orange-600 text-white">Modéré</Badge>
                    </TooltipTrigger><TooltipContent>Score ML omission&nbsp;: {sev.severity_score.toFixed(2)}</TooltipContent></Tooltip></TooltipProvider>
                  ) : (
                    <TooltipProvider delayDuration={150}><Tooltip><TooltipTrigger asChild>
                      <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">Faible</Badge>
                    </TooltipTrigger><TooltipContent>Score ML omission&nbsp;: {sev.severity_score.toFixed(2)}</TooltipContent></Tooltip></TooltipProvider>
                  )
                ) : null;
                return (
                <div key={t.id} className="rounded border border-amber-200/70 bg-background/70 p-2 text-xs space-y-1.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Pill className="h-3 w-3 text-amber-600 shrink-0" />
                    <span className="font-medium">{t.dci ?? t.nom_commercial}</span>
                    {sevBadge}
                    {t.dosage && (
                      <Badge variant="outline" className="font-mono text-[10px] px-1 py-0">
                        {t.dosage}{t.dosage_unite ? ` ${t.dosage_unite}` : ""}
                      </Badge>
                    )}
                    {t.voie_administration && (
                      <Badge variant="secondary" className="text-[10px] px-1 py-0">{t.voie_administration}</Badge>
                    )}
                    {(t.posologie_matin || t.posologie_midi || t.posologie_soir || t.posologie_coucher || t.posologie_texte) && (
                      <span className="text-[11px] text-muted-foreground">
                        {t.posologie_texte ?? `${t.posologie_matin ?? 0}-${t.posologie_midi ?? 0}-${t.posologie_soir ?? 0}${t.posologie_coucher ? `-${t.posologie_coucher}` : ""}`}
                      </span>
                    )}
                  </div>
                  {justifyId === t.id ? (
                    <div className="space-y-1.5">
                      <Textarea
                        value={justifyText}
                        onChange={(e) => setJustifyText(e.target.value)}
                        placeholder="Justification (optionnelle) : motif clinique de l'omission…"
                        className="text-xs min-h-[60px]"
                      />
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          className="h-7"
                          onClick={() => justifyOmission.mutate({ traitementId: t.id, commentaire: justifyText })}
                          disabled={justifyOmission.isPending}
                        >
                          <Check className="h-3 w-3 mr-1" /> Valider
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7"
                          onClick={() => { setJustifyId(null); setJustifyText(""); }}
                        >
                          <X className="h-3 w-3 mr-1" /> Annuler
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        variant="default"
                        className="h-7"
                        onClick={() => addFromDomicile.mutate(t)}
                        disabled={addFromDomicile.isPending}
                      >
                        <Plus className="h-3 w-3 mr-1" /> Ajouter le traitement
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7"
                        onClick={() => { setJustifyId(t.id); setJustifyText(""); }}
                      >
                        Omission souhaitée
                      </Button>
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          </div>
        )}


        {open && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const v: Record<string, string> = {};
              [
                "medicament", "dosage", "dosage_unite", "voie_administration",
                "posologie_matin", "posologie_midi", "posologie_soir", "posologie_coucher",
                "posologie", "indication",
              ].forEach((k) => {
                const val = fd.get(k);
                if (val) v[k] = String(val);
              });
              add.mutate(v);
            }}
            className="space-y-2 border rounded-md p-2"
          >
            <div>
              <Label className="text-xs">Médicament (DCI)</Label>
              <Input name="medicament" required className="h-8" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Dosage</Label>
                <Input name="dosage" className="h-8" />
              </div>
              <div>
                <Label className="text-xs">Unité</Label>
                <Input name="dosage_unite" className="h-8" placeholder="mg" />
              </div>
              <div>
                <Label className="text-xs">Voie</Label>
                <Input name="voie_administration" className="h-8" placeholder="PO" />
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <div>
                <Label className="text-xs">Matin</Label>
                <Input name="posologie_matin" className="h-8" />
              </div>
              <div>
                <Label className="text-xs">Midi</Label>
                <Input name="posologie_midi" className="h-8" />
              </div>
              <div>
                <Label className="text-xs">Soir</Label>
                <Input name="posologie_soir" className="h-8" />
              </div>
              <div>
                <Label className="text-xs">Coucher</Label>
                <Input name="posologie_coucher" className="h-8" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Posologie (texte libre)</Label>
              <Input name="posologie" className="h-8" />
            </div>
            <div>
              <Label className="text-xs">Indication</Label>
              <Input name="indication" className="h-8" />
            </div>
            <Button type="submit" size="sm" className="w-full">
              Ajouter
            </Button>
          </form>
        )}

        {data.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <Pill className="h-8 w-8 mx-auto mb-2 opacity-40" />
            Aucune prescription hospitalière
          </div>
        ) : (
          <div className="divide-y">
            <div className="px-3 py-1.5 bg-muted/40 border-b">
              <MatchLegend />
            </div>
            <div className="hidden md:grid grid-cols-[auto_1fr_auto_auto_auto] gap-2 px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground bg-muted/40">
              <div></div>
              <div>Médicament</div>
              <div className="text-center">M • Mi • S • Co</div>
              <div>Indication / Source</div>
              <div></div>
            </div>
            {data.map((p) => {
              const [m, mi, s, c] = resolvePrises(p);
              const hasPrises = m || mi || s || c;
              const status = (p.match_status as MatchStatus) ?? "en_cours";
              const meta = STATUS_META[status] ?? STATUS_META.en_cours;
              return (
              <div
                key={p.id}
                className={`grid grid-cols-1 md:grid-cols-[auto_1fr_auto_auto_auto] gap-2 px-3 py-2 items-center hover:bg-muted/30 transition-colors text-xs ${meta.bg} ${meta.border}`}
              >
                <MatchStatusBadge
                  status={status}
                  reason={p.match_reason}
                  recommandation={p.match_recommandation}
                  source={p.match_source}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Pill className="h-3 w-3 text-primary shrink-0" />
                    <span className="font-medium truncate text-xs">{p.medicament}</span>
                    {p.dosage && (
                      <Badge variant="outline" className="font-mono text-[10px] px-1 py-0">
                        {p.dosage}{p.dosage_unite ? ` ${p.dosage_unite}` : ""}
                      </Badge>
                    )}
                    {p.voie_administration && (
                      <Badge variant="secondary" className="text-[10px] px-1 py-0">{p.voie_administration}</Badge>
                    )}
                  </div>
                  {p.nom_commercial && p.nom_commercial !== p.medicament && (
                    <div className="text-[11px] text-muted-foreground ml-4 mt-0.5">{p.nom_commercial}</div>
                  )}
                  {p.posologie && !hasPrises && (
                    <div className="text-[11px] text-muted-foreground ml-4 mt-0.5">{p.posologie}</div>
                  )}
                </div>

                <div className="flex gap-1 justify-start md:justify-center">
                  <PriseCell value={m} icon={Sunrise} label="Matin" shortLabel="M" />
                  <PriseCell value={mi} icon={Sun} label="Midi" shortLabel="Mi" />
                  <PriseCell value={s} icon={Sunset} label="Soir" shortLabel="S" />
                  <PriseCell value={c} icon={Moon} label="Coucher" shortLabel="Co" />
                </div>

                <div className="flex flex-col gap-0.5 text-[11px] min-w-[120px]">
                  {p.indication && <span className="text-foreground/80">{p.indication}</span>}
                  {p.prescripteur && (
                    <span className="text-muted-foreground">Prescripteur : {p.prescripteur}</span>
                  )}
                  {p.source && (
                    <span className="text-muted-foreground">
                      Source : {SOURCE_LABEL[p.source] ?? p.source}
                    </span>
                  )}
                </div>

                <div className="flex justify-end">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => del.mutate(p.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              );
            })}
          </div>
        )}

        <div className="pt-2 border-t">
          <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
            <Sparkles className="h-3 w-3" /> Importer par OCR
          </div>
          <PrescriptionHospitaliereUploader episodeId={episodeId} patientId={patientId} />
        </div>
      </CardContent>
    </Card>
  );
}
