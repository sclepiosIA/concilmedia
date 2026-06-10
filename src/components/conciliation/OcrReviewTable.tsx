import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CheckCircle2, AlertCircle, HelpCircle, Users, User } from "lucide-react";
import type { ExtractedMedication } from "@/lib/conciliation/extractOrdonnance.functions";

export interface ReviewableMed extends ExtractedMedication {
  _include: boolean;
}

interface Props {
  meds: ReviewableMed[];
  onChange: (next: ReviewableMed[]) => void;
}

function MatchBadge({ m }: { m: ExtractedMedication }) {
  if (m.match_status === "exact") return <Badge className="bg-emerald-600 hover:bg-emerald-600"><CheckCircle2 className="h-3 w-3 mr-1" /> BDPM OK</Badge>;
  if (m.match_status === "fuzzy") return <Badge className="bg-amber-500 hover:bg-amber-500"><AlertCircle className="h-3 w-3 mr-1" /> BDPM approximatif</Badge>;
  return <Badge variant="destructive"><HelpCircle className="h-3 w-3 mr-1" /> BDPM inconnu</Badge>;
}

function AgreementBadge({ m }: { m: ExtractedMedication }) {
  if (m.agreement === "both") return <Badge variant="outline" className="border-emerald-500 text-emerald-700"><Users className="h-3 w-3 mr-1" /> 2 modèles d'accord</Badge>;
  return <Badge variant="outline" className="text-muted-foreground"><User className="h-3 w-3 mr-1" /> 1 modèle</Badge>;
}

export function OcrReviewTable({ meds, onChange }: Props) {
  const [openSuggestionsIdx, setOpenSuggestionsIdx] = useState<number | null>(null);

  const update = (i: number, patch: Partial<ReviewableMed>) => {
    const next = meds.map((m, idx) => (idx === i ? { ...m, ...patch } : m));
    onChange(next);
  };

  const applySuggestion = (i: number, s: NonNullable<ExtractedMedication["bdpm_suggestions"]>[number]) => {
    update(i, {
      dci: s.dci,
      nom_commercial: s.nom,
      bdpm_cis: s.cis,
      bdpm_code_atc: s.code_atc,
      bdpm_canonical_dci: s.dci,
      match_status: "exact",
      bdpm_confidence: Math.max(s.score, 0.85),
    });
    setOpenSuggestionsIdx(null);
  };

  return (
    <div className="border rounded-md divide-y max-h-[480px] overflow-auto">
      {meds.map((m, i) => (
        <div key={i} className={`p-3 space-y-2 ${m._include ? "" : "opacity-50"}`}>
          <div className="flex items-start gap-2">
            <Checkbox checked={m._include} onCheckedChange={(v) => update(i, { _include: Boolean(v) })} className="mt-1" />
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Input
                  value={m.dci ?? ""}
                  onChange={(e) => update(i, { dci: e.target.value })}
                  className="h-7 max-w-[260px] font-medium"
                  placeholder="DCI"
                />
                <AgreementBadge m={m} />
                <MatchBadge m={m} />
                {m.match_status !== "exact" && (m.bdpm_suggestions?.length ?? 0) > 0 && (
                  <Popover open={openSuggestionsIdx === i} onOpenChange={(o) => setOpenSuggestionsIdx(o ? i : null)}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-7">
                        {m.bdpm_suggestions!.length} suggestion(s) BDPM
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-96 p-1">
                      <div className="text-xs font-medium px-2 py-1 text-muted-foreground">Choisir une correspondance :</div>
                      <div className="divide-y">
                        {m.bdpm_suggestions!.map((s) => (
                          <button
                            key={s.cis}
                            onClick={() => applySuggestion(i, s)}
                            className="w-full text-left px-2 py-1.5 hover:bg-accent text-sm"
                          >
                            <div className="font-medium">{s.dci}</div>
                            <div className="text-xs text-muted-foreground truncate">{s.nom}</div>
                            <div className="text-xs text-muted-foreground">CIS {s.cis} · ATC {s.code_atc ?? "—"} · score {(s.score * 100).toFixed(0)}%</div>
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <Input value={m.dosage ?? ""} onChange={(e) => update(i, { dosage: e.target.value })} className="h-7" placeholder="Dosage" />
                <Input value={m.dosage_unite ?? ""} onChange={(e) => update(i, { dosage_unite: e.target.value })} className="h-7" placeholder="Unité" />
                <Input value={m.voie_administration ?? ""} onChange={(e) => update(i, { voie_administration: e.target.value })} className="h-7" placeholder="Voie" />
                <Input value={m.duree ?? ""} onChange={(e) => update(i, { duree: e.target.value })} className="h-7" placeholder="Durée" />
              </div>

              <div className="grid grid-cols-4 gap-2">
                {(["posologie_matin", "posologie_midi", "posologie_soir", "posologie_coucher"] as const).map((k) => (
                  <Input
                    key={k}
                    value={m[k] != null ? String(m[k]) : ""}
                    onChange={(e) => {
                      const v = e.target.value === "" ? undefined : parseFloat(e.target.value.replace(",", "."));
                      update(i, { [k]: Number.isFinite(v as number) ? (v as number) : undefined });
                    }}
                    className="h-7"
                    placeholder={k.replace("posologie_", "")}
                  />
                ))}
              </div>

              <Input
                value={m.posologie_texte ?? ""}
                onChange={(e) => update(i, { posologie_texte: e.target.value })}
                className="h-7"
                placeholder="Posologie texte libre"
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
