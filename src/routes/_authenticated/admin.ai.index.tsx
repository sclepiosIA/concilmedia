import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { listTasks, listProviders, bulkUpdateTasks } from "@/lib/admin/ai.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/ai/")({
  component: AdminAiIndex,
});

const UNCHANGED = "__unchanged__";
const NO_PROVIDER = "__none__";
const MODEL_CUSTOM = "__custom__";

const COMMON_MODELS = [
  "google/gemini-3-flash-preview",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-lite",
  "google/gemini-2.5-pro",
  "openai/gpt-5-nano",
  "openai/gpt-5-mini",
  "openai/gpt-5",
];

function AdminAiIndex() {
  const listTasksFn = useServerFn(listTasks);
  const listProvidersFn = useServerFn(listProviders);
  const bulkFn = useServerFn(bulkUpdateTasks);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-ai-tasks"],
    queryFn: () => listTasksFn(),
  });
  const { data: providers } = useQuery({
    queryKey: ["admin-ai-providers"],
    queryFn: () => listProvidersFn(),
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkProvider, setBulkProvider] = useState<string>(UNCHANGED);
  const [bulkModel, setBulkModel] = useState<string>(UNCHANGED);
  const [customModel, setCustomModel] = useState<string>("");

  const tasks = data ?? [];
  const activeProviders = useMemo(
    () => (providers ?? []).filter((p) => p.is_active),
    [providers],
  );

  const allSelected = tasks.length > 0 && selected.size === tasks.length;
  const someSelected = selected.size > 0;

  const toggleOne = (slug: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(slug);
      else next.delete(slug);
      return next;
    });
  };

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(tasks.map((t) => t.slug)) : new Set());
  };

  const reset = () => {
    setSelected(new Set());
    setBulkProvider(UNCHANGED);
    setBulkModel(UNCHANGED);
    setCustomModel("");
  };

  const mutation = useMutation({
    mutationFn: bulkFn,
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["admin-ai-tasks"] });
      if (res.errors.length === 0) {
        toast.success(`${res.updated} tâche(s) mise(s) à jour`);
      } else {
        toast.warning(
          `${res.updated}/${res.total} mises à jour — ${res.errors.length} erreur(s)`,
          {
            description: res.errors.map((e) => `${e.slug}: ${e.error}`).join("\n"),
          },
        );
      }
      reset();
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Erreur lors de la mise à jour"),
  });

  const apply = () => {
    const payload: {
      slugs: string[];
      provider_id?: string | null;
      model?: string;
    } = { slugs: Array.from(selected) };

    if (bulkProvider !== UNCHANGED) {
      payload.provider_id = bulkProvider === NO_PROVIDER ? null : bulkProvider;
    }
    if (bulkModel !== UNCHANGED) {
      const m = bulkModel === MODEL_CUSTOM ? customModel.trim() : bulkModel;
      if (!m) {
        toast.error("Renseigne le nom du modèle personnalisé");
        return;
      }
      payload.model = m;
    }
    if (payload.provider_id === undefined && payload.model === undefined) {
      toast.error("Aucune modification à appliquer");
      return;
    }
    mutation.mutate({ data: payload });
  };

  const canApply =
    someSelected &&
    (bulkProvider !== UNCHANGED || bulkModel !== UNCHANGED) &&
    (bulkModel !== MODEL_CUSTOM || customModel.trim().length > 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold mb-1">Tâches IA</h1>
          <p className="text-sm text-muted-foreground">
            Configure les prompts système, modèles et fournisseurs pour chaque endpoint IA.
          </p>
        </div>
        <Link
          to="/admin/ai/eval"
          className="text-sm underline text-muted-foreground hover:text-foreground"
        >
          Banc d'essai LLM →
        </Link>
      </div>

      {tasks.length > 0 && (
        <div className="flex items-center gap-3 mb-3 text-sm">
          <Checkbox
            checked={allSelected}
            onCheckedChange={(c) => toggleAll(!!c)}
            id="select-all"
          />
          <label htmlFor="select-all" className="cursor-pointer text-muted-foreground">
            {allSelected ? "Tout désélectionner" : "Tout sélectionner"}
          </label>
          {someSelected && (
            <span className="text-muted-foreground">· {selected.size} sélectionnée(s)</span>
          )}
        </div>
      )}

      {someSelected && (
        <Card className="p-4 mb-4 sticky top-2 z-10 border-primary/40 bg-card shadow-md">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs text-muted-foreground mb-1 block">
                Fournisseur
              </label>
              <Select value={bulkProvider} onValueChange={setBulkProvider}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNCHANGED}>— inchangé —</SelectItem>
                  <SelectItem value={NO_PROVIDER}>
                    Aucun (Lovable AI Gateway)
                  </SelectItem>
                  {activeProviders.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} <span className="text-muted-foreground">({p.kind})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 min-w-[240px]">
              <label className="text-xs text-muted-foreground mb-1 block">Modèle</label>
              <Select value={bulkModel} onValueChange={setBulkModel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNCHANGED}>— inchangé —</SelectItem>
                  {COMMON_MODELS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                  <SelectItem value={MODEL_CUSTOM}>Autre (saisie libre)…</SelectItem>
                </SelectContent>
              </Select>
              {bulkModel === MODEL_CUSTOM && (
                <Input
                  className="mt-2"
                  placeholder="provider/model-id"
                  value={customModel}
                  onChange={(e) => setCustomModel(e.target.value)}
                />
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={reset} disabled={mutation.isPending}>
                Annuler
              </Button>
              <Button onClick={apply} disabled={!canApply || mutation.isPending}>
                {mutation.isPending ? "Application…" : `Appliquer à ${selected.size}`}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Chargement…</p>}
      <div className="grid gap-3">
        {tasks.map((t) => {
          const checked = selected.has(t.slug);
          return (
            <Card
              key={t.id}
              className={`p-4 transition-colors ${
                checked ? "border-primary bg-accent/30" : "hover:bg-accent/40"
              }`}
            >
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={checked}
                  onCheckedChange={(c) => toggleOne(t.slug, !!c)}
                  className="mt-1"
                  aria-label={`Sélectionner ${t.label}`}
                />
                <Link
                  to="/admin/ai/tasks/$slug"
                  params={{ slug: t.slug }}
                  className="flex-1 block"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-medium">{t.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {t.description}
                      </div>
                      <div className="mt-2 flex gap-2 items-center text-xs flex-wrap">
                        <Badge variant="secondary">{t.slug}</Badge>
                        {(() => {
                          const mode = (t as { execution_mode?: string }).execution_mode ?? "llm";
                          if (mode === "ml") return <Badge className="bg-violet-600 hover:bg-violet-700">ML interne</Badge>;
                          if (mode === "both") return <Badge className="bg-gradient-to-r from-blue-600 to-violet-600">LLM + ML</Badge>;
                          return <Badge variant="outline">LLM</Badge>;
                        })()}
                        <span className="text-muted-foreground">modèle :</span>
                        <code className="text-[11px] bg-muted px-1.5 py-0.5 rounded">
                          {t.model}
                        </code>
                        {t.provider && (
                          <>
                            <span className="text-muted-foreground">via</span>
                            <Badge variant="outline">{t.provider.name}</Badge>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      v{t.current_version}
                    </div>
                  </div>
                </Link>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
