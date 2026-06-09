import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Sparkles, ShieldCheck, Activity } from "lucide-react";
import logoAsset from "@/assets/concilmed-logo.png.asset.json";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({ meta: [{ title: "Connexion — ConcilMed·IA" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/patients" });
    });
  }, [navigate]);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) toast.error(error.message);
    else navigate({ to: "/patients" });
  };

  const signUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/patients` },
    });
    setLoading(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Compte créé");
      navigate({ to: "/patients" });
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* Hero brand */}
      <div className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-gradient-brand text-white p-12">
        <div className="absolute inset-0 opacity-30 pointer-events-none"
             style={{ background: "radial-gradient(60% 50% at 80% 10%, rgba(255,255,255,.25), transparent), radial-gradient(50% 60% at 10% 90%, rgba(45,212,191,.35), transparent)" }} />
        <div className="relative">
          <img src={logoAsset.url} alt="ConcilMed IA" className="h-16 w-16 rounded-full ring-2 ring-white/30 shadow-brand" />
        </div>
        <div className="relative space-y-6">
          <h1 className="font-display text-5xl font-bold leading-[1.05] tracking-tight">
            L'IA au service de la <span className="text-teal-200">conciliation médicamenteuse</span>
          </h1>
          <p className="text-white/80 text-lg max-w-md">
            Analysez les traitements habituels et les prescriptions hospitalières en quelques secondes — précision pharmaceutique, sécurité patient.
          </p>
          <ul className="space-y-3 pt-4 text-sm">
            <li className="flex items-center gap-3"><Sparkles className="h-4 w-4 text-teal-200" /> Détection automatique des divergences</li>
            <li className="flex items-center gap-3"><ShieldCheck className="h-4 w-4 text-teal-200" /> Validation pharmacien intégrée</li>
            <li className="flex items-center gap-3"><Activity className="h-4 w-4 text-teal-200" /> Audit IA vs Humain quantifié</li>
          </ul>
        </div>
        <div className="relative text-xs text-white/60 uppercase tracking-[0.2em]">Innover · Collaborer · Impacter</div>
      </div>

      {/* Auth card */}
      <div className="flex items-center justify-center p-6 lg:p-12">
        <Card className="w-full max-w-md border-border/60 shadow-elegant">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 lg:hidden">
              <img src={logoAsset.url} alt="ConcilMed IA" className="h-14 w-14 rounded-full ring-1 ring-border" />
            </div>
            <CardTitle className="font-display text-2xl">
              ConcilMed<span className="text-teal-600">·IA</span>
            </CardTitle>
            <CardDescription>Connectez-vous pour accéder au module</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin">
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="signin">Connexion</TabsTrigger>
                <TabsTrigger value="signup">Inscription</TabsTrigger>
              </TabsList>
              <TabsContent value="signin">
                <form onSubmit={signIn} className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pwd">Mot de passe</Label>
                    <Input id="pwd" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>Se connecter</Button>
                </form>
              </TabsContent>
              <TabsContent value="signup">
                <form onSubmit={signUp} className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="email2">Email</Label>
                    <Input id="email2" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pwd2">Mot de passe</Label>
                    <Input id="pwd2" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>Créer un compte</Button>
                </form>
              </TabsContent>
            </Tabs>
            <p className="text-xs text-muted-foreground text-center mt-4">
              <Link to="/" className="hover:underline">Retour à l'accueil</Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
