import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { listMyOrganizations, listOrgMembers, updateMemberService } from "@/lib/team/listTeam.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/team")({
  head: () => ({ meta: [{ title: "Équipe — Admin" }] }),
  component: AdminTeamPage,
});

function AdminTeamPage() {
  const qc = useQueryClient();
  const orgsQ = useQuery({ queryKey: ["my-orgs"], queryFn: () => listMyOrganizations() });
  const [orgId, setOrgId] = useState<string>("");

  useEffect(() => {
    if (!orgId && orgsQ.data && orgsQ.data.length > 0) {
      const admin = orgsQ.data.find((o) => o.role === "admin");
      setOrgId((admin ?? orgsQ.data[0]).id);
    }
  }, [orgsQ.data, orgId]);

  const membersQ = useQuery({
    queryKey: ["org-members", orgId],
    enabled: !!orgId,
    queryFn: () => listOrgMembers({ data: { organizationId: orgId } }),
  });

  const updateMut = useMutation({
    mutationFn: (args: { userId: string; service: string | null; displayName: string | null }) =>
      updateMemberService({ data: { organizationId: orgId, userId: args.userId, service: args.service, displayName: args.displayName } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-members", orgId] });
      toast.success("Membre mis à jour");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  const myOrg = orgsQ.data?.find((o) => o.id === orgId);
  const canEdit = myOrg?.role === "admin";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><Users className="h-5 w-5" /> Équipe pharmaceutique</h2>
          <p className="text-sm text-muted-foreground">Gérez les services et noms affichés des membres d'une organisation.</p>
        </div>
        <Select value={orgId} onValueChange={setOrgId}>
          <SelectTrigger className="w-[280px]"><SelectValue placeholder="Organisation…" /></SelectTrigger>
          <SelectContent>
            {(orgsQ.data ?? []).map((o) => (
              <SelectItem key={o.id} value={o.id}>{o.nom} ({o.role})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!orgId && (
        <Card><CardContent className="py-10 text-center text-muted-foreground">Aucune organisation à gérer.</CardContent></Card>
      )}

      {orgId && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Membres ({(membersQ.data ?? []).length})</CardTitle></CardHeader>
          <CardContent>
            {!canEdit && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-3">
                Vous n'êtes pas admin de cette organisation : édition désactivée.
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b">
                  <tr>
                    <th className="text-left py-2">Utilisateur</th>
                    <th className="text-left py-2">Rôle</th>
                    <th className="text-left py-2">Nom affiché</th>
                    <th className="text-left py-2">Service</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(membersQ.data ?? []).map((m) => (
                    <MemberRow key={m.user_id} member={m} canEdit={!!canEdit} onSave={(s, dn) => updateMut.mutate({ userId: m.user_id, service: s, displayName: dn })} pending={updateMut.isPending} />
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              L'ajout/retrait de membres se fait pour l'instant par l'admin global. Une invitation par email viendra en v2.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MemberRow({
  member, canEdit, onSave, pending,
}: {
  member: { user_id: string; role: string; service: string | null; display_name: string | null };
  canEdit: boolean;
  onSave: (service: string | null, displayName: string | null) => void;
  pending: boolean;
}) {
  const [service, setService] = useState(member.service ?? "");
  const [name, setName] = useState(member.display_name ?? "");
  const changed = service !== (member.service ?? "") || name !== (member.display_name ?? "");
  return (
    <tr className="border-b last:border-b-0">
      <td className="py-2 font-mono text-xs">{member.user_id.slice(0, 8)}…</td>
      <td className="py-2"><Badge variant="outline" className="capitalize">{member.role}</Badge></td>
      <td className="py-2"><Input value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} placeholder="Nom Prénom" className="h-8" /></td>
      <td className="py-2"><Input value={service} onChange={(e) => setService(e.target.value)} disabled={!canEdit} placeholder="ex. Gériatrie" className="h-8" /></td>
      <td className="py-2 text-right">
        <Button
          size="sm"
          variant="outline"
          disabled={!canEdit || !changed || pending}
          onClick={() => onSave(service || null, name || null)}
        >
          Enregistrer
        </Button>
      </td>
    </tr>
  );
}
