import { createFileRoute, Outlet, redirect, Link, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Pill, Users, LogOut, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";

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
      <header className="border-b bg-card sticky top-0 z-40">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/patients" className="flex items-center gap-2 font-semibold">
            <Pill className="h-5 w-5 text-primary" />
            <span>Conciliation Médicamenteuse</span>
          </Link>
          <nav className="flex items-center gap-1">
            <Link to="/" className="text-sm px-3 py-2 rounded-md hover:bg-accent flex items-center gap-1.5">
              <LayoutDashboard className="h-4 w-4" /> Tableau de bord
            </Link>
            <Link to="/patients" className="text-sm px-3 py-2 rounded-md hover:bg-accent flex items-center gap-1.5">
              <Users className="h-4 w-4" /> Patients
            </Link>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </nav>
        </div>
      </header>
      <main><Outlet /></main>
    </div>
  );
}
