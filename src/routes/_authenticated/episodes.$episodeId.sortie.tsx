import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, FileSignature, Loader2, Send, Printer, CheckCircle2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  compareDischargeMedications,
  generateDischargeLetter,
  listDischargeLetters,
  updateDischargeLetterStatus,
} from "@/lib/discharge/dischargeLetter.functions";

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

function DischargePage() {
  const { episodeId } = Route.useParams();
  const qc = useQueryClient();
  const compareFn = useServerFn(compareDischargeMedications);
  const generateFn = useServerFn(generateDischargeLetter);
  const listFn = useServerFn(listDischargeLetters);
  const statusFn = useServerFn(updateDischargeLetterStatus);

  const [medecinNom, setMedecinNom] = useState("");
  const [medecinMss, setMedecinMss] = useState("");
  const [pharmaNom, setPharmaNom] = useState("");
  const [pharmaMss, setPharmaMss] = useState("");

  const cmp = useQuery({
    queryKey: ["discharge-cmp", episodeId],
    queryFn: () => compareFn({ data: { episodeId } }),
  });

  const letters = useQuery({
    queryKey: ["discharge-letters", episodeId],
    queryFn: () => listFn({ data: { episodeId } }),
  });

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

  const setStatus = useMutation({
    mutationFn: (v: { letterId: string; status: "brouillon" | "prete" | "envoyee" }) =>
      statusFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["discharge-letters", episodeId] }),
  });

  if (cmp.isLoading) return <div className="container py-8">Chargement…</div>;
  if (cmp.error) return <div className="container py-8 text-destructive">{(cmp.error as Error).message}</div>;
  const data = cmp.data!;

  const printLetter = (html: string) => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(
      `<html><head><title>Lettre de liaison</title><style>body{font-family:Inter,system-ui,sans-serif;max-width:780px;margin:2rem auto;padding:1rem;color:#1a1a1a;line-height:1.6} h2{margin-top:1.5rem;border-bottom:1px solid #ddd;padding-bottom:.3rem} ul{padding-left:1.25rem}</style></head><body>${html}</body></html>`,
    );
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

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
              {letters.data!.map((l) => (
                <div key={l.id} className="border rounded-md p-4 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="text-sm">
                      <div className="font-medium">
                        Brouillon du {new Date(l.created_at).toLocaleString("fr-FR")}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {l.recipient_medecin_nom && <>Médecin : {l.recipient_medecin_nom} • </>}
                        {l.recipient_pharmacien_nom && <>Pharmacien : {l.recipient_pharmacien_nom}</>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={
                          l.status === "envoyee"
                            ? "bg-green-100 text-green-900"
                            : l.status === "prete"
                            ? "bg-blue-100 text-blue-900"
                            : "bg-slate-100"
                        }
                      >
                        {l.status === "envoyee" ? "Envoyée" : l.status === "prete" ? "Prête" : "Brouillon"}
                      </Badge>
                      <Button size="sm" variant="outline" onClick={() => l.letter_html && printLetter(l.letter_html)}>
                        <Printer className="h-4 w-4 mr-1" /> Imprimer
                      </Button>
                      {l.status === "brouillon" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setStatus.mutate({ letterId: l.id, status: "prete" })}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" /> Marquer prête
                        </Button>
                      )}
                      {l.status === "prete" && (
                        <Button
                          size="sm"
                          onClick={() => setStatus.mutate({ letterId: l.id, status: "envoyee" })}
                        >
                          <Send className="h-4 w-4 mr-1" /> Marquer envoyée
                        </Button>
                      )}
                    </div>
                  </div>
                  {l.letter_html && (
                    <div
                      className="prose prose-sm max-w-none bg-muted/30 rounded p-4 max-h-[400px] overflow-y-auto"
                      dangerouslySetInnerHTML={{ __html: l.letter_html }}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
