// Piste #10 v2 — Carte combinée Consentement DMP + Adhérence HMD + Audit + Push MES.
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ShieldCheck,
  ShieldAlert,
  Activity,
  Send,
  History,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  analyzeHmdAdherence,
  listAdherenceSnapshots,
} from "@/lib/dmp/dmpAdherence.functions";
import { pushDocumentToMes, listMesPushes } from "@/lib/dmp/mesPush.functions";
import { getDmpConsent, setDmpConsent, listDmpAudit } from "@/lib/dmp/dmpAudit.functions";

const statutBadge: Record<string, string> = {
  bonne: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  partielle: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  rupture: "bg-rose-500/15 text-rose-700 border-rose-500/30",
  surconsommation: "bg-fuchsia-500/15 text-fuchsia-700 border-fuchsia-500/30",
};

export function DmpAdherenceSection({ patientId }: { patientId: string }) {
  const qc = useQueryClient();
  const [consentOpen, setConsentOpen] = useState(false);

  const fetchConsent = useServerFn(getDmpConsent);
  const fetchSnapshots = useServerFn(listAdherenceSnapshots);
  const fetchPushes = useServerFn(listMesPushes);
  const fetchAudit = useServerFn(listDmpAudit);
  const runAnalyze = useServerFn(analyzeHmdAdherence);
  const runSetConsent = useServerFn(setDmpConsent);
  const runPush = useServerFn(pushDocumentToMes);

  const consentQ = useQuery({
    queryKey: ["dmp-consent", patientId],
    queryFn: () => fetchConsent({ data: { patientId } }),
  });
  const snapsQ = useQuery({
    queryKey: ["dmp-snapshots", patientId],
    queryFn: () => fetchSnapshots({ data: { patientId } }),
  });
  const pushesQ = useQuery({
    queryKey: ["mes-pushes", patientId],
    queryFn: () => fetchPushes({ data: { patientId } }),
  });
  const auditQ = useQuery({
    queryKey: ["dmp-audit", patientId],
    queryFn: () => fetchAudit({ data: { patientId } }),
  });

  const analyzeMut = useMutation({
    mutationFn: () => runAnalyze({ data: { patientId, windowMonths: 6 } }),
    onSuccess: () => {
      toast.success("Analyse d'adhérence calculée");
      qc.invalidateQueries({ queryKey: ["dmp-snapshots", patientId] });
      qc.invalidateQueries({ queryKey: ["dmp-audit", patientId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const consentMut = useMutation({
    mutationFn: (consentement: boolean) => runSetConsent({ data: { patientId, consentement } }),
    onSuccess: () => {
      toast.success("Consentement DMP mis à jour");
      qc.invalidateQueries({ queryKey: ["dmp-consent", patientId] });
      qc.invalidateQueries({ queryKey: ["dmp-audit", patientId] });
      setConsentOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const pushMut = useMutation({
    mutationFn: (documentType: "lettre_liaison" | "bcm" | "plan_pharmaceutique") =>
      runPush({ data: { patientId, documentType, payloadSummary: { from: "fiche_patient" } } }),
    onSuccess: () => {
      toast.success("Document poussé vers Mon Espace Santé (simulé)");
      qc.invalidateQueries({ queryKey: ["mes-pushes", patientId] });
      qc.invalidateQueries({ queryKey: ["dmp-audit", patientId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const consent = consentQ.data?.consentement ?? false;
  const lastSnap = snapsQ.data?.snapshots?.[0] as
    | { id: string; computed_at: string; items: any[]; discrepancies: any[]; summary: any }
    | undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            DMP / Mon Espace Santé — Adhérence & écarts
          </span>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={consent ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700"}
            >
              {consent ? (
                <>
                  <ShieldCheck className="mr-1 h-3 w-3" /> Consentement actif
                </>
              ) : (
                <>
                  <ShieldAlert className="mr-1 h-3 w-3" /> Consentement requis
                </>
              )}
            </Badge>
            <Button size="sm" variant="outline" onClick={() => setConsentOpen(true)}>
              Gérer
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs defaultValue="adherence">
          <TabsList>
            <TabsTrigger value="adherence">Adhérence</TabsTrigger>
            <TabsTrigger value="ecarts">Écarts</TabsTrigger>
            <TabsTrigger value="mes">Push MES</TabsTrigger>
            <TabsTrigger value="audit">Audit</TabsTrigger>
          </TabsList>

          <TabsContent value="adherence" className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Calcule le MPR (Medication Possession Ratio) sur 6 mois à partir du dernier import HMD.
              </div>
              <Button
                size="sm"
                disabled={!consent || analyzeMut.isPending}
                onClick={() => analyzeMut.mutate()}
                title={!consent ? "Consentement DMP requis" : ""}
              >
                {analyzeMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lancer l'analyse"}
              </Button>
            </div>
            {lastSnap && (
              <>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                  <Stat label="Molécules" value={lastSnap.summary?.molecules_analysees ?? 0} />
                  <Stat label="Adhésion moy." value={lastSnap.summary?.adhesion_moyenne ?? 0} />
                  <Stat
                    label="Ruptures"
                    value={lastSnap.summary?.ruptures ?? 0}
                    icon={<TrendingDown className="h-3 w-3 text-rose-500" />}
                  />
                  <Stat
                    label="Surconso."
                    value={lastSnap.summary?.surconsommations ?? 0}
                    icon={<TrendingUp className="h-3 w-3 text-fuchsia-500" />}
                  />
                  <Stat label="Écarts crit." value={lastSnap.summary?.ecarts_critiques ?? 0} />
                </div>
                <div className="rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs uppercase">
                      <tr>
                        <th className="px-3 py-2 text-left">DCI</th>
                        <th className="px-3 py-2 text-right">Délivrances</th>
                        <th className="px-3 py-2 text-right">Intervalle moy.</th>
                        <th className="px-3 py-2 text-right">MPR</th>
                        <th className="px-3 py-2 text-left">Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(lastSnap.items ?? []).map((it: any, i: number) => (
                        <tr key={i} className="border-t">
                          <td className="px-3 py-2 font-medium">{it.dci}</td>
                          <td className="px-3 py-2 text-right">{it.nb_delivrances}</td>
                          <td className="px-3 py-2 text-right">{it.intervalle_moyen_jours ?? "—"} j</td>
                          <td className="px-3 py-2 text-right tabular-nums">{it.mpr}</td>
                          <td className="px-3 py-2">
                            <Badge variant="outline" className={statutBadge[it.statut]}>
                              {it.statut}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                      {(lastSnap.items ?? []).length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                            Aucune molécule analysée.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="text-xs text-muted-foreground">
                  Dernier calcul : {new Date(lastSnap.computed_at).toLocaleString("fr-FR")}
                </div>
              </>
            )}
            {!lastSnap && consent && (
              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                Aucune analyse encore. Importez un HMD puis lancez l'analyse.
              </div>
            )}
            {!consent && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700">
                Le consentement DMP du patient est requis pour analyser les données.
              </div>
            )}
          </TabsContent>

          <TabsContent value="ecarts" className="space-y-2">
            {(lastSnap?.discrepancies ?? []).length === 0 && (
              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                Aucun écart détecté.
              </div>
            )}
            {(lastSnap?.discrepancies ?? []).map((d: any, i: number) => (
              <div
                key={i}
                className={`flex items-start gap-2 rounded-md border p-3 text-sm ${
                  d.severite === "critique"
                    ? "border-rose-500/30 bg-rose-500/5"
                    : "border-amber-500/30 bg-amber-500/5"
                }`}
              >
                {d.severite === "critique" ? (
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-rose-600" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
                )}
                <div className="flex-1">
                  <div className="font-medium">{d.dci}</div>
                  <div className="text-xs text-muted-foreground">{d.details}</div>
                </div>
                <Badge variant="outline">{d.type.replace(/_/g, " ")}</Badge>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="mes" className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={!consent || pushMut.isPending}
                onClick={() => pushMut.mutate("lettre_liaison")}
              >
                <Send className="mr-1 h-4 w-4" /> Pousser lettre de liaison
              </Button>
              <Button size="sm" variant="outline" disabled={!consent} onClick={() => pushMut.mutate("bcm")}>
                <Send className="mr-1 h-4 w-4" /> Pousser BCM
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!consent}
                onClick={() => pushMut.mutate("plan_pharmaceutique")}
              >
                <Send className="mr-1 h-4 w-4" /> Pousser plan pharmaceutique
              </Button>
            </div>
            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase">
                  <tr>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Type</th>
                    <th className="px-3 py-2 text-left">Statut</th>
                    <th className="px-3 py-2 text-left">ACK</th>
                  </tr>
                </thead>
                <tbody>
                  {(pushesQ.data?.pushes ?? []).map((p: any) => (
                    <tr key={p.id} className="border-t">
                      <td className="px-3 py-2">{new Date(p.pushed_at).toLocaleString("fr-FR")}</td>
                      <td className="px-3 py-2">{p.document_type}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className="bg-sky-500/10 text-sky-700">
                          <CheckCircle2 className="mr-1 h-3 w-3" /> {p.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{p.ack_id}</td>
                    </tr>
                  ))}
                  {(pushesQ.data?.pushes ?? []).length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                        Aucun envoi.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="audit" className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <History className="h-3 w-3" /> Journal d'audit DMP/MES (exigence ANS)
            </div>
            <div className="max-h-80 space-y-1 overflow-y-auto rounded-md border p-2">
              {(auditQ.data?.entries ?? []).map((e: any) => (
                <div key={e.id} className="flex items-start gap-2 rounded-sm border-l-2 border-primary/40 bg-muted/30 p-2 text-xs">
                  <span className="font-mono text-muted-foreground">
                    {new Date(e.created_at).toLocaleString("fr-FR")}
                  </span>
                  <span className="font-medium">{e.action}</span>
                  {e.resource && <Badge variant="outline">{e.resource}</Badge>}
                </div>
              ))}
              {(auditQ.data?.entries ?? []).length === 0 && (
                <div className="p-4 text-center text-sm text-muted-foreground">Aucune entrée d'audit.</div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>

      <Dialog open={consentOpen} onOpenChange={setConsentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Consentement DMP / Mon Espace Santé</DialogTitle>
            <DialogDescription>
              Le patient doit consentir à l'accès / l'écriture de son DMP avant toute opération.
              Date actuelle :{" "}
              {consentQ.data?.date ? new Date(consentQ.data.date).toLocaleString("fr-FR") : "—"}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between rounded-md border p-3">
            <span className="text-sm">Consentement actif</span>
            <Switch
              checked={consent}
              onCheckedChange={(v) => consentMut.mutate(v)}
              disabled={consentMut.isPending}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConsentOpen(false)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Stat({ label, value, icon }: { label: string; value: number | string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-muted/20 p-2">
      <div className="flex items-center gap-1 text-[10px] uppercase text-muted-foreground">
        {icon} {label}
      </div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
