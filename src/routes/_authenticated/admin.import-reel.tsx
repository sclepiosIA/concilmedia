import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ShieldCheck, AlertTriangle, FileSpreadsheet, CheckCircle2, Loader2 } from "lucide-react";
import {
  previewImport, confirmImport, listMyOrganizations, listImports, createOrganization,
} from "@/lib/dataIngest/ingestReal.functions";
import { PATIENT_CSV_EXAMPLE, TRAITEMENT_CSV_EXAMPLE } from "@/lib/dataIngest/csvSchemas.server";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/import-reel")({
  head: () => ({ meta: [{ title: "Import données réelles — ConcilMed" }] }),
  component: ImportReelPage,
});

type FileKind = "patients" | "traitements";

function ImportReelPage() {
  const qc = useQueryClient();
  const listOrgs = useServerFn(listMyOrganizations);
  const createOrg = useServerFn(createOrganization);
  const preview = useServerFn(previewImport);
  const confirm = useServerFn(confirmImport);
  const listImp = useServerFn(listImports);

  const orgsQ = useQuery({ queryKey: ["import-reel", "orgs"], queryFn: () => listOrgs() });
  const [orgId, setOrgId] = useState<string>("");
  const [fileKind, setFileKind] = useState<FileKind>("patients");
  const [csvText, setCsvText] = useState<string>("");
  const [previewData, setPreviewData] = useState<Awaited<ReturnType<typeof preview>> | null>(null);
  const [newOrgName, setNewOrgName] = useState("");

  const impQ = useQuery({
    queryKey: ["import-reel", "imports", orgId],
    queryFn: () => listImp({ data: { organizationId: orgId } }),
    enabled: !!orgId,
  });

  const previewMut = useMutation({
    mutationFn: async () => preview({ data: { organizationId: orgId, fileKind, csvText } }),
    onSuccess: (r) => setPreviewData(r),
    onError: (e: Error) => toast.error(e.message),
  });
  const confirmMut = useMutation({
    mutationFn: async () => confirm({ data: { organizationId: orgId, fileKind, csvText } }),
    onSuccess: (r) => {
      toast.success(`Import OK : ${r.inserted} ligne(s) insérée(s).`);
      setPreviewData(null); setCsvText("");
      qc.invalidateQueries({ queryKey: ["import-reel", "imports", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const createMut = useMutation({
    mutationFn: async () => createOrg({ data: { nom: newOrgName.trim() } }),
    onSuccess: (r) => {
      toast.success(`Organisation créée : ${r.organization.nom}`);
      setNewOrgName(""); setOrgId(r.organization.id);
      qc.invalidateQueries({ queryKey: ["import-reel", "orgs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const orgs = orgsQ.data?.orgs ?? [];

  const onFile = async (f: File | null) => {
    if (!f) return;
    if (f.size > 5_000_000) { toast.error("Fichier > 5 Mo."); return; }
    setCsvText(await f.text());
    setPreviewData(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><ShieldCheck className="h-6 w-6" /> Import de données réelles pseudonymisées</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Pipeline d'ingestion CSV avec pseudonymisation côté serveur, décalage de dates, hash IPP et cloisonnement par organisation.
        </p>
      </div>

      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>Garde-fous RGPD actifs</AlertTitle>
        <AlertDescription>
          IPP hashé (HMAC-SHA-256 + sel par organisation), dates décalées de ±0–30 jours, identité réduite aux initiales,
          colonnes NIR/INS/email/téléphone/adresse refusées. Activation production conditionnée à un hébergeur HDS certifié.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader><CardTitle>1. Organisation</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {orgs.length === 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Aucune organisation. Créez la première — vous en serez admin.</p>
              <div className="flex gap-2">
                <Input placeholder="Nom de l'organisation (ex : CH Test)" value={newOrgName} onChange={(e) => setNewOrgName(e.target.value)} />
                <Button onClick={() => createMut.mutate()} disabled={!newOrgName.trim() || createMut.isPending}>
                  {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Créer"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Organisation cible</Label>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={orgId} onChange={(e) => setOrgId(e.target.value)}
              >
                <option value="">— Choisir —</option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>{o.nom} ({o.role})</option>
                ))}
              </select>
              <div className="flex gap-2 items-end pt-2">
                <div className="flex-1">
                  <Label className="text-xs">Créer une autre organisation</Label>
                  <Input placeholder="Nom" value={newOrgName} onChange={(e) => setNewOrgName(e.target.value)} />
                </div>
                <Button variant="outline" size="sm" onClick={() => createMut.mutate()} disabled={!newOrgName.trim() || createMut.isPending}>
                  Créer
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {orgId && (
        <Card>
          <CardHeader>
            <CardTitle>2. Fichier CSV</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs value={fileKind} onValueChange={(v) => { setFileKind(v as FileKind); setPreviewData(null); }}>
              <TabsList>
                <TabsTrigger value="patients">Patients</TabsTrigger>
                <TabsTrigger value="traitements">Traitements</TabsTrigger>
              </TabsList>
              <TabsContent value="patients" className="space-y-2">
                <p className="text-xs text-muted-foreground">Colonnes attendues : <code>ipp_local, date_naissance (YYYY-MM-DD), sexe (M|F), poids_kg, taille_cm</code></p>
                <details>
                  <summary className="cursor-pointer text-xs text-primary">Voir un exemple</summary>
                  <pre className="text-xs bg-muted p-2 rounded mt-1 overflow-x-auto">{PATIENT_CSV_EXAMPLE}</pre>
                </details>
              </TabsContent>
              <TabsContent value="traitements" className="space-y-2">
                <p className="text-xs text-muted-foreground">Colonnes : <code>ipp_local, dci, dosage, dosage_unite, voie_administration, posologie_texte, indication</code></p>
                <details>
                  <summary className="cursor-pointer text-xs text-primary">Voir un exemple</summary>
                  <pre className="text-xs bg-muted p-2 rounded mt-1 overflow-x-auto">{TRAITEMENT_CSV_EXAMPLE}</pre>
                </details>
              </TabsContent>
            </Tabs>

            <div>
              <Label>Fichier CSV (max 5 Mo)</Label>
              <Input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
            </div>

            <div className="flex gap-2">
              <Button onClick={() => previewMut.mutate()} disabled={!csvText || previewMut.isPending}>
                {previewMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileSpreadsheet className="h-4 w-4 mr-2" />}
                Aperçu (dry-run)
              </Button>
              <Button
                variant="default"
                onClick={() => confirmMut.mutate()}
                disabled={!previewData?.ok || confirmMut.isPending}
              >
                {confirmMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Confirmer l'import
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {previewData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Aperçu pseudonymisé
              <Badge variant={previewData.ok ? "default" : "destructive"}>
                {previewData.ok ? "Prêt" : "Bloqué"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-4 text-sm">
              <span>Total : <strong>{previewData.stats.total}</strong></span>
              <span className="text-green-600">Valides : <strong>{previewData.stats.valid}</strong></span>
              <span className="text-destructive">Rejetées : <strong>{previewData.stats.rejected}</strong></span>
              <span className="text-xs text-muted-foreground">SHA-256 : {previewData.sha256.slice(0, 12)}…</span>
            </div>

            {previewData.forbiddenColumns.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Colonnes interdites détectées</AlertTitle>
                <AlertDescription>{previewData.forbiddenColumns.join(", ")}</AlertDescription>
              </Alert>
            )}
            {previewData.sampleLeaks.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Valeurs identifiantes détectées</AlertTitle>
                <AlertDescription>
                  {previewData.sampleLeaks.slice(0, 5).map((l, i) => (
                    <div key={i}>colonne <code>{l.column}</code> · {l.kind} · {l.sample}</div>
                  ))}
                </AlertDescription>
              </Alert>
            )}

            {previewData.errors.length > 0 && (
              <details>
                <summary className="cursor-pointer text-sm font-medium">Erreurs ({previewData.errors.length})</summary>
                <ul className="text-xs space-y-1 mt-2 max-h-48 overflow-y-auto">
                  {previewData.errors.map((er, i) => (
                    <li key={i}>Ligne {er.line} : {er.message}</li>
                  ))}
                </ul>
              </details>
            )}

            <div className="border rounded overflow-auto max-h-72">
              <table className="text-xs w-full">
                <thead className="bg-muted sticky top-0">
                  <tr>{Object.keys(previewData.sample[0] ?? {}).map((k) => <th key={k} className="px-2 py-1 text-left">{k}</th>)}</tr>
                </thead>
                <tbody>
                  {previewData.sample.map((row, i) => (
                    <tr key={i} className="border-t">
                      {Object.values(row).map((v, j) => <td key={j} className="px-2 py-1">{String(v ?? "")}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {orgId && (
        <Card>
          <CardHeader><CardTitle>Historique des imports</CardTitle></CardHeader>
          <CardContent>
            {impQ.data?.imports.length ? (
              <table className="text-xs w-full">
                <thead><tr className="text-left text-muted-foreground">
                  <th className="py-1">Date</th><th>Type</th><th>Lignes</th><th>OK</th><th>Rejet</th><th>Statut</th>
                </tr></thead>
                <tbody>
                  {impQ.data.imports.map((i) => (
                    <tr key={i.id} className="border-t">
                      <td className="py-1">{new Date(i.started_at).toLocaleString("fr-FR")}</td>
                      <td>{i.file_kind}</td>
                      <td>{i.rows_total}</td>
                      <td className="text-green-600">{i.rows_inserted}</td>
                      <td className="text-destructive">{i.rows_rejected}</td>
                      <td><Badge variant={i.status === "success" ? "default" : i.status === "error" ? "destructive" : "secondary"}>{i.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="text-sm text-muted-foreground">Aucun import.</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
