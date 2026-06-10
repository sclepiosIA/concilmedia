import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listTasks } from "@/lib/admin/ai.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/admin/ai")({
  component: AdminAiIndex,
});

function AdminAiIndex() {
  const fn = useServerFn(listTasks);
  const { data, isLoading } = useQuery({ queryKey: ["admin-ai-tasks"], queryFn: () => fn() });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Tâches IA</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Configure les prompts système, modèles et fournisseurs pour chaque endpoint IA.
      </p>
      {isLoading && <p className="text-sm text-muted-foreground">Chargement…</p>}
      <div className="grid gap-3">
        {(data ?? []).map((t) => (
          <Link
            key={t.id}
            to="/admin/ai/tasks/$slug"
            params={{ slug: t.slug }}
            className="block"
          >
            <Card className="p-4 hover:bg-accent/40 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-medium">{t.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>
                  <div className="mt-2 flex gap-2 items-center text-xs">
                    <Badge variant="secondary">{t.slug}</Badge>
                    <span className="text-muted-foreground">modèle :</span>
                    <code className="text-[11px] bg-muted px-1.5 py-0.5 rounded">{t.model}</code>
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
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
