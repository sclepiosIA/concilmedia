import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Network, ShieldCheck, Loader2, CheckCircle2 } from "lucide-react";
import { fhirBundleToCsvTexts } from "@/lib/dataIngest/fhirImport.functions";
import { listMyOrganizations, confirmImport } from "@/lib/dataIngest/ingestReal.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/import-fhir")({
  head: () => ({ meta: [{ title: "Import FHIR R4 — ConcilMed" }] }),
  component: ImportFhirPage,
  errorComponent: ({ error }) => (
    <div className="p-8 text-destructive">Erreur : {error.message}</div>
  ),
  notFoundComponent: () => <div className="p-8">Introuvable</div>,
});

const EXAMPLE_BUNDLE = JSON.stringify(
  {
    resourceType: "Bundle",
    type: "collection",
    entry: [
      { resource: { resourceType: "Patient", id: "P001", birthDate: "1948-03-12", gender: "female" } },
      { resource: { resourceType: "Patient", id: "P002", birthDate: "1955-09-21", gender: "male" } },
      {
        resource: {
          resourceType: "MedicationStatement",
          subject: { reference: "Patient/P001" },
          medicationCodeableConcept: { text: "Amlodipine 5 mg" },
          dosage: [{ text: "1 cp matin" }],
        },
      },
      {
        resource: {
          resourceType: "MedicationRequest",
          subject: { reference: "Patient/P002" },
          medicationCodeableConcept: { text: "Apixaban 5 mg" },
          dosageInstruction: [{ text: "1 cp matin et soir" }],
        },
      },
    ],
  },
  null,
  2,
);

function ImportFhirPage() {
  const listOrgs = useServerFn(listMyOrganizations);
  const convert = useServerFn(fhirBundleToCsvTexts);
  const doConfirm = useServerFn(confirmImport);

  const orgsQ = useQuery({ queryKey: ["my-orgs"], queryFn: () => listOrgs() });
  const [orgId, setOrgId] = useState<string>("");
  const [bundle, setBundle] = useState<string>(EXAMPLE_BUNDLE);
  const [converted, setConverted] = useState<{
    patientsCsv: string;
    traitementsCsv: string;
    stats: { patients: number; traitements: number; entries: number };
  } | null>(null);

  const convertMut = useMutation({
    mutationFn: () => convert({ data: { bundleJson: bundle } }),
    onSuccess: (r) => {
      setConverted(r);
      toast.success(`Bundle FHIR converti : ${r.stats.patients} patient(s), ${r.stats.traitements} traitement(s).`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Conversion échouée"),
  });

  const importPatientsMut = useMutation({
    mutationFn: () => {
      if (!orgId || !converted) throw new Error("Sélectionnez une organisation et convertissez d'abord.");
      return doConfirm({ data: { organizationId: orgId, fileKind: "patients", csvText: converted.patientsCsv } });
    },
    onSuccess: (r) => toast.success(`Patients importés : ${r.inserted} insérés, ${r.rejected} rejetés.`),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Import patients échoué"),
  });

  const importTraitementsMut = useMutation({
    mutationFn: () => {
      if (!orgId || !converted) throw new Error("Sélectionnez une organisation et convertissez d'abord.");
      return doConfirm({ data: { organizationId: orgId, fileKind: "traitements", csvText: converted.traitementsCsv } });
    },
    onSuccess: (r) => toast.success(`Traitements importés : ${r.inserted} insérés, ${r.rejected} rejetés.`),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Import traitements échoué"),
  });

  const orgs = orgsQ.data?.orgs ?? [];

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-6xl">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <Network className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Import FHIR R4 (lecture) — v1</h1>
          <Badge variant="secondary">Piste #6</Badge>
        </div>
        <p className="text-muted-foreground">
          Convertit un <code>Bundle</code> FHIR R4 (Patient, MedicationStatement, MedicationRequest) en
          lignes ConcilMed, puis ré-utilise le pipeline pseudonymisé de la Piste #4.
        </p>
      </header>

      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>Sécurité</AlertTitle>
        <AlertDescription>
          Les identifiants FHIR (<code>Patient.id</code>) sont traités comme des IPP locaux et
          pseudonymisés côté serveur (HMAC-SHA-256 par organisation). Les colonnes interdites (NIR, email,
          téléphone, adresse) sont automatiquement bloquées.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader><CardTitle>1. Organisation cible</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {orgsQ.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
            <select
              className="w-full border rounded p-2 bg-background"
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
            >
              <option value="">— Sélectionnez —</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>{o.nom} ({o.role})</option>
              ))}
            </select>
          )}
          {orgs.length === 0 && !orgsQ.isLoading && (
            <p className="text-sm text-muted-foreground">
              Aucune organisation. Créez-en une depuis{" "}
              <a className="underline" href="/admin/import-reel">/admin/import-reel</a>.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>2. Coller un Bundle FHIR R4 (JSON)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Label htmlFor="bundle">Bundle JSON</Label>
          <textarea
            id="bundle"
            className="w-full h-72 font-mono text-xs border rounded p-2 bg-background"
            value={bundle}
            onChange={(e) => setBundle(e.target.value)}
          />
          <div className="flex gap-2">
            <Button onClick={() => convertMut.mutate()} disabled={convertMut.isPending}>
              {convertMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Convertir
            </Button>
            <Button variant="outline" onClick={() => setBundle(EXAMPLE_BUNDLE)}>Exemple</Button>
          </div>
        </CardContent>
      </Card>

      {converted && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-success" />
              3. Aperçu &amp; import
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {converted.stats.entries} entrée(s) FHIR → {converted.stats.patients} patient(s), {converted.stats.traitements} traitement(s).
            </p>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Patients (CSV converti)</Label>
                <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-48">{converted.patientsCsv || "(vide)"}</pre>
                <Button
                  onClick={() => importPatientsMut.mutate()}
                  disabled={!orgId || importPatientsMut.isPending || converted.stats.patients === 0}
                >
                  {importPatientsMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Importer les patients
                </Button>
              </div>
              <div className="space-y-2">
                <Label>Traitements (CSV converti)</Label>
                <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-48">{converted.traitementsCsv || "(vide)"}</pre>
                <Button
                  onClick={() => importTraitementsMut.mutate()}
                  disabled={!orgId || importTraitementsMut.isPending || converted.stats.traitements === 0}
                >
                  {importTraitementsMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Importer les traitements
                </Button>
              </div>
            </div>

            <Alert>
              <AlertDescription className="text-xs">
                Astuce : importez d'abord les patients, puis les traitements (le rattachement se fait via
                l'IPP FHIR <code>Patient.id</code> pseudonymisé).
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
