import type { MedicationConciliation } from "@/hooks/useMedicationReconciliation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Check, MessageSquare } from "lucide-react";
import { useState } from "react";
import { GRAVITE_LABEL, GRAVITE_COLOR, type Gravite } from "@/lib/clinical/complexityScore";

const typeColors: Record<string, string> = {
  omission: "destructive",
  modification_dose: "default",
  modification_freq: "default",
  ajout: "secondary",
  duplication: "destructive",
  aucune: "outline",
};

const statutLabels: Record<string, string> = {
  non_traite: "Non traité", en_cours: "En cours", resolu: "Résolu", non_applicable: "N/A",
};

export function PharmacistConciliationPanel({
  conciliations,
  onUpdate,
  onValidate,
  isLoading,
}: {
  conciliations: MedicationConciliation[];
  onUpdate: (v: Partial<MedicationConciliation> & { id: string }) => void;
  onValidate: (id: string) => void;
  isLoading: boolean;
}) {
  const [filter, setFilter] = useState<"all" | "non_traite" | "resolu">("non_traite");
  const filtered = conciliations.filter((c) => filter === "all" || c.statut === filter);

  if (isLoading) return <p className="text-sm text-muted-foreground py-4">Chargement…</p>;

  return (
    <div className="space-y-3">
      <div className="flex gap-1">
        {(["non_traite", "all", "resolu"] as const).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
            {f === "all" ? "Tous" : f === "non_traite" ? "À traiter" : "Résolus"}
          </Button>
        ))}
      </div>
      {filtered.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">
          Aucune divergence. Cliquez sur "Détecter divergences" pour lancer l'analyse algorithmique.
        </p>
      )}
      {filtered.map((c) => (
        <ConciliationRow key={c.id} item={c} onUpdate={onUpdate} onValidate={onValidate} />
      ))}
    </div>
  );
}

function ConciliationRow({ item, onUpdate, onValidate }: { item: MedicationConciliation; onUpdate: (v: Partial<MedicationConciliation> & { id: string }) => void; onValidate: (id: string) => void }) {
  const [justifOpen, setJustifOpen] = useState(false);
  const [justif, setJustif] = useState(item.justification ?? "");
  const [action, setAction] = useState(item.action_corrective ?? "");

  return (
    <Card className="p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={(typeColors[item.type_divergence] ?? "default") as "default" | "secondary" | "destructive" | "outline"}>
              {item.type_divergence.replace("_", " ")}
            </Badge>
            <Badge variant="outline">{item.phase}</Badge>
            <Badge variant={item.statut === "resolu" ? "secondary" : "default"}>{statutLabels[item.statut]}</Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
            <div className="border rounded p-2 bg-muted/30">
              <div className="text-xs font-semibold text-muted-foreground mb-1">DOMICILE</div>
              <div className="font-medium">{item.medication_domicile.dci}</div>
              <div className="text-xs text-muted-foreground">
                {item.medication_domicile.dosage} • {item.medication_domicile.posologie}
              </div>
            </div>
            <div className="border rounded p-2">
              <div className="text-xs font-semibold text-muted-foreground mb-1">HÔPITAL</div>
              {item.medication_hospitalisation ? (
                <>
                  <div className="font-medium">{item.medication_hospitalisation.dci}</div>
                  <div className="text-xs text-muted-foreground">
                    {item.medication_hospitalisation.dosage} • {item.medication_hospitalisation.posologie}
                  </div>
                </>
              ) : (
                <span className="text-xs text-destructive">Non prescrit</span>
              )}
            </div>
          </div>
          {item.justification && (
            <div className="text-xs text-muted-foreground border-l-2 border-primary pl-2">
              <strong>Justification :</strong> {item.justification}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <Select value={item.intention} onValueChange={(v) => onUpdate({ id: item.id, intention: v as MedicationConciliation["intention"] })}>
            <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="intentionnel">Intentionnel</SelectItem>
              <SelectItem value="non_intentionnel">Non intentionnel</SelectItem>
              <SelectItem value="a_evaluer">À évaluer</SelectItem>
            </SelectContent>
          </Select>
          <Dialog open={justifOpen} onOpenChange={setJustifOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="h-8"><MessageSquare className="h-3 w-3 mr-1" /> Justifier</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Justification & action</DialogTitle></DialogHeader>
              <div className="space-y-2">
                <Textarea placeholder="Justification clinique" value={justif} onChange={(e) => setJustif(e.target.value)} rows={3} />
                <Textarea placeholder="Action corrective" value={action} onChange={(e) => setAction(e.target.value)} rows={2} />
                <Button onClick={() => { onUpdate({ id: item.id, justification: justif, action_corrective: action }); setJustifOpen(false); }}>Enregistrer</Button>
              </div>
            </DialogContent>
          </Dialog>
          {item.statut !== "resolu" && (
            <Button size="sm" onClick={() => onValidate(item.id)} className="h-8"><Check className="h-3 w-3 mr-1" /> Valider</Button>
          )}
        </div>
      </div>
    </Card>
  );
}
