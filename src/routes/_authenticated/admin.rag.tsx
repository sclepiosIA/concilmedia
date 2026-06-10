import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  ingestStoppStart,
  ingestLaroche,
  ingestRcpFromBdpm,
  ingestText,
  getRagStatus,
  searchRag,
} from "@/lib/rag/ingestCorpus.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { BookOpen, Search, Database, FileText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/rag")({
  component: RagAdminPage,
});

function RagAdminPage() {
  const statusFn = useServerFn(getRagStatus);
  const stoppFn = useServerFn(ingestStoppStart);
  const larocheFn = useServerFn(ingestLaroche);
  const bdpmFn = useServerFn(ingestRcpFromBdpm);
  const textFn = useServerFn(ingestText);
  const searchFn = useServerFn(searchRag);
  const qc = useQueryClient();

  const { data: status, isLoading } = useQuery({
    queryKey: ["rag-status"],
    queryFn: () => statusFn(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["rag-status"] });

  const stoppMut = useMutation({
    mutationFn: stoppFn,
    onSuccess: (r) => { toast.success(`STOPP/START : ${r.inserted} chunks`); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Échec"),
  });
  const larocheMut = useMutation({
    mutationFn: larocheFn,
    onSuccess: (r) => { toast.success(`Laroche : ${r.inserted} chunks`); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Échec"),
  });
  const bdpmMut = useMutation({
    mutationFn: bdpmFn,
    onSuccess: (r) => { toast.success(`BDPM RCP : ${r.inserted} chunks`); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Échec"),
  });
  const textMut = useMutation({
    mutationFn: textFn,
    onSuccess: (r) => { toast.success(`Document : ${r.inserted} chunks`); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Échec"),
  });

  const [src, setSrc] = useState("");
  const [titre, setTitre] = useState("");
  const [version, setVersion] = useState("");
  const [url, setUrl] = useState("");
  const [licence, setLicence] = useState("");
  const [text, setText] = useState("");

  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Array<{ id: string; source: string; titre: string; content: string; similarity: number }>>([]);
  const [searching, setSearching] = useState(false);
  const doSearch = async () => {
    if (q.trim().length < 2) return;
    try {
      setSearching(true);
      const res = await searchFn({ data: { q: q.trim(), topK: 6 } });
      setHits(res.hits);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Recherche échouée");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BookOpen className="w-6 h-6" />
          RAG — Thésaurus cliniques opposables
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Indexation vectorielle (Lovable AI embeddings) des règles STOPP/START, Laroche, RCP BDPM
          et tout corpus libre injecté dans le prompt d'analyse pour citer des sources vérifiables.
        </p>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-2 gap-4 text-sm mb-4">
          <Stat label="Documents indexés" value={isLoading ? "…" : (status?.documents ?? 0).toLocaleString("fr-FR")} />
          <Stat label="Chunks vectorisés" value={isLoading ? "…" : (status?.chunks ?? 0).toLocaleString("fr-FR")} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => stoppMut.mutate(undefined)} disabled={stoppMut.isPending}>
            <FileText className="w-4 h-4 mr-2" />
            {stoppMut.isPending ? "Ingestion…" : "Re-seed STOPP/START"}
          </Button>
          <Button onClick={() => larocheMut.mutate(undefined)} disabled={larocheMut.isPending}>
            <FileText className="w-4 h-4 mr-2" />
            {larocheMut.isPending ? "Ingestion…" : "Re-seed Laroche"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => bdpmMut.mutate({ data: { limit: 200 } })}
            disabled={bdpmMut.isPending}
          >
            <Database className="w-4 h-4 mr-2" />
            {bdpmMut.isPending ? "Ingestion…" : "Indexer top 200 BDPM"}
          </Button>
        </div>
        {status?.bySource && status.bySource.length > 0 && (
          <div className="mt-4 text-xs text-muted-foreground border-t pt-3 space-y-1">
            {status.bySource.map((d, i) => (
              <div key={i} className="flex items-center gap-2">
                <Badge variant="outline">{d.source}</Badge>
                <span>{d.titre}</span>
                {d.version && <span className="opacity-60">· {d.version}</span>}
                <span className="ml-auto opacity-60">{new Date(d.ingested_at as string).toLocaleString("fr-FR")}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">Import manuel (texte collé)</h2>
        <p className="text-xs text-muted-foreground">
          Collez le texte d'un thésaurus libre (ANSM, HAS, SPILF…). PDF non supporté en v1 — extrayez le texte côté client.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Source</Label>
            <Input value={src} onChange={(e) => setSrc(e.target.value)} placeholder="ex: ANSM" />
          </div>
          <div>
            <Label>Titre</Label>
            <Input value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Thésaurus des interactions médicamenteuses" />
          </div>
          <div>
            <Label>Version</Label>
            <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="2024" />
          </div>
          <div>
            <Label>Licence</Label>
            <Input value={licence} onChange={(e) => setLicence(e.target.value)} placeholder="Open data Etalab" />
          </div>
          <div className="col-span-2">
            <Label>URL source</Label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
          </div>
        </div>
        <div>
          <Label>Texte (min 50 caractères)</Label>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            placeholder="Collez ici le texte structuré du référentiel…"
          />
        </div>
        <Button
          onClick={() =>
            textMut.mutate({
              data: {
                source: src,
                titre,
                version: version || undefined,
                url: url || undefined,
                licence: licence || undefined,
                text,
              },
            })
          }
          disabled={textMut.isPending || src.length < 1 || titre.length < 1 || text.length < 50}
        >
          {textMut.isPending ? "Ingestion…" : "Indexer ce document"}
        </Button>
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold flex items-center gap-2">
          <Search className="w-4 h-4" /> Recherche test
        </h2>
        <div className="flex gap-2">
          <Input
            placeholder="Ex: patient âgé sous IPP au long cours"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doSearch()}
          />
          <Button onClick={doSearch} disabled={searching || q.trim().length < 2}>
            {searching ? "…" : "Chercher"}
          </Button>
        </div>
        {hits.length > 0 && (
          <div className="space-y-3 mt-3">
            {hits.map((h) => (
              <div key={h.id} className="border rounded-md p-3 text-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline">{h.source}</Badge>
                  <span className="text-xs text-muted-foreground">{h.titre}</span>
                  <span className="ml-auto text-xs font-mono">
                    sim {(h.similarity * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-xs text-muted-foreground">{h.content.slice(0, 600)}{h.content.length > 600 ? "…" : ""}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
    </div>
  );
}
