import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronRight } from "lucide-react";

export function EpisodesSection({ patientId }: { patientId: string }) {
  const { data = [] } = useQuery({
    queryKey: ["episodes", patientId],
    queryFn: async () => (await supabase.from("episodes").select("*").eq("patient_id", patientId).order("date_entree", { ascending: false })).data ?? [],
  });
  if (data.length === 0) return <p className="text-sm text-muted-foreground py-4">Aucun épisode</p>;
  return (
    <div className="space-y-2">
      {data.map((e) => (
        <Link key={e.id} to="/episodes/$episodeId" params={{ episodeId: e.id }}>
          <Card className="hover:bg-accent/50 cursor-pointer">
            <CardContent className="py-3 flex items-center justify-between">
              <div>
                <div className="font-medium">{e.motif || "Épisode"} — {e.service}</div>
                <div className="text-xs text-muted-foreground">{format(new Date(e.date_entree), "d MMM yyyy HH:mm", { locale: fr })}</div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={e.statut === "ouvert" ? "default" : "secondary"}>{e.statut}</Badge>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
