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
      </div>
      <Outlet />
    </div>
  );
}
