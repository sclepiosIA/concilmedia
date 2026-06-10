import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listProviders, upsertProvider, deleteProvider } from "@/lib/admin/ai.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/ai/providers")({
  component: ProvidersPage,
});

type ProviderRow = {
  id: string;
  name: string;
  kind: string;
  base_url: string | null;
  extra_config: Record<string, unknown> | null;
  is_active: boolean;
  has_key: boolean;
};

const KINDS = [
  { value: "lovable", label: "Lovable AI Gateway" },
  { value: "openai", label: "OpenAI" },
  { value: "azure_openai", label: "Azure OpenAI" },
  { value: "google", label: "Google Gemini" },
  { value: "anthropic", label: "Anthropic" },
  { value: "openai_compatible", label: "OpenAI-compatible (custom)" },
];

function ProviderForm({ initial, onSaved, onClose }: { initial?: ProviderRow | null; onSaved: () => void; onClose: () => void }) {
  const upsertFn = useServerFn(upsertProvider);
  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState(initial?.kind ?? "openai");
  const [baseUrl, setBaseUrl] = useState(initial?.base_url ?? "");
  const [apiKey, setApiKey] = useState("");
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [resourceName, setResourceName] = useState((initial?.extra_config?.resource_name as string) ?? "");
  const [apiVersion, setApiVersion] = useState((initial?.extra_config?.api_version as string) ?? "");
  const initialDeployments = Array.isArray(initial?.extra_config?.deployments)
    ? (initial?.extra_config?.deployments as string[]).join("\n")
    : "";
  const [deployments, setDeployments] = useState(initialDeployments);

  const save = useMutation({
    mutationFn: () =>
      upsertFn({
        data: {
          id: initial?.id,
          name,
          kind: kind as "lovable" | "openai" | "azure_openai" | "google" | "anthropic" | "openai_compatible",
          base_url: baseUrl || null,
          is_active: isActive,
          api_key: apiKey || undefined,
          extra_config:
            kind === "azure_openai"
              ? {
                  resource_name: resourceName || undefined,
                  api_version: apiVersion || undefined,
                  deployments: deployments
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean),
                }
              : {},
        },
      }),
    onSuccess: () => {
      toast.success("Fournisseur enregistré");
      onSaved();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div><Label>Nom</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div>
        <Label>Type</Label>
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {kind !== "azure_openai" && (
        <div>
          <Label>Endpoint {kind === "openai_compatible" ? "(requis)" : "(optionnel)"}</Label>
          <Input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={
              kind === "openai" ? "https://api.openai.com/v1" :
              kind === "google" ? "https://generativelanguage.googleapis.com/v1beta" :
              kind === "anthropic" ? "https://api.anthropic.com/v1" :
              kind === "lovable" ? "https://ai.gateway.lovable.dev/v1" :
              "https://…"
            }
          />
        </div>
      )}
      {kind === "azure_openai" && (
        <>
          <div>
            <Label>Endpoint complet (optionnel)</Label>
            <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://my-resource.openai.azure.com/openai/deployments" />
            <p className="text-[11px] text-muted-foreground mt-1">Laisser vide pour utiliser le « Resource name » ci-dessous.</p>
          </div>
          <div>
            <Label>Resource name</Label>
            <Input value={resourceName} onChange={(e) => setResourceName(e.target.value)} placeholder="my-resource" />
            <p className="text-[11px] text-muted-foreground mt-1">Construit l'endpoint https://&lt;resource&gt;.openai.azure.com</p>
          </div>
          <div>
            <Label>API version</Label>
            <Input value={apiVersion} onChange={(e) => setApiVersion(e.target.value)} placeholder="2024-10-21" />
          </div>
          <div>
            <Label>Déploiements / modèles (un par ligne)</Label>
            <textarea
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={deployments}
              onChange={(e) => setDeployments(e.target.value)}
              placeholder={"gpt-4o\ngpt-4o-mini\no3-mini"}
            />
            <p className="text-[11px] text-muted-foreground mt-1">Nom du déploiement Azure = identifiant de modèle utilisé dans les tâches.</p>
          </div>
        </>
      )}
      <div>
        <Label>
          Clé API{kind === "lovable" ? " (optionnel — sinon LOVABLE_API_KEY)" : ""}
          {initial?.has_key && <span className="text-xs text-muted-foreground ml-1">(laisser vide pour conserver)</span>}
        </Label>
        <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-…" autoComplete="off" />
      </div>
      <div className="flex items-center gap-2"><Switch checked={isActive} onCheckedChange={setIsActive} /><Label>Actif</Label></div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>Annuler</Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending || !name}>Enregistrer</Button>
      </DialogFooter>
    </div>
  );
}

function ProvidersPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listProviders);
  const deleteFn = useServerFn(deleteProvider);
  const { data, isLoading } = useQuery({ queryKey: ["admin-ai-providers"], queryFn: () => listFn() });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProviderRow | null>(null);

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Supprimé");
      qc.invalidateQueries({ queryKey: ["admin-ai-providers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Fournisseurs IA</h1>
          <p className="text-sm text-muted-foreground">Configure les providers (Lovable, OpenAI, Azure, Google, Anthropic…)</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditing(null)}>+ Nouveau</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Modifier" : "Ajouter"} un fournisseur</DialogTitle></DialogHeader>
            <ProviderForm
              initial={editing}
              onSaved={() => qc.invalidateQueries({ queryKey: ["admin-ai-providers"] })}
              onClose={() => { setOpen(false); setEditing(null); }}
            />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Chargement…</p>}
      <div className="space-y-2">
        {((data ?? []) as ProviderRow[]).map((p) => (
          <Card key={p.id} className="p-4 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{p.name}</span>
                <Badge variant="outline">{p.kind}</Badge>
                {!p.is_active && <Badge variant="secondary">inactif</Badge>}
                {p.has_key && <Badge variant="default" className="text-[10px]">🔒 clé</Badge>}
              </div>
              {p.base_url && <code className="text-[11px] text-muted-foreground">{p.base_url}</code>}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setEditing(p); setOpen(true); }}>Modifier</Button>
              <Button variant="ghost" size="sm" onClick={() => del.mutate(p.id)}>Supprimer</Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
