import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, Play, Check, X } from "lucide-react";
import { toast } from "sonner";
import { getCohortPatients } from "@/lib/cohort/cohort.functions";
import { runOnePatientConciliation } from "@/lib/cohort/runCohortConciliation.functions";

export function CohortRunTab({ cohortId }: { cohortId: string }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getCohortPatients);
  const runOne = useServerFn(runOnePatientConciliation);
  const data = useQuery({ queryKey: ["cohortPatients", cohortId], queryFn: () => getFn({ data: { cohortId } }) });

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusByPid, setStatusByPid] = useState<Record<string, "pending" | "running" | "ok" | "ko">>({});

  const start = async () => {
    if (!data.data) return;
    const patients = data.data.patients;
    if (patients.length === 0) { toast.error("Aucun patient dans cette cohorte"); return; }
    setRunning(true);
    setProgress(0);
    const init: Record<string, "pending"> = {};
    patients.forEach((p) => (init[p.id] = "pending"));
    setStatusByPid(init);
    let done = 0;
    for (const p of patients) {
      setStatusByPid((s) => ({ ...s, [p.id]: "running" }));
      try {
        const r = await runOne({ data: { patientId: p.id } });
        setStatusByPid((s) => ({ ...s, [p.id]: r.ok ? "ok" : "ko" }));
      } catch {
        setStatusByPid((s) => ({ ...s, [p.id]: "ko" }));
      }
      done++;
      setProgress(Math.round((done / patients.length) * 100));
    }
    setRunning(false);
    qc.invalidateQueries({ queryKey: ["cohortPatients", cohortId] });
    toast.success("Conciliation IA cohorte terminée");
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 flex items-center gap-3 flex-wrap">
        <div className="flex-1">
          <h3 className="font-semibold">Conciliation IA de la cohorte</h3>
          <p className="text-xs text-muted-foreground">
            {data.data?.patients.length ?? 0} patient(s) — {data.data?.episodes.length ?? 0} épisode(s)
          </p>
        </div>
        <Button onClick={start} disabled={running || !data.data?.patients.length}>
          {running ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Play className="h-4 w-4 mr-1" />}
          Lancer la conciliation IA
        </Button>
      </Card>

      {(running || progress > 0) && (
        <div className="space-y-1">
          <Progress value={progress} />
          <div className="text-xs text-muted-foreground text-center">{progress}%</div>
        </div>
      )}

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted text-xs">
            <tr>
              <th className="text-left p-2">Patient</th>
              <th className="text-left p-2">Statut</th>
              <th className="text-left p-2">Divergences détectées</th>
            </tr>
          </thead>
          <tbody>
            {data.data?.patients.map((p) => {
              const ep = data.data?.episodes.find((e) => e.patient_id === p.id);
              const nb = ep ? data.data?.divergencesByEp[ep.id] ?? 0 : 0;
              const st = statusByPid[p.id];
              return (
                <tr key={p.id} className="border-t">
                  <td className="p-2 font-medium">{p.nom?.toUpperCase()} {p.prenom}</td>
                  <td className="p-2">
                    {st === "running" && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                    {st === "ok" && <Check className="h-4 w-4 text-green-600" />}
                    {st === "ko" && <X className="h-4 w-4 text-destructive" />}
                    {!st && <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="p-2"><Badge variant={nb > 0 ? "default" : "outline"}>{nb}</Badge></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
