import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { listOrgMembers } from "@/lib/team/listTeam.functions";
import { assignPatient, setWorkflowStatus, WORKFLOW_STATUSES, type WorkflowStatus } from "@/lib/team/assignPatient.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { WorkflowStatusBadge, WORKFLOW_META } from "./WorkflowStatusBadge";
import { TransferHistory } from "./TransferHistory";
import { toast } from "sonner";
import { UserCog } from "lucide-react";

export function AssignmentPanel({ patientId }: { patientId: string }) {
  const qc = useQueryClient();
  const [toUser, setToUser] = useState<string>("");
  const [motif, setMotif] = useState("");

  const patientQ = useQuery({
    queryKey: ["patient-workflow", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients")
        .select("id, organization_id, assigned_to, workflow_status, service")
        .eq("id", patientId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const orgId = patientQ.data?.organization_id ?? null;

  const membersQ = useQuery({
    queryKey: ["org-members", orgId],
    enabled: !!orgId,
    queryFn: async () => listOrgMembers({ data: { organizationId: orgId! } }),
  });

  const meQ = useQuery({
    queryKey: ["me"],
    queryFn: async () => (await supabase.auth.getUser()).data.user,
    staleTime: 60_000,
  });

  const transferMut = useMutation({
    mutationFn: async (args: { toUserId: string | null; motif?: string }) =>
      assignPatient({ data: { patientId, toUserId: args.toUserId, motif: args.motif } }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["patient-workflow", patientId] });
      qc.invalidateQueries({ queryKey: ["transfers", patientId] });
      qc.invalidateQueries({ queryKey: ["patients"] });
      setMotif("");
      if (!r.unchanged) toast.success("Affectation mise à jour");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  const statusMut = useMutation({
    mutationFn: async (status: WorkflowStatus) => setWorkflowStatus({ data: { patientId, status } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patient-workflow", patientId] });
      qc.invalidateQueries({ queryKey: ["patients"] });
      toast.success("Statut mis à jour");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  if (!patientQ.data) return null;
  const currentAssignee = patientQ.data.assigned_to as string | null;
  const currentStatus = (patientQ.data.workflow_status as WorkflowStatus) ?? "a_faire";
  const myId = meQ.data?.id ?? null;
  const isMine = myId !== null && currentAssignee === myId;

  const memberLabel = (uid: string | null) => {
    if (!uid) return "—";
    const m = membersQ.data?.find((x) => x.user_id === uid);
    return m?.display_name || (m ? `Membre (${uid.slice(0, 6)}…)` : `Utilisateur (${uid.slice(0, 6)}…)`);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <UserCog className="h-4 w-4 text-primary" /> Affectation & workflow
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid sm:grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Statut</div>
            <div className="mt-1"><WorkflowStatusBadge status={currentStatus} /></div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Pharmacien assigné</div>
            <div className="mt-1 font-medium">{memberLabel(currentAssignee)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Service</div>
            <div className="mt-1 font-medium">{patientQ.data.service ?? "—"}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Label className="text-xs">Changer le statut :</Label>
          <Select value={currentStatus} onValueChange={(v) => statusMut.mutate(v as WorkflowStatus)}>
            <SelectTrigger className="w-[220px] h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              {WORKFLOW_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{WORKFLOW_META[s].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!isMine && myId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => transferMut.mutate({ toUserId: myId, motif: "Prise en charge" })}
              disabled={transferMut.isPending}
            >
              Me l'attribuer
            </Button>
          )}
        </div>

        {orgId && (
          <div className="space-y-2 border-t pt-3">
            <Label className="text-xs">Transférer à un autre pharmacien</Label>
            <div className="flex flex-wrap items-start gap-2">
              <Select value={toUser} onValueChange={setToUser}>
                <SelectTrigger className="w-[260px] h-9"><SelectValue placeholder="Sélectionner…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unassign">Désassigner</SelectItem>
                  {(membersQ.data ?? [])
                    .filter((m) => m.user_id !== currentAssignee)
                    .map((m) => (
                      <SelectItem key={m.user_id} value={m.user_id}>
                        {m.display_name || `${m.role} (${m.user_id.slice(0, 6)}…)`}
                        {m.service ? ` · ${m.service}` : ""}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Textarea
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                placeholder="Motif (optionnel)"
                rows={2}
                className="flex-1 min-w-[200px] text-sm"
              />
              <Button
                size="sm"
                disabled={!toUser || transferMut.isPending}
                onClick={() =>
                  transferMut.mutate({
                    toUserId: toUser === "__unassign" ? null : toUser,
                    motif: motif || undefined,
                  })
                }
              >
                Transférer
              </Button>
            </div>
          </div>
        )}

        {!orgId && (
          <div className="text-xs text-muted-foreground italic border-t pt-3">
            Patient non rattaché à une organisation : transferts d'équipe indisponibles.
          </div>
        )}

        <TransferHistory patientId={patientId} memberLabel={memberLabel} />
      </CardContent>
    </Card>
  );
}
