import { Badge } from "@/components/ui/badge";
import type { WorkflowStatus } from "@/lib/team/assignPatient.functions";

const META: Record<WorkflowStatus, { label: string; cls: string }> = {
  a_faire: { label: "À faire", cls: "bg-slate-100 text-slate-700 border-slate-200" },
  en_cours: { label: "En cours", cls: "bg-blue-100 text-blue-700 border-blue-200" },
  en_attente_validation: { label: "En attente validation", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  valide: { label: "Validé", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  clos: { label: "Clos", cls: "bg-zinc-100 text-zinc-600 border-zinc-200" },
};

export function WorkflowStatusBadge({ status }: { status: WorkflowStatus | string | null | undefined }) {
  const key = (status && status in META ? status : "a_faire") as WorkflowStatus;
  const m = META[key];
  return (
    <Badge variant="outline" className={`${m.cls} font-medium`}>{m.label}</Badge>
  );
}

export const WORKFLOW_META = META;
