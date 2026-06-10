import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Network, Loader2, ShieldCheck, PlugZap } from "lucide-react";
import { listMyOrganizations } from "@/lib/dataIngest/ingestReal.functions";
import { getSihConfig, upsertSihConfig, testSihEndpoint } from "@/lib/sih/sihConfig.functions";
import { listFhirPushLogs } from "@/lib/sih/fhirPush.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/sih-config")({
  head: () => ({ meta: [{ title: "Configuration SIH — ConcilMed" }] }),
  component: SihConfigPage,
  errorComponent: ({ error }) => <div className="p-8 text-destructive">Erreur : {error.message}</div>,
  notFoundComponent: () => <div className="p-8">Introuvable</div>,
});

function SihConfigPage() {
  const listOrgs = useServerFn(listMyOrganizations);
  const getCfg = useServerFn(getSihConfig);
  const upsert = useServerFn(upsertSihConfig);
  const test = useServerFn(testSihEndpoint);
  const listLogs = useServerFn(listFhirPushLogs);

  const orgsQ = useQuery({ queryKey: ["my-orgs"], queryFn: () => listOrgs() });
  const [orgId, setOrgId] = useState("");

  const cfgQ = useQuery({
    queryKey: ["sih-cfg", orgId],
    queryFn: () => getCfg({ data: { organizationId: orgId } }),
    enabled: !!orgId,
  });
  const logsQ = useQuery({
    queryKey: ["sih-logs", orgId],
    queryFn: () => listLogs({ data: { organizationId: orgId } }),
    enabled: !!orgId,
  });

  const [fhirBaseUrl, setFhirBaseUrl] = useState("");
  const [authKind, setAuthKind] = useState<"none" | "bearer" | "hmac">("none");
  const [authSecret, setAuthSecret] = useState("");
  const [insOid, setInsOid] = useState("");
  const [ippAuthorityOid, setIppAuthorityOid] = useState("");
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    const c = cfgQ.data?.config;
    if (c) {
      setFhirBaseUrl(c.fhir_base_url ?? "");
      setAuthKind((c.auth_kind as "none" | "bearer" | "hmac") ?? "none");
      setInsOid(c.ins_oid ?? "");
      setIppAuthorityOid(c.ipp_authority_oid ?? "");
      setIsActive(Boolean(c.is_active));
      setAuthSecret(""); // jamais renvoyé
    }
  }, [cfgQ.data]);

  const saveMut = useMutation({
    mutationFn: () => upsert({
      data: {
        organizationId: orgId,
        fhirBaseUrl: fhirBaseUrl || null,
        authKind,
        authSecret: authSecret || null,
        insOid: insOid || null,
        ippAuthorityOid: ippAuthorityOid || null,
        isActive,
      },
    }),
    onSuccess: () => { toast.success("Configuration enregistrée."); cfgQ.refetch(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Échec"),
  });

  const testMut = useMutation({
    mutationFn: () => test({ data: { organizationId: orgId } }),
    onSuccess: (r) => r.ok ? toast.success(`Connexion OK (HTTP ${r.status}).`) : toast.error(`Échec : ${r.message}`),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Échec"),
  });

  const orgs = orgsQ.data?.orgs ?? [];

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-4xl">
      <header className="flex items-center gap-2">
        <Network className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Configuration SIH</h1>
        <Badge variant="secondary">Piste #6 v2</Badge>
      </header>

      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>Endpoint d'ingestion FHIR</AlertTitle>
        <AlertDescription>
          Votre SIH peut POSTer un Bundle FHIR R4 sur{" "}
          <code className="text-xs">/api/public/fhir/Bundle</code> avec les headers{" "}
          <code className="text-xs">X-ConcilMed-Org</code> (UUID de l'organisation) et{" "}
          <code className="text-xs">X-ConcilMed-Signature</code> (HMAC-SHA256 du body avec le secret
          d'ingestion). Le CapabilityStatement est disponible sur{" "}
          <code className="text-xs">/api/public/fhir/metadata</code>.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader><CardTitle>Organisation</CardTitle></CardHeader>
        <CardContent>
          {orgsQ.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
            <select
              className="w-full border rounded p-2 bg-background"
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
            >
              <option value="">— Sélectionnez —</option>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.nom} ({o.role})</option>)}
            </select>
          )}
        </CardContent>
      </Card>

      {orgId && (
        <>
          <Card>
            <CardHeader><CardTitle>Connexion SIH sortante</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label>URL de base FHIR du SIH (push)</Label>
                <Input value={fhirBaseUrl} onChange={(e) => setFhirBaseUrl(e.target.value)} placeholder="https://sih.exemple.fr/fhir" />
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Mode d'authentification</Label>
                  <select
                    className="w-full border rounded p-2 bg-background"
                    value={authKind}
                    onChange={(e) => setAuthKind(e.target.value as "none" | "bearer" | "hmac")}
                  >
                    <option value="none">Aucune</option>
                    <option value="bearer">Bearer token</option>
                    <option value="hmac">HMAC-SHA256 (signature body)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Secret / Token (laisser vide pour conserver)</Label>
                  <Input type="password" value={authSecret} onChange={(e) => setAuthSecret(e.target.value)} placeholder="•••••••" />
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>OID INS (urn:oid:1.2.250.1.213.1.4.10 pour INS-NIR)</Label>
                  <Input value={insOid} onChange={(e) => setInsOid(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>OID autorité IPP local</Label>
                  <Input value={ippAuthorityOid} onChange={(e) => setIppAuthorityOid(e.target.value)} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={isActive} onCheckedChange={setIsActive} id="active" />
                <Label htmlFor="active">Activer le push vers le SIH</Label>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
                  {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Enregistrer
                </Button>
                <Button variant="outline" onClick={() => testMut.mutate()} disabled={testMut.isPending || !fhirBaseUrl}>
                  {testMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <PlugZap className="h-4 w-4 mr-2" />}
                  Tester /metadata
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Journal des envois FHIR (50 derniers)</CardTitle></CardHeader>
            <CardContent>
              {logsQ.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                <div className="space-y-2 text-xs font-mono">
                  {(logsQ.data?.logs ?? []).length === 0 && <p className="text-muted-foreground">Aucun envoi.</p>}
                  {(logsQ.data?.logs ?? []).map((l) => (
                    <div key={l.id} className="border rounded p-2 flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={l.ok ? "default" : "destructive"}>{l.status_code ?? "ERR"}</Badge>
                        <span className="truncate">{l.endpoint_url}</span>
                        <span className="ml-auto text-muted-foreground">{new Date(l.created_at).toLocaleString("fr-FR")}</span>
                      </div>
                      {l.response_excerpt && <pre className="bg-muted p-1 overflow-auto max-h-32">{l.response_excerpt}</pre>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
