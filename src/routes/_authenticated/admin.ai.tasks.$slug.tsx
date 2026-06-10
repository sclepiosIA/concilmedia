import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getTask,
  listProviders,
  updateTask,
  listTaskVersions,
  restoreTaskVersion,
  testTask,
} from "@/lib/admin/ai.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/ai/tasks/$slug")({
  component: TaskEditor,
});

function TaskEditor() {
  const { slug } = Route.useParams();
  const qc = useQueryClient();
  const getTaskFn = useServerFn(getTask);
  const listProvidersFn = useServerFn(listProviders);
  const updateTaskFn = useServerFn(updateTask);
  const listVersionsFn = useServerFn(listTaskVersions);
  const restoreFn = useServerFn(restoreTaskVersion);
  const testFn = useServerFn(testTask);

  const taskQ = useQuery({ queryKey: ["admin-ai-task", slug], queryFn: () => getTaskFn({ data: { slug } }) });
  const providersQ = useQuery({ queryKey: ["admin-ai-providers"], queryFn: () => listProvidersFn() });
  const versionsQ = useQuery({ queryKey: ["admin-ai-versions", slug], queryFn: () => listVersionsFn({ data: { slug } }) });

  const [systemPrompt, setSystemPrompt] = useState<string>("");
  const [model, setModel] = useState<string>("");
  const [providerId, setProviderId] = useState<string>("");
  const [temperature, setTemperature] = useState<string>("");
  const [maxTokens, setMaxTokens] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [initialized, setInitialized] = useState(false);

  const [testPrompt, setTestPrompt] = useState("");
  const [testResult, setTestResult] = useState<string>("");

  if (taskQ.data && !initialized) {
    setSystemPrompt(taskQ.data.system_prompt ?? "");
    setModel(taskQ.data.model);
    setProviderId(taskQ.data.provider_id ?? "");
    setTemperature(taskQ.data.temperature?.toString() ?? "");
    setMaxTokens(taskQ.data.max_tokens?.toString() ?? "");
    setInitialized(true);
  }

  const save = useMutation({
    mutationFn: () =>
      updateTaskFn({
        data: {
          slug,
          provider_id: providerId || null,
          model,
          system_prompt: systemPrompt,
          temperature: temperature ? Number(temperature) : null,
          max_tokens: maxTokens ? Number(maxTokens) : null,
          note: note || undefined,
        },
      }),
    onSuccess: (r) => {
      toast.success(`Enregistré (version ${r.version})`);
      setNote("");
      qc.invalidateQueries({ queryKey: ["admin-ai-task", slug] });
      qc.invalidateQueries({ queryKey: ["admin-ai-versions", slug] });
      qc.invalidateQueries({ queryKey: ["admin-ai-tasks"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runTest = useMutation({
    mutationFn: () => testFn({ data: { slug, prompt: testPrompt } }),
    onSuccess: (r) => setTestResult(r.text),
    onError: (e: Error) => toast.error(e.message),
  });

  const restore = useMutation({
    mutationFn: (versionId: string) => restoreFn({ data: { slug, versionId } }),
    onSuccess: () => {
      toast.success("Version restaurée");
      setInitialized(false);
      qc.invalidateQueries({ queryKey: ["admin-ai-task", slug] });
      qc.invalidateQueries({ queryKey: ["admin-ai-versions", slug] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (taskQ.isLoading) return <p className="text-sm text-muted-foreground">Chargement…</p>;
  if (!taskQ.data) return <p className="text-sm text-destructive">Tâche introuvable</p>;

  return (
    <div className="max-w-4xl">
      <Link to="/admin/ai" className="text-xs text-muted-foreground hover:underline">← Retour</Link>
      <h1 className="text-2xl font-bold mt-2">{taskQ.data.label}</h1>
      <p className="text-sm text-muted-foreground">{taskQ.data.description}</p>
      <div className="flex gap-2 mt-2 text-xs">
        <Badge variant="secondary">{slug}</Badge>
        <Badge variant="outline">v{taskQ.data.current_version}</Badge>
      </div>

      <Card className="p-5 mt-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Fournisseur</Label>
            <Select value={providerId} onValueChange={setProviderId}>
              <SelectTrigger><SelectValue placeholder="Sélectionner…" /></SelectTrigger>
              <SelectContent>
                {(providersQ.data ?? []).filter(p => p.is_active).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name} ({p.kind})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Modèle</Label>
            <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="ex: gpt-4o-mini" />
          </div>
          <div>
            <Label>Température</Label>
            <Input value={temperature} onChange={(e) => setTemperature(e.target.value)} placeholder="ex: 0.2" inputMode="decimal" />
          </div>
          <div>
            <Label>Max tokens</Label>
            <Input value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} placeholder="ex: 4000" inputMode="numeric" />
          </div>
        </div>
        <div>
          <Label>Prompt système</Label>
          <Textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={18}
            className="font-mono text-xs"
            placeholder="(vide = utilise le prompt par défaut codé dans la fonction)"
          />
        </div>
        <div>
          <Label>Note de version (optionnel)</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ce que tu changes…" />
        </div>
        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Enregistrement…" : "Enregistrer (nouvelle version)"}
          </Button>
        </div>
      </Card>

      <Card className="p-5 mt-6 space-y-3">
        <h2 className="font-semibold">Tester</h2>
        <Textarea value={testPrompt} onChange={(e) => setTestPrompt(e.target.value)} rows={4} placeholder="Prompt utilisateur de test…" />
        <Button variant="secondary" onClick={() => runTest.mutate()} disabled={!testPrompt || runTest.isPending}>
          {runTest.isPending ? "Exécution…" : "Lancer le test"}
        </Button>
        {testResult && (
          <pre className="bg-muted p-3 rounded text-xs whitespace-pre-wrap max-h-80 overflow-auto">{testResult}</pre>
        )}
      </Card>

      <Card className="p-5 mt-6">
        <h2 className="font-semibold mb-3">Historique ({versionsQ.data?.length ?? 0})</h2>
        <div className="space-y-2 max-h-96 overflow-auto">
          {(versionsQ.data ?? []).map((v) => (
            <div key={v.id} className="flex items-center justify-between gap-3 p-2 border rounded text-sm">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">v{v.version}</Badge>
                  <code className="text-[11px] text-muted-foreground">{v.model}</code>
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(v.created_at).toLocaleString("fr-FR")}
                  </span>
                </div>
                {v.note && <div className="text-xs text-muted-foreground mt-1 truncate">{v.note}</div>}
              </div>
              {v.version !== taskQ.data.current_version && (
                <Button size="sm" variant="ghost" onClick={() => restore.mutate(v.id)} disabled={restore.isPending}>
                  Restaurer
                </Button>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
