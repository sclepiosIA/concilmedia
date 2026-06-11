// Piste #14 v1 — Admin · Clés API publique
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { Copy, ExternalLink, KeyRound, Trash2 } from "lucide-react";
import {
  listApiKeys,
  createApiKey,
  revokeApiKey,
} from "@/lib/api/apiKeys.functions";

export const Route = createFileRoute("/_authenticated/admin/api-keys")({
  component: ApiKeysPage,
  head: () => ({ meta: [{ title: "Admin · API publique — ConcilMed" }] }),
});

const SCOPES = [
  { id: "bdpm:read", label: "Lecture BDPM" },
  { id: "analyze:write", label: "Analyse traitements" },
] as const;

function ApiKeysPage() {
  const qc = useQueryClient();
  const fetchKeys = useServerFn(listApiKeys);
  const createFn = useServerFn(createApiKey);
  const revokeFn = useServerFn(revokeApiKey);

  const { data, isLoading } = useQuery({
    queryKey: ["api-keys"],
    queryFn: () => fetchKeys(),
  });

  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["bdpm:read"]);
  const [rate, setRate] = useState(60);
  const [expires, setExpires] = useState<number | "">("");
  const [newKey, setNewKey] = useState<{ plain: string; prefix: string } | null>(null);

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          name,
          scopes: scopes as Array<"bdpm:read" | "analyze:write" | "*">,
          rateLimitPerMinute: rate,
          expiresInDays: typeof expires === "number" ? expires : undefined,
        },
      }),
    onSuccess: (res) => {
      setNewKey({ plain: res.plain, prefix: res.prefix });
      setName("");
      qc.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success("Clé créée. Copiez-la maintenant — elle ne sera plus affichée.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokeFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success("Clé révoquée.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <KeyRound className="h-6 w-6" /> API publique ConcilMed
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Gérez les clés d'accès à <code className="text-xs">/api/public/v1/*</code>. Documentation OpenAPI :{" "}
          <a
            href="/api/public/v1/openapi"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 underline"
          >
            openapi.json <ExternalLink className="h-3 w-3" />
          </a>
        </p>
      </div>

      {newKey && (
        <Alert>
          <AlertTitle>Nouvelle clé — copiez-la maintenant</AlertTitle>
          <AlertDescription className="space-y-2">
            <code className="block bg-muted p-3 rounded font-mono text-sm break-all">{newKey.plain}</code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(newKey.plain);
                toast.success("Copié.");
              }}
            >
              <Copy className="h-3 w-3 mr-1" /> Copier
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setNewKey(null)}>
              Fermer
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Créer une clé</CardTitle>
          <CardDescription>La clé en clair ne sera affichée qu'une seule fois.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Nom</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Intégration LGC X" />
          </div>
          <div>
            <Label>Scopes</Label>
            <div className="flex flex-wrap gap-3 mt-2">
              {SCOPES.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={scopes.includes(s.id)}
                    onCheckedChange={(checked) => {
                      setScopes((cur) => (checked ? [...cur, s.id] : cur.filter((x) => x !== s.id)));
                    }}
                  />
                  <code className="text-xs">{s.id}</code> <span>— {s.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Quota / min</Label>
              <Input
                type="number"
                value={rate}
                onChange={(e) => setRate(Math.max(1, Number(e.target.value) || 60))}
                min={1}
                max={1000}
              />
            </div>
            <div>
              <Label>Expire dans (jours, facultatif)</Label>
              <Input
                type="number"
                value={expires}
                onChange={(e) => setExpires(e.target.value === "" ? "" : Number(e.target.value))}
                min={1}
                placeholder="—"
              />
            </div>
          </div>
          <Button
            onClick={() => create.mutate()}
            disabled={!name || scopes.length === 0 || create.isPending}
          >
            {create.isPending ? "Création…" : "Créer la clé"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Clés existantes</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : !data?.keys.length ? (
            <p className="text-sm text-muted-foreground">Aucune clé.</p>
          ) : (
            <div className="space-y-3">
              {data.keys.map((k) => (
                <div key={k.id} className="flex items-start justify-between border rounded-lg p-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{k.name}</span>
                      <Badge variant={k.status === "active" ? "default" : "secondary"}>{k.status}</Badge>
                    </div>
                    <code className="text-xs text-muted-foreground">{k.key_prefix}…</code>
                    <div className="flex flex-wrap gap-1">
                      {k.scopes.map((s: string) => (
                        <Badge key={s} variant="outline" className="text-xs">
                          {s}
                        </Badge>
                      ))}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Quota {k.rate_limit_per_minute}/min · Créée {new Date(k.created_at).toLocaleDateString()}
                      {k.expires_at ? ` · Expire ${new Date(k.expires_at).toLocaleDateString()}` : ""}
                      {k.last_used_at ? ` · Dernier usage ${new Date(k.last_used_at).toLocaleString()}` : ""}
                    </div>
                  </div>
                  {k.status === "active" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => revoke.mutate(k.id)}
                      disabled={revoke.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
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
