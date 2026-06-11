import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  ChevronLeft,
  FileSignature,
  Loader2,
  Send,
  Download,
  CheckCircle2,
  Pencil,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  compareDischargeMedications,
  generateDischargeLetter,
  listDischargeLetters,
  updateDischargeLetterContent,
  validateDischargeLetter,
  sendDischargeLetterMSSante,
  regenerateDischargeLetter,
  exportDischargeLetterPdf,
} from "@/lib/discharge/dischargeLetter.functions";
import { pushDocumentToMes } from "@/lib/dmp/mesPush.functions";

export const Route = createFileRoute("/_authenticated/episodes/$episodeId/sortie")({
  head: () => ({ meta: [{ title: "Conciliation de sortie" }] }),
  component: DischargePage,
});

const STATUT_COLORS: Record<string, string> = {
  introduit: "bg-green-100 text-green-900 border-green-300",
  arrete: "bg-red-100 text-red-900 border-red-300",
  modifie: "bg-amber-100 text-amber-900 border-amber-300",
  repris: "bg-blue-100 text-blue-900 border-blue-300",
  poursuivi: "bg-slate-100 text-slate-700 border-slate-300",
  inchange: "bg-slate-50 text-slate-500 border-slate-200",
};
const STATUT_LABEL: Record<string, string> = {
  introduit: "Introduit",
  arrete: "Arrêté",
  modifie: "Modifié",
  repris: "Repris",
  poursuivi: "Poursuivi",
  inchange: "Inchangé",
};

interface LetterRow {
  id: string;
  status: string;
  version: number;
  parent_letter_id: string | null;
  recipient_medecin_nom: string | null;
  recipient_medecin_mssante: string | null;
  recipient_pharmacien_nom: string | null;
  recipient_pharmacien_mssante: string | null;
  created_at: string;
  sent_at: string | null;
  validated_at: string | null;
  delivery_channel: string | null;
  delivery_log: Array<{ at: string; by: string; channel: string; recipient: string; status: string; message?: string }> | null;
  letter_html: string | null;
}

function statusBadge(s: string) {
  if (s === "envoyee") return <Badge className="bg-green-100 text-green-900 border-green-300" variant="outline">Envoyée</Badge>;
  if (s === "prete") return <Badge className="bg-blue-100 text-blue-900 border-blue-300" variant="outline">Prête</Badge>;
  if (s === "clos") return <Badge className="bg-slate-200 text-slate-600" variant="outline">Remplacée</Badge>;
  return <Badge className="bg-slate-100 text-slate-700" variant="outline">Brouillon</Badge>;
}

function DischargePage() {
  const { episodeId } = Route.useParams();
  const qc = useQueryClient();
  const compareFn = useServerFn(compareDischargeMedications);
  const generateFn = useServerFn(generateDischargeLetter);
  const listFn = useServerFn(listDischargeLetters);
  const updateFn = useServerFn(updateDischargeLetterContent);
  const validateFn = useServerFn(validateDischargeLetter);
  const sendFn = useServerFn(sendDischargeLetterMSSante);
  const regenFn = useServerFn(regenerateDischargeLetter);
  const pdfFn = useServerFn(exportDischargeLetterPdf);

  const [medecinNom, setMedecinNom] = useState("");
  const [medecinMss, setMedecinMss] = useState("");
  const [pharmaNom, setPharmaNom] = useState("");
  const [pharmaMss, setPharmaMss] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editHtml, setEditHtml] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const cmp = useQuery({
    queryKey: ["discharge-cmp", episodeId],
    queryFn: () => compareFn({ data: { episodeId } }),
  });
  const letters = useQuery({
    queryKey: ["discharge-letters", episodeId],
    queryFn: () => listFn({ data: { episodeId } }) as Promise<LetterRow[]>,
  });

  // Pre-fill recipients from patient
  useEffect(() => {
    const p = cmp.data?.patient;
    if (!p) return;
    setMedecinNom((prev) => prev || p.medecin_traitant_nom || "");
    setMedecinMss((prev) => prev || p.medecin_traitant_mssante || "");
    setPharmaNom((prev) => prev || p.pharmacien_officine_nom || "");
    setPharmaMss((prev) => prev || p.pharmacien_officine_mssante || "");
  }, [cmp.data?.patient]);

  const generate = useMutation({
    mutationFn: () =>
      generateFn({
        data: {
          episodeId,
          recipientMedecinNom: medecinNom || null,
          recipientMedecinMssante: medecinMss || null,
          recipientPharmacienNom: pharmaNom || null,
          recipientPharmacienMssante: pharmaMss || null,
        },
      }),
    onSuccess: () => {
      toast.success("Lettre de liaison générée");
      qc.invalidateQueries({ queryKey: ["discharge-letters", episodeId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const regen = useMutation({
    mutationFn: (letterId: string) => regenFn({ data: { letterId } }),
    onSuccess: () => {
      toast.success("Nouvelle version générée");
      qc.invalidateQueries({ queryKey: ["discharge-letters", episodeId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const validate = useMutation({
    mutationFn: (letterId: string) => validateFn({ data: { letterId } }),
    onSuccess: () => {
      toast.success("Lettre validée");
      qc.invalidateQueries({ queryKey: ["discharge-letters", episodeId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const send = useMutation({
    mutationFn: (letterId: string) => sendFn({ data: { letterId } }),
    onSuccess: (r) => {
      toast.success(`Envoi MSSanté simulé vers ${r.recipients} destinataire(s)`);
      qc.invalidateQueries({ queryKey: ["discharge-letters", episodeId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveEdit = useMutation({
    mutationFn: (v: { letterId: string; html: string }) =>
      updateFn({
        data: {
          letterId: v.letterId,
          letterHtml: v.html,
          recipientMedecinNom: medecinNom || null,
          recipientMedecinMssante: medecinMss || null,
          recipientPharmacienNom: pharmaNom || null,
          recipientPharmacienMssante: pharmaMss || null,
        },
      }),
    onSuccess: () => {
      toast.success("Modifications enregistrées");
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ["discharge-letters", episodeId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const downloadPdf = useMutation({
    mutationFn: (letterId: string) => pdfFn({ data: { letterId } }),
    onSuccess: (r) => {
      const blob = new Blob([Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0))], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = r.filename;
      a.click();
      URL.revokeObjectURL(url);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pushMesFn = useServerFn(pushDocumentToMes);
  const pushMes = useMutation({
    mutationFn: (letterId: string) => {
      const pid = cmp.data?.patient?.id;
      if (!pid) throw new Error("Patient introuvable");
      return pushMesFn({
        data: {
          patientId: pid,
          episodeId,
          documentType: "lettre_liaison",
          documentId: letterId,
          payloadSummary: { from: "page_sortie" },
        },
      });
    },
    onSuccess: (r) => toast.success(`Lettre poussée vers Mon Espace Santé (ACK ${r.ack_id})`),
    onError: (e: Error) => toast.error(e.message),
  });


  if (cmp.isLoading) return <div className="container py-8">Chargement…</div>;
  if (cmp.error) return <div className="container py-8 text-destructive">{(cmp.error as Error).message}</div>;
  const data = cmp.data!;

  return (
    <div className="container mx-auto px-4 py-4 max-w-[1400px]">
      <Link
        to="/episodes/$episodeId"
        params={{ episodeId }}
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-3"
      >
        <ChevronLeft className="h-4 w-4" /> Retour à l'épisode
      </Link>

      <div className="mb-4">
        <h1 className="text-2xl font-bold">Conciliation de sortie</h1>
        <p className="text-sm text-muted-foreground">
          {data.patient?.nom?.toUpperCase()} {data.patient?.prenom} — séjour du {data.episode.date_entree}
          {data.episode.date_sortie ? ` au ${data.episode.date_sortie}` : " (en cours)"} • {data.episode.service ?? "—"}
        </p>
      </div>

      {(data.patient?.allergies?.length ?? 0) > 0 && (
        <Card className="mb-4 border-amber-300 bg-amber-50/40">
          <CardContent className="py-3 flex items-start gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
            <div>
              <span className="font-medium text-amber-900">Allergies : </span>
              {data.patient!.allergies
                .filter((a) => a.substance)
                .map((a) => `${a.substance}${a.severite ? ` (${a.severite})` : ""}`)
                .join(" • ")}
              {(data.patient?.comorbidites?.length ?? 0) > 0 && (
                <span className="block mt-1 text-amber-800">
                  <span className="font-medium">Comorbidités : </span>
                  {data.patient!.comorbidites.filter((c) => c.libelle).map((c) => c.libelle).join(" • ")}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">Synthèse des modifications thérapeutiques</CardTitle>
        </CardHeader>
        <CardContent>
          {data.changes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune donnée à comparer pour cet épisode.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground border-b">
                  <tr>
                    <th className="py-2">Médicament</th>
                    <th>Habituel</th>
                    <th>Entrée</th>
                    <th>Sortie</th>
                    <th>Statut</th>
                    <th>Détail</th>
                  </tr>
                </thead>
                <tbody>
                  {data.changes.map((c, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2 font-medium">{c.medicament}</td>
                      <td>{c.en_habituel ? "✓" : "—"}</td>
                      <td>{c.en_entree ? "✓" : "—"}</td>
                      <td>{c.en_sortie ? "✓" : "—"}</td>
                      <td>
                        <Badge variant="outline" className={STATUT_COLORS[c.statut]}>
                          {STATUT_LABEL[c.statut]}
                        </Badge>
                      </td>
                      <td className="text-xs text-muted-foreground">{c.detail ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">Destinataires</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Médecin traitant — nom</Label>
            <Input value={medecinNom} onChange={(e) => setMedecinNom(e.target.value)} placeholder="Dr. ..." />
            <Label>Adresse MSSanté</Label>
            <Input value={medecinMss} onChange={(e) => setMedecinMss(e.target.value)} placeholder="dr.x@medecin.mssante.fr" />
          </div>
          <div className="space-y-2">
            <Label>Pharmacien d'officine — nom</Label>
            <Input value={pharmaNom} onChange={(e) => setPharmaNom(e.target.value)} placeholder="Pharmacie ..." />
            <Label>Adresse MSSanté</Label>
            <Input value={pharmaMss} onChange={(e) => setPharmaMss(e.target.value)} placeholder="pharmacie@pharmacien.mssante.fr" />
          </div>
        </CardContent>
      </Card>

      <div className="mb-6">
        <Button onClick={() => generate.mutate()} disabled={generate.isPending} size="lg">
          {generate.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <FileSignature className="h-4 w-4 mr-2" />
          )}
          Générer la lettre de liaison
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lettres de liaison</CardTitle>
        </CardHeader>
        <CardContent>
          {letters.isLoading ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : (letters.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune lettre générée pour cet épisode.</p>
          ) : (
            <div className="space-y-4">
              {letters.data!.map((l) => {
                const isClosed = l.status === "clos";
                const isOpen = expanded[l.id] ?? !isClosed;
                const canSend =
                  l.status === "prete" && !!(l.recipient_medecin_mssante || l.recipient_pharmacien_mssante);
                return (
                  <div
                    key={l.id}
                    className={`border rounded-md p-4 space-y-3 ${isClosed ? "bg-muted/30 opacity-80" : ""}`}
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setExpanded((s) => ({ ...s, [l.id]: !isOpen }))}
                        className="flex items-center gap-2 text-sm text-left"
                      >
                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        <div>
                          <div className="font-medium">
                            Version {l.version} — {new Date(l.created_at).toLocaleString("fr-FR")}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {l.recipient_medecin_nom && <>Médecin : {l.recipient_medecin_nom} • </>}
                            {l.recipient_pharmacien_nom && <>Pharmacien : {l.recipient_pharmacien_nom}</>}
                          </div>
                        </div>
                      </button>
                      <div className="flex items-center gap-2 flex-wrap">
                        {statusBadge(l.status)}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => downloadPdf.mutate(l.id)}
                          disabled={downloadPdf.isPending}
                        >
                          <Download className="h-4 w-4 mr-1" /> PDF
                        </Button>
                        {l.status === "brouillon" && editingId !== l.id && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingId(l.id);
                              setEditHtml(l.letter_html ?? "");
                            }}
                          >
                            <Pencil className="h-4 w-4 mr-1" /> Modifier
                          </Button>
                        )}
                        {!isClosed && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => regen.mutate(l.id)}
                            disabled={regen.isPending}
                          >
                            <RefreshCw className="h-4 w-4 mr-1" /> Régénérer
                          </Button>
                        )}
                        {l.status === "brouillon" && (
                          <Button size="sm" variant="outline" onClick={() => validate.mutate(l.id)}>
                            <CheckCircle2 className="h-4 w-4 mr-1" /> Valider
                          </Button>
                        )}
                        {l.status === "prete" && (
                          <Button
                            size="sm"
                            onClick={() => send.mutate(l.id)}
                            disabled={!canSend || send.isPending}
                            title={canSend ? "" : "Aucune adresse MSSanté renseignée"}
                          >
                            <Send className="h-4 w-4 mr-1" /> Envoyer MSSanté
                          </Button>
                        )}
                        {l.status === "prete" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => pushMes.mutate(l.id)}
                            disabled={pushMes.isPending}
                            title="Pousser vers Mon Espace Santé (simulé)"
                          >
                            <Send className="h-4 w-4 mr-1" /> Push MES
                          </Button>
                        )}

                      </div>
                    </div>

                    {isOpen && editingId === l.id ? (
                      <div className="space-y-2">
                        <Textarea
                          value={editHtml}
                          onChange={(e) => setEditHtml(e.target.value)}
                          rows={18}
                          className="font-mono text-xs"
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => saveEdit.mutate({ letterId: l.id, html: editHtml })}
                            disabled={saveEdit.isPending}
                          >
                            Enregistrer
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                            Annuler
                          </Button>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">Aperçu</div>
                          <div
                            className="prose prose-sm max-w-none bg-muted/30 rounded p-4 max-h-[300px] overflow-y-auto"
                            dangerouslySetInnerHTML={{ __html: editHtml }}
                          />
                        </div>
                      </div>
                    ) : (
                      isOpen &&
                      l.letter_html && (
                        <div
                          className="prose prose-sm max-w-none bg-muted/30 rounded p-4 max-h-[400px] overflow-y-auto"
                          dangerouslySetInnerHTML={{ __html: l.letter_html }}
                        />
                      )
                    )}

                    {isOpen && (l.delivery_log?.length ?? 0) > 0 && (
                      <div className="border-t pt-3">
                        <div className="text-xs font-medium text-muted-foreground mb-2">Journal d'envoi</div>
                        <ul className="space-y-1 text-xs">
                          {l.delivery_log!.map((e, i) => (
                            <li key={i} className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[10px]">{e.channel}</Badge>
                              <span className="text-muted-foreground">{new Date(e.at).toLocaleString("fr-FR")}</span>
                              <span>→ {e.recipient}</span>
                              <Badge variant="secondary" className="text-[10px]">{e.status}</Badge>
                              {e.message && <span className="text-muted-foreground italic">{e.message}</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
