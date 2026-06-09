import { createFileRoute, Outlet, redirect, Link, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Users, LogOut, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import logoAsset from "@/assets/concilmed-logo.png.asset.json";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthLayout,
});

function AuthLayout() {
  const router = useRouter();
  const signOut = async () => {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth" });
  };
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 bg-card/80 backdrop-blur sticky top-0 z-40">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/patients" className="flex items-center gap-3 group">
            <span className="relative inline-flex h-10 w-10 items-center justify-center rounded-full ring-1 ring-border overflow-hidden bg-white shadow-elegant">
              <img src={logoAsset.url} alt="ConcilMed IA" className="h-10 w-10 object-cover" />
            </span>
            <span className="flex flex-col leading-none">
              <span className="font-display font-bold text-[17px] tracking-tight text-navy-900">
                ConcilMed<span className="text-teal-600">·IA</span>
              </span>
              <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mt-0.5">
                Conciliation médicamenteuse
              </span>
            </span>
          </Link>
          <nav className="flex items-center gap-1">
            <Link
              to="/"
              className="text-sm font-medium px-3 py-2 rounded-full text-ink-2 hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-1.5"
              activeProps={{ className: "text-sm font-medium px-3 py-2 rounded-full bg-accent text-accent-foreground flex items-center gap-1.5" }}
            >
              <LayoutDashboard className="h-4 w-4" /> Tableau de bord
            </Link>
            <Link
              to="/patients"
              className="text-sm font-medium px-3 py-2 rounded-full text-ink-2 hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-1.5"
              activeProps={{ className: "text-sm font-medium px-3 py-2 rounded-full bg-accent text-accent-foreground flex items-center gap-1.5" }}
            >
              <Users className="h-4 w-4" /> Patients
            </Link>
            <Button variant="ghost" size="sm" onClick={signOut} aria-label="Se déconnecter">
              <LogOut className="h-4 w-4" />
            </Button>
          </nav>
        </div>
      </header>
      <main><Outlet /></main>
    </div>
  );
}
