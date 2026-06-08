import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, FlaskConical, FileUp, Loader2 } from "lucide-react";
import { useRef, useMemo } from "react";
import { toast } from "sonner";
import { extractBiologie } from "@/lib/conciliation/extractBiologie.functions";

type BioRow = {
  id: string;
  parametre: string;
  valeur: number | null;
  unite: string | null;
  valeur_texte: string | null;
  date_prelevement: string | null;
  source: string;
};

function flagFor(p: string, v: number | null): "low" | "high" | null {
  if (v === null) return null;
  const key = p.toLowerCase();
  if (key.includes("dfg")) return v < 60 ? "low" : null;
  if (key.includes("créat") || key.includes("creat")) return v > 110 ? "high" : null;
  if (key === "k" || key.includes("kali")) return v < 3.5 ? "low" : v > 5.0 ? "high" : null;
  if (key === "na" || key.includes("natré") || key.includes("natre")) return v < 135 ? "low" : v > 145 ? "high" : null;
  if (key.includes("inr")) return v > 4 ? "high" : null;
  if (key.includes("hémo") || key.includes("hemo") || key === "hb") return v < 10 ? "low" : null;
  if (key.includes("plaq")) return v < 100 ? "low" : null;
  if (key.includes("crp")) return v > 50 ? "high" : null;
  if (key.includes("hba1c")) return v > 7 ? "high" : null;
  return null;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const res = r.result as string;
      resolve(res.split(",")[1] ?? "");
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export function BiologieSection({ patientId }: { patientId: string }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const extract = useServerFn(extractBiologie);

  const { data = [] } = useQuery({
    queryKey: ["biologie", patientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("biologie_resultats")
        .select("*")
        .eq("patient_id", patientId)
        .order("date_prelevement", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      return (data ?? []) as BioRow[];
    },
  });

  const grouped = useMemo(() => {
    const m = new Map<string, BioRow[]>();
    for (const r of data) {
      const k = r.parametre;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return Array.from(m.entries());
  }, [data]);

  const importPdf = useMutation({
    mutationFn: async (f: File) => {
      const b64 = await fileToBase64(f);
      return extract({ data: { patientId, fileBase64: b64, mimeType: f.type, fileName: f.name } });
    },
    onSuccess: (r) => {
      toast.success(`${r.inserted} résultat(s) importé(s) depuis le PDF`);
      qc.invalidateQueries({ queryKey: ["biologie", patientId] });
      if (fileRef.current) fileRef.current.value = "";
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur d'import"),
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("biologie_resultats").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["biologie", patientId] }),
  });

  return (
    <div className="space-y-3">
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) importPdf.mutate(f);
        }}
      />
      <Button
        variant="outline"
        size="sm"
        onClick={() => fileRef.current?.click()}
        disabled={importPdf.isPending}
      >
        {importPdf.isPending ? (
          <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Analyse en cours…</>
        ) : (
          <><FileUp className="h-4 w-4 mr-1" /> Ajouter un résultat PDF</>
        )}
      </Button>

      {data.length === 0 && <p className="text-sm text-muted-foreground py-4">Aucun résultat biologique</p>}
      {grouped.map(([param, rows]) => (
        <Card key={param}>
          <CardContent className="py-3">
            <div className="flex items-center gap-2 mb-2">
              <FlaskConical className="h-4 w-4 text-primary" />
              <span className="font-medium">{param}</span>
              <Badge variant="outline" className="text-xs">{rows.length} mesure(s)</Badge>
            </div>
            <div className="divide-y">
              {rows.map((r) => {
                const flag = flagFor(r.parametre, r.valeur);
                return (
                  <div key={r.id} className="py-1.5 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-mono">{r.valeur ?? r.valeur_texte ?? "—"}</span>
                      {r.unite && <span className="text-xs text-muted-foreground">{r.unite}</span>}
                      {flag === "high" && <Badge variant="destructive" className="text-xs">↑ élevé</Badge>}
                      {flag === "low" && <Badge variant="destructive" className="text-xs">↓ bas</Badge>}
                      {r.source === "pdf_import" && <Badge variant="secondary" className="text-xs">PDF</Badge>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{r.date_prelevement ?? "—"}</span>
                      <Button size="icon" variant="ghost" onClick={() => del.mutate(r.id)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
