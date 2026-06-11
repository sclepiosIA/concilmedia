import { createFileRoute, Outlet, redirect, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Users, LogOut, LayoutDashboard, Settings, Layers, Sparkles, GitBranch, UsersRound, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isAdmin } from "@/lib/admin/ai.functions";
import { AiHealthBanner, AiHealthIndicator } from "@/components/ai/AiHealthBanner";
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
  const isAdminFn = useServerFn(isAdmin);
  const adminQ = useQuery({ queryKey: ["is-admin"], queryFn: () => isAdminFn(), staleTime: 5 * 60 * 1000 });
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
            <Link
              to="/conciliation/supervision"
              className="text-sm font-medium px-3 py-2 rounded-full text-ink-2 hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-1.5"
              activeProps={{ className: "text-sm font-medium px-3 py-2 rounded-full bg-accent text-accent-foreground flex items-center gap-1.5" }}
            >
              <GitBranch className="h-4 w-4" /> Supervision
            </Link>
            <Link
              to="/equipe"
              className="text-sm font-medium px-3 py-2 rounded-full text-ink-2 hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-1.5"
              activeProps={{ className: "text-sm font-medium px-3 py-2 rounded-full bg-accent text-accent-foreground flex items-center gap-1.5" }}
            >
              <UsersRound className="h-4 w-4" /> Équipe
            </Link>
            <Link
              to="/risk-population"
              className="text-sm font-medium px-3 py-2 rounded-full text-ink-2 hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-1.5"
              activeProps={{ className: "text-sm font-medium px-3 py-2 rounded-full bg-accent text-accent-foreground flex items-center gap-1.5" }}
            >
              <Activity className="h-4 w-4" /> Risque population
            </Link>
            <Link
              to="/architecture-ia"
              className="text-sm font-medium px-3 py-2 rounded-full text-ink-2 hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-1.5"
              activeProps={{ className: "text-sm font-medium px-3 py-2 rounded-full bg-accent text-accent-foreground flex items-center gap-1.5" }}
            >
              <Layers className="h-4 w-4" /> Architecture IA
            </Link>
            <Link
              to="/ameliorations"
              className="text-sm font-medium px-3 py-2 rounded-full text-ink-2 hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-1.5"
              activeProps={{ className: "text-sm font-medium px-3 py-2 rounded-full bg-accent text-accent-foreground flex items-center gap-1.5" }}
            >
              <Sparkles className="h-4 w-4" /> Pistes d'amélioration
            </Link>
            {adminQ.data?.isAdmin && (
              <Link
                to="/admin/ai"
                className="text-sm font-medium px-3 py-2 rounded-full text-ink-2 hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-1.5"
                activeProps={{ className: "text-sm font-medium px-3 py-2 rounded-full bg-accent text-accent-foreground flex items-center gap-1.5" }}
              >
                <Settings className="h-4 w-4" /> Admin IA
              </Link>
            )}
            <AiHealthIndicator />
            <Button variant="ghost" size="sm" onClick={signOut} aria-label="Se déconnecter">
              <LogOut className="h-4 w-4" />
            </Button>
          </nav>
        </div>
      </header>
      <AiHealthBanner />
      <main><Outlet /></main>
    </div>
  );
}
