import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { listMyOrganizations, listOrgMembers } from "@/lib/team/listTeam.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WorkflowStatusBadge, WORKFLOW_META } from "@/components/team/WorkflowStatusBadge";
import type { WorkflowStatus } from "@/lib/team/assignPatient.functions";
import { format, formatDistanceToNowStrict } from "date-fns";
import { fr } from "date-fns/locale";
import { Users, Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/conciliation/supervision")({
  head: () => ({ meta: [{ title: "Supervision conciliation" }] }),
  component: SupervisionPage,
});

const COLUMNS: WorkflowStatus[] = ["a_faire", "en_cours", "en_attente_validation", "valide"];

interface Pat {
  id: string;
  nom: string;
  prenom: string;
  service: string | null;
  assigned_to: string | null;
  workflow_status: WorkflowStatus;
  updated_at: string;
  created_at: string;
}

function SupervisionPage() {
  const orgsQ = useQuery({ queryKey: ["my-orgs"], queryFn: () => listMyOrganizations() });
  const [orgId, setOrgId] = useState<string>("");

  useEffect(() => {
    if (!orgId && orgsQ.data && orgsQ.data.length > 0) setOrgId(orgsQ.data[0].id);
  }, [orgsQ.data, orgId]);

  const membersQ = useQuery({
    queryKey: ["org-members", orgId],
    enabled: !!orgId,
    queryFn: () => listOrgMembers({ data: { organizationId: orgId } }),
  });

  const patientsQ = useQuery({
    queryKey: ["supervision-patients", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<Pat[]> => {
      const { data, error } = await supabase
        .from("patients")
        .select("id, nom, prenom, service, assigned_to, workflow_status, updated_at, created_at")
        .eq("organization_id", orgId)
        .neq("archived", true)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Pat[];
    },
  });

  const memberLabel = (uid: string | null) => {
    if (!uid) return "Non assigné";
    const m = membersQ.data?.find((x) => x.user_id === uid);
    return m?.display_name || `Membre ${uid.slice(0, 6)}`;
  };

  const grouped = useMemo(() => {
    const g: Record<WorkflowStatus, Pat[]> = {
      a_faire: [], en_cours: [], en_attente_validation: [], valide: [], clos: [],
    };
    for (const p of patientsQ.data ?? []) {
      g[(p.workflow_status ?? "a_faire") as WorkflowStatus].push(p);
    }
    return g;
  }, [patientsQ.data]);

  const kpiStale = useMemo(() => {
    const since = Date.now() - 48 * 3600 * 1000;
    return (patientsQ.data ?? []).filter(
      (p) => p.workflow_status !== "valide" && p.workflow_status !== "clos" && new Date(p.updated_at).getTime() < since,
    ).length;
  }, [patientsQ.data]);

  const perPharma = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of patientsQ.data ?? []) {
      if (p.workflow_status === "valide" || p.workflow_status === "clos") continue;
      const k = p.assigned_to ?? "__none";
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [patientsQ.data]);

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" /> Supervision pharmaceutique
          </h1>
          <p className="text-sm text-muted-foreground">File partagée d'une organisation — pilotage des dossiers en cours.</p>
        </div>
        <Select value={orgId} onValueChange={setOrgId}>
          <SelectTrigger className="w-[260px]"><SelectValue placeholder="Organisation…" /></SelectTrigger>
          <SelectContent>
            {(orgsQ.data ?? []).map((o) => (
              <SelectItem key={o.id} value={o.id}>{o.nom}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!orgsQ.isLoading && (orgsQ.data ?? []).length === 0 && (
        <Card><CardContent className="py-10 text-center text-muted-foreground">
          Vous n'êtes membre d'aucune organisation. Demandez à un admin de vous ajouter.
        </CardContent></Card>
      )}

      {orgId && (
        <>
          <div className="grid sm:grid-cols-4 gap-3 mb-4">
            {COLUMNS.map((c) => (
              <Card key={c}>
                <CardContent className="py-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">{WORKFLOW_META[c].label}</div>
                  <div className="text-2xl font-bold mt-1">{grouped[c].length}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-3 mb-6">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Dossiers par pharmacien (actifs)</CardTitle></CardHeader>
              <CardContent className="pt-0">
                {perPharma.length === 0 && <div className="text-xs text-muted-foreground">Aucun dossier actif</div>}
                <ul className="space-y-1 text-sm">
                  {perPharma.map(([uid, n]) => (
                    <li key={uid} className="flex items-center justify-between">
                      <span>{memberLabel(uid === "__none" ? null : uid)}</span>
                      <span className="font-semibold tabular-nums">{n}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Clock className="h-4 w-4" /> Dossiers sans mouvement &gt; 48 h</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <div className="text-3xl font-bold">{kpiStale}</div>
                <div className="text-xs text-muted-foreground">à relancer en priorité</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
            {COLUMNS.map((status) => (
              <div key={status} className="space-y-2">
                <div className="flex items-center justify-between">
                  <WorkflowStatusBadge status={status} />
                  <span className="text-xs text-muted-foreground">{grouped[status].length}</span>
                </div>
                <div className="space-y-2">
                  {grouped[status].length === 0 && (
                    <div className="text-xs text-muted-foreground italic px-2 py-4 text-center border border-dashed rounded">Vide</div>
                  )}
                  {grouped[status].map((p) => (
                    <Link
                      key={p.id}
                      to="/patients/$patientId"
                      params={{ patientId: p.id }}
                      className="block rounded border bg-card hover:bg-accent/50 transition px-3 py-2"
                    >
                      <div className="font-medium text-sm truncate">{p.nom.toUpperCase()} {p.prenom}</div>
                      <div className="text-xs text-muted-foreground flex items-center justify-between gap-2 mt-1">
                        <span className="truncate">{p.service ?? "—"} · {memberLabel(p.assigned_to)}</span>
                        <span title={format(new Date(p.updated_at), "d MMM yyyy HH:mm", { locale: fr })}>
                          {formatDistanceToNowStrict(new Date(p.updated_at), { locale: fr, addSuffix: true })}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
