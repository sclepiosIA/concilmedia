import { useQuery } from "@tanstack/react-query";
import { listTransfers } from "@/lib/team/assignPatient.functions";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowRight, Clock } from "lucide-react";

interface Props {
  patientId: string;
  memberLabel: (uid: string | null) => string;
}

export function TransferHistory({ patientId, memberLabel }: Props) {
  const q = useQuery({
    queryKey: ["transfers", patientId],
    queryFn: () => listTransfers({ data: { patientId } }),
  });

  if (q.isLoading) return null;
  const rows = q.data ?? [];
  if (rows.length === 0) {
    return (
      <div className="text-xs text-muted-foreground border-t pt-3 flex items-center gap-1.5">
        <Clock className="h-3 w-3" /> Aucun transfert enregistré.
      </div>
    );
  }
  return (
    <div className="border-t pt-3">
      <div className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
        <Clock className="h-3 w-3" /> Historique ({rows.length})
      </div>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.id} className="text-xs flex items-start gap-2">
            <span className="text-muted-foreground tabular-nums shrink-0">
              {format(new Date(r.created_at), "d MMM HH:mm", { locale: fr })}
            </span>
            <span className="font-medium">{memberLabel(r.from_user_id)}</span>
            <ArrowRight className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
            <span className="font-medium">{memberLabel(r.to_user_id)}</span>
            {r.motif && <span className="text-muted-foreground italic">— {r.motif}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
