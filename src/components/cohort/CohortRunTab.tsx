import { useState, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Play, Check, X } from "lucide-react";
import { toast } from "sonner";
import { getCohortPatients } from "@/lib/cohort/cohort.functions";
import { runOnePatientConciliation } from "@/lib/cohort/runCohortConciliation.functions";
import { runOnePatientOneModel } from "@/lib/cohort/runCohortMultiModel.functions";
import { AVAILABLE_MODELS, type AvailableModel } from "@/lib/ai/availableModels";

type Status = "pending" | "running" | "ok" | "ko";

export function CohortRunTab({ cohortId }: { cohortId: string }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getCohortPatients);
  const runOne = useServerFn(runOnePatientConciliation);
  const runOneMulti = useServerFn(runOnePatientOneModel);
  const data = useQuery({ queryKey: ["cohortPatients", cohortId], queryFn: () => getFn({ data: { cohortId } }) });

  const [selectedModelKeys, setSelectedModelKeys] = useState<string[]>([AVAILABLE_MODELS[0].key]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  // status[pid][modelKey] = Status
  const [statusByPid, setStatusByPid] = useState<Record<string, Record<string, Status>>>({});
  const [lastRunTag, setLastRunTag] = useState<string | null>(null);

  const selectedModels: AvailableModel[] = useMemo(
    () => AVAILABLE_MODELS.filter((m) => selectedModelKeys.includes(m.key)),
    [selectedModelKeys],
  );

  const toggleModel = (key: string) => {
    setSelectedModelKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const start = async () => {
    if (!data.data) return;
    const patients = data.data.patients;
    if (patients.length === 0) { toast.error("Aucun patient dans cette cohorte"); return; }
    if (selectedModels.length === 0) { toast.error("Sélectionnez au moins un modèle"); return; }

    setRunning(true);
    setProgress(0);
    const init: Record<string, Record<string, Status>> = {};
    patients.forEach((p) => {
      init[p.id] = {};
      selectedModels.forEach((m) => (init[p.id][m.key] = "pending"));
    });
    setStatusByPid(init);

    // Mode mono-modèle Lovable (legacy): conserve l'ancien chemin pour ne pas
    // changer le comportement si l'utilisateur ne sélectionne que le modèle par défaut.
    const isLegacySingle =
      selectedModels.length === 1 && selectedModels[0].key === AVAILABLE_MODELS[0].key;

    const runTag = isLegacySingle ? null : `multi-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    setLastRunTag(runTag);

    const totalSteps = patients.length * selectedModels.length;
    let done = 0;

    for (const p of patients) {
      // Parallèle entre modèles pour le même patient
      const tasks = selectedModels.map(async (m) => {
        setStatusByPid((s) => ({ ...s, [p.id]: { ...s[p.id], [m.key]: "running" } }));
        try {
          if (isLegacySingle) {
            const r = await runOne({ data: { patientId: p.id } });
            return { mKey: m.key, ok: r.ok };
          }
          const r = await runOneMulti({
            data: {
              patientId: p.id,
              runTag: runTag!,
              model: { providerName: m.providerName, modelId: m.modelId, label: m.label },
            },
          });
          return { mKey: m.key, ok: r.ok };
        } catch {
          return { mKey: m.key, ok: false };
        }
      });
      const results = await Promise.allSettled(tasks);
      setStatusByPid((s) => {
        const next = { ...s, [p.id]: { ...s[p.id] } };
        results.forEach((res) => {
          if (res.status === "fulfilled") {
            next[p.id][res.value.mKey] = res.value.ok ? "ok" : "ko";
          }
        });
        return next;
      });
      done += selectedModels.length;
      setProgress(Math.round((done / totalSteps) * 100));
    }
    setRunning(false);
    qc.invalidateQueries({ queryKey: ["cohortPatients", cohortId] });
    qc.invalidateQueries({ queryKey: ["cohortRuns", cohortId] });
    toast.success(
      runTag
        ? `Run multi-modèles terminé (tag : ${runTag.slice(0, 30)}…)`
        : "Conciliation IA cohorte terminée",
    );
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1">
            <h3 className="font-semibold">Conciliation IA de la cohorte — multi-modèles</h3>
            <p className="text-xs text-muted-foreground">
              {data.data?.patients.length ?? 0} patient(s) — {data.data?.episodes.length ?? 0} épisode(s).
              Sélectionnez les LLM à comparer.
            </p>
          </div>
          <Button onClick={start} disabled={running || !data.data?.patients.length || selectedModels.length === 0}>
            {running ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Play className="h-4 w-4 mr-1" />}
            Lancer ({selectedModels.length} modèle{selectedModels.length > 1 ? "s" : ""})
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {AVAILABLE_MODELS.map((m) => (
            <label
              key={m.key}
              className="flex items-start gap-2 p-2 rounded-md border bg-card hover:bg-accent/30 cursor-pointer"
            >
              <Checkbox
                checked={selectedModelKeys.includes(m.key)}
                onCheckedChange={() => toggleModel(m.key)}
                disabled={running}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{m.label}</div>
                {m.hint && <div className="text-xs text-muted-foreground truncate">{m.hint}</div>}
              </div>
            </label>
          ))}
        </div>
        {lastRunTag && (
          <div className="text-xs text-muted-foreground">
            Dernier run tag : <code className="bg-muted px-1 py-0.5 rounded">{lastRunTag}</code> — utilisez l'onglet Résultats pour comparer les modèles.
          </div>
        )}
      </Card>

      {(running || progress > 0) && (
        <div className="space-y-1">
          <Progress value={progress} />
          <div className="text-xs text-muted-foreground text-center">{progress}%</div>
        </div>
      )}

      <Card className="p-0 overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted text-xs">
            <tr>
              <th className="text-left p-2">Patient</th>
              {selectedModels.map((m) => (
                <th key={m.key} className="text-center p-2 whitespace-nowrap">{m.label}</th>
              ))}
              <th className="text-left p-2">Divergences (run actuel)</th>
            </tr>
          </thead>
          <tbody>
            {data.data?.patients.map((p) => {
              const ep = data.data?.episodes.find((e) => e.patient_id === p.id);
              const nb = ep ? data.data?.divergencesByEp[ep.id] ?? 0 : 0;
              return (
                <tr key={p.id} className="border-t">
                  <td className="p-2 font-medium">{p.nom?.toUpperCase()} {p.prenom}</td>
                  {selectedModels.map((m) => {
                    const st = statusByPid[p.id]?.[m.key];
                    return (
                      <td key={m.key} className="p-2 text-center">
                        {st === "running" && <Loader2 className="h-4 w-4 animate-spin text-primary inline" />}
                        {st === "ok" && <Check className="h-4 w-4 text-green-600 inline" />}
                        {st === "ko" && <X className="h-4 w-4 text-destructive inline" />}
                        {!st && <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                    );
                  })}
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
