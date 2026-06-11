import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";
import { isAdmin } from "@/lib/admin/ai.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    const r = await isAdmin();
    if (!r.isAdmin) throw redirect({ to: "/patients" });
  },
  component: AdminLayout,
});

function AdminLayout() {
  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6 flex items-center gap-2 text-sm">
        <Link to="/admin/ai" className="font-semibold hover:underline">Admin · IA</Link>
        <span className="text-muted-foreground">·</span>
        <Link to="/admin/ai/providers" className="text-muted-foreground hover:underline">Fournisseurs</Link>
        <span className="text-muted-foreground">·</span>
        <Link to="/admin/ai/rlhf" className="text-muted-foreground hover:underline">RLHF</Link>
        <span className="text-muted-foreground">·</span>
        <Link to="/admin/bdpm" className="text-muted-foreground hover:underline">BDPM</Link>
        <span className="text-muted-foreground">·</span>
        <Link to="/admin/rag" className="text-muted-foreground hover:underline">RAG</Link>
        <span className="text-muted-foreground">·</span>
        <Link to="/admin/import-reel" className="text-muted-foreground hover:underline">Import réel</Link>
        <span className="text-muted-foreground">·</span>
        <Link to="/admin/import-fhir" className="text-muted-foreground hover:underline">Import FHIR</Link>
        <span className="text-muted-foreground">·</span>
        <Link to="/admin/sih-config" className="text-muted-foreground hover:underline">SIH</Link>
        <span className="text-muted-foreground">·</span>
        <Link to="/conciliation/metriques" className="text-muted-foreground hover:underline">Métriques</Link>
        <span className="text-muted-foreground">·</span>
        <Link to="/admin/audit" className="text-muted-foreground hover:underline">Audit</Link>

      </div>


      <Outlet />
    </div>
  );
}
