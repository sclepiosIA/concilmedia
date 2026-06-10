import { useState, type ChangeEvent } from "react";
import * as XLSX from "xlsx";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileSpreadsheet, Loader2, Upload, Download } from "lucide-react";
import { toast } from "sonner";
import { importPatientsRoster } from "@/lib/cohort/importPatientsRoster.functions";

type PatientRow = {
  nom: string;
  prenom: string;
  date_naissance?: string | null;
  sexe?: "M" | "F" | null;
  poids_kg?: number | null;
  taille_cm?: number | null;
  nir?: string | null;
  notes?: string | null;
};

type ParsedRow = { row: number; data?: PatientRow; error?: string };

const HEADER_MAP: Record<string, keyof PatientRow> = {
  nom: "nom",
  lastname: "nom",
  "last name": "nom",
  prenom: "prenom",
  "prénom": "prenom",
  firstname: "prenom",
  "first name": "prenom",
  date_naissance: "date_naissance",
  "date de naissance": "date_naissance",
  dob: "date_naissance",
  birthdate: "date_naissance",
  sexe: "sexe",
  sex: "sexe",
  gender: "sexe",
  poids: "poids_kg",
  poids_kg: "poids_kg",
  weight: "poids_kg",
  taille: "taille_cm",
  taille_cm: "taille_cm",
  height: "taille_cm",
  nir: "nir",
  notes: "notes",
  note: "notes",
  commentaire: "notes",
};

function normHeader(h: string): string {
  return h
    .toString()
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function parseDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const fr = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (fr) {
    let [, d, m, y] = fr;
    if (y.length === 2) y = (parseInt(y, 10) > 30 ? "19" : "20") + y;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

function parseSex(v: unknown): "M" | "F" | null {
  if (v == null) return null;
  const s = String(v).trim().toUpperCase();
  if (s.startsWith("M") || s === "H") return "M";
  if (s.startsWith("F") || s === "W") return "F";
  return null;
}

function parseNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function parseFile(file: File): Promise<ParsedRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Lecture impossible"));
    reader.onload = () => {
      try {
        const wb = XLSX.read(reader.result, { type: "array", cellDates: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
          defval: null,
          raw: true,
        });
        const out: ParsedRow[] = raw.map((r, idx) => {
          const mapped: Partial<PatientRow> = {};
          for (const [k, v] of Object.entries(r)) {
            const key = HEADER_MAP[normHeader(k)];
            if (!key) continue;
            if (key === "date_naissance") mapped[key] = parseDate(v);
            else if (key === "sexe") mapped[key] = parseSex(v);
            else if (key === "poids_kg" || key === "taille_cm") mapped[key] = parseNum(v);
            else mapped[key] = v == null ? null : (String(v).trim() as never);
          }
          if (!mapped.nom || !mapped.prenom) {
            return { row: idx + 2, error: "nom ou prénom manquant" };
          }
          return { row: idx + 2, data: mapped as PatientRow };
        });
        resolve(out);
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

function downloadTemplate() {
  const csv =
    "nom,prenom,date_naissance,sexe,poids_kg,taille_cm,nir,notes\n" +
    "Dupont,Jean,1952-03-14,M,78,172,,Diabétique\n" +
    "Martin,Marie,14/06/1948,F,62,160,,\n";
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "modele_patients.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function CohortPatientsRosterUploader({ cohortId }: { cohortId: string | null }) {
  const qc = useQueryClient();
  const importFn = useServerFn(importPatientsRoster);
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [parsing, setParsing] = useState(false);

  const mut = useMutation({
    mutationFn: async () => {
      if (!cohortId) throw new Error("Cohorte requise");
      const patients = parsed.filter((p) => p.data).map((p) => p.data!);
      return importFn({ data: { cohortId, patients } });
    },
    onSuccess: (r) => {
      toast.success(`${r.inserted} patient(s) créé(s)`);
      qc.invalidateQueries({ queryKey: ["cohortPatients", cohortId] });
      setParsed([]);
      setFileName("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur d'import"),
  });

  const onPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!cohortId) {
      toast.error("Sélectionnez une cohorte d'abord");
      return;
    }
    setFileName(file.name);
    setParsing(true);
    try {
      const rows = await parseFile(file);
      setParsed(rows);
      const ok = rows.filter((r) => r.data).length;
      const err = rows.length - ok;
      if (ok === 0) toast.error("Aucune ligne valide détectée");
      else toast.success(`${ok} ligne(s) valide(s)${err ? `, ${err} en erreur` : ""}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Parsing échoué");
      setParsed([]);
    } finally {
      setParsing(false);
    }
  };

  const valid = parsed.filter((p) => p.data);
  const errors = parsed.filter((p) => p.error);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" /> Import roster CSV / Excel
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Charge tous les patients de la cohorte d'un coup (nom, prénom, date_naissance, sexe, poids_kg, taille_cm, nir, notes).
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={downloadTemplate}>
          <Download className="h-4 w-4 mr-1" /> Modèle CSV
        </Button>
      </div>

      <label>
        <input
          type="file"
          accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          disabled={!cohortId || parsing || mut.isPending}
          onChange={onPick}
          className="hidden"
        />
        <div
          className={`border-2 border-dashed rounded-lg p-5 text-center ${
            cohortId ? "cursor-pointer hover:bg-accent" : "opacity-50 cursor-not-allowed"
          }`}
        >
          {parsing ? (
            <Loader2 className="h-5 w-5 mx-auto animate-spin" />
          ) : (
            <Upload className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
          )}
          <div className="text-sm font-medium">
            {fileName || "Cliquez pour sélectionner un .csv, .xlsx ou .xls"}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Jusqu'à 2000 patients</div>
        </div>
      </label>

      {parsed.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="default">{valid.length} valides</Badge>
            {errors.length > 0 && <Badge variant="destructive">{errors.length} en erreur</Badge>}
          </div>

          {valid.length > 0 && (
            <div className="border rounded-md overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-2">Nom</th>
                    <th className="text-left p-2">Prénom</th>
                    <th className="text-left p-2">Naissance</th>
                    <th className="text-left p-2">Sexe</th>
                    <th className="text-left p-2">Poids</th>
                    <th className="text-left p-2">Taille</th>
                  </tr>
                </thead>
                <tbody>
                  {valid.slice(0, 5).map((p, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">{p.data!.nom}</td>
                      <td className="p-2">{p.data!.prenom}</td>
                      <td className="p-2">{p.data!.date_naissance ?? "—"}</td>
                      <td className="p-2">{p.data!.sexe ?? "—"}</td>
                      <td className="p-2">{p.data!.poids_kg ?? "—"}</td>
                      <td className="p-2">{p.data!.taille_cm ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {valid.length > 5 && (
                <div className="text-xs text-muted-foreground p-2">
                  … et {valid.length - 5} autre(s) ligne(s)
                </div>
              )}
            </div>
          )}

          {errors.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-destructive">
                Voir les lignes en erreur ({errors.length})
              </summary>
              <ul className="mt-1 space-y-0.5">
                {errors.slice(0, 20).map((e, i) => (
                  <li key={i}>
                    Ligne {e.row}: {e.error}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <Button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || valid.length === 0}
            className="w-full"
          >
            {mut.isPending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-1" />
            )}
            Importer {valid.length} patient(s)
          </Button>
        </div>
      )}
    </Card>
  );
}
