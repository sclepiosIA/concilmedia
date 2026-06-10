import { useState, useRef, type ChangeEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileSpreadsheet, FileArchive, Loader2, Upload, X, Database } from "lucide-react";
import { toast } from "sonner";
import { importCohortDataset } from "@/lib/cohort/importCohortDataset.functions";
import { importCohortPdfBundle } from "@/lib/cohort/importCohortPdfBundle.functions";

type Slot =
  | "patients"
  | "sejours"
  | "prescriptions"
  | "medsChron"
  | "divergences"
  | "ordonnancesZip"
  | "bilansZip";

const SLOT_LABELS: Record<Slot, string> = {
  patients: "patients.xlsx",
  sejours: "sejours.xlsx",
  prescriptions: "prescriptions.xlsx",
  medsChron: "meds_chron.xlsx",
  divergences: "divergences.xlsx",
  ordonnancesZip: "ordonnances.zip (PDFs ville)",
  bilansZip: "bilansbio.zip (PDFs biologie)",
};

const XLSX_SLOTS: Slot[] = ["patients", "sejours", "prescriptions", "medsChron", "divergences"];
const ZIP_SLOTS: Slot[] = ["ordonnancesZip", "bilansZip"];

function detectSlot(name: string): Slot | null {
  const n = name.toLowerCase();
  if (n.endsWith(".zip")) {
    if (n.includes("bilan") || n.includes("bio")) return "bilansZip";
    return "ordonnancesZip";
  }
  if (!/\.(xlsx?|csv)$/i.test(n)) return null;
  if (n.includes("patient")) return "patients";
  if (n.includes("sejour") || n.includes("séjour") || n.includes("stay")) return "sejours";
  if (n.includes("prescription")) return "prescriptions";
  if (n.includes("chron") || n.includes("bmo") || n.includes("habit")) return "medsChron";
  if (n.includes("diverg") || n.includes("gold")) return "divergences";
  return null;
}

function normHeader(h: string): string {
  return String(h).toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function excelDateToIso(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof v === "number") {
    // Excel serial date
    if (v < 60000 && v > 25000) {
      const ms = (v - 25569) * 86400 * 1000;
      const dt = new Date(ms);
      if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
    }
    return null;
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

function toInt(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? Math.round(v) : parseInt(String(v), 10);
  // guard against Excel serial-date contamination (>10000)
  if (!Number.isFinite(n) || Math.abs(n) > 10000) return null;
  return n;
}

function s(v: unknown): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t.length ? t : null;
}

type ParsedSheet = { headers: string[]; rows: Record<string, unknown>[] };

async function parseXlsx(file: File): Promise<ParsedSheet> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null, raw: true });
  return { headers: Object.keys(rows[0] ?? {}), rows };
}

type ZipPdf = { name: string; patientRef: string; subtype: string | null; mimeType: string; getBase64: () => Promise<string> };

async function parseZipPdfs(file: File): Promise<ZipPdf[]> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const out: ZipPdf[] = [];
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    if (!path.toLowerCase().endsWith(".pdf")) continue;
    const base = path.split("/").pop() ?? path;
    const m = base.match(/^(PAT[A-Z0-9]+)(?:_([a-zA-Z]+))?\.pdf$/i);
    if (!m) continue;
    out.push({
      name: base,
      patientRef: m[1].toUpperCase(),
      subtype: m[2] ? m[2].toLowerCase() : null,
      mimeType: "application/pdf",
      getBase64: async () => {
        const u8 = await entry.async("uint8array");
        let bin = "";
        for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
        return btoa(bin);
      },
    });
  }
  return out;
}

function mapRow(slot: Slot, r: Record<string, unknown>): Record<string, unknown> | null {
  const m: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) m[normHeader(k)] = v;
  switch (slot) {
    case "patients": {
      const ref = s(m.patient_id);
      if (!ref) return null;
      const gender = s(m.gender);
      return {
        external_ref: ref,
        gender: gender === "M" || gender === "F" ? gender : null,
        age: toInt(m.age),
        age_group: s(m.age_group),
        hta: toInt(m.hta),
        did: toInt(m.did),
        dnid: toInt(m.dnid),
        diabete: toInt(m.diabete),
        irc: toInt(m.irc),
        obesite: toInt(m.obesite),
        score_comorb: toInt(m.score_comorb),
      };
    }
    case "sejours": {
      const ref = s(m.sejour_id);
      const pref = s(m.patient_id);
      if (!ref || !pref) return null;
      return {
        external_ref: ref,
        patient_ref: pref,
        motif: s(m.motif),
        service: s(m.service),
        prescripteur: s(m.prescripteur),
        date_admission: excelDateToIso(m.date_admission),
        date_sortie: excelDateToIso(m.date_sortie),
        nb_meds_chroniques: toInt(m.nb_meds_chroniques),
        nb_meds_hosp: toInt(m.nb_meds_hosp),
        pas_mmhg: toInt(m.pas_mmhg ?? m["pas_mm hg"]),
        pad_mmhg: toInt(m.pad_mmhg ?? m["pad_mm hg"]),
      };
    }
    case "prescriptions": {
      const sref = s(m.sejour_id);
      const pref = s(m.patient_id);
      const med = s(m.medicament);
      if (!sref || !pref || !med) return null;
      return {
        sejour_ref: sref,
        patient_ref: pref,
        medicament: med,
        dose: s(m.dose),
        voie: s(m.voie),
        frequence: s(m.frequence),
        prescripteur: s(m.prescripteur),
      };
    }
    case "medsChron": {
      const sref = s(m.sejour_id);
      const pref = s(m.patient_id);
      const med = s(m.medicament);
      if (!sref || !pref || !med) return null;
      return { sejour_ref: sref, patient_ref: pref, medicament: med, source: s(m.source) };
    }
    case "divergences": {
      const sref = s(m.sejour_id);
      const pref = s(m.patient_id);
      if (!sref || !pref) return null;
      return {
        sejour_ref: sref,
        patient_ref: pref,
        medicament: s(m.medicament) ?? "",
        type: s(m.type),
        gravite: toInt(m.gravite),
        justification: s(m.justification),
        action: s(m.action),
      };
    }
    default:
      return null;
  }
}

type SlotState =
  | { kind: "xlsx"; file: File; rows: Record<string, unknown>[]; valid: number; invalid: number }
  | { kind: "zip"; file: File; pdfs: ZipPdf[] };

export function CohortDatasetUploader({ cohortId }: { cohortId: string | null }) {
  const qc = useQueryClient();
  const importDataset = useServerFn(importCohortDataset);
  const importPdf = useServerFn(importCohortPdfBundle);
  const inputRef = useRef<HTMLInputElement>(null);
  const [slots, setSlots] = useState<Partial<Record<Slot, SlotState>>>({});
  const [parsing, setParsing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null);

  const onPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    setParsing(true);
    const next: Partial<Record<Slot, SlotState>> = { ...slots };
    for (const f of files) {
      const slot = detectSlot(f.name);
      if (!slot) {
        toast.error(`Fichier ignoré (format inconnu) : ${f.name}`);
        continue;
      }
      try {
        if (XLSX_SLOTS.includes(slot)) {
          const sheet = await parseXlsx(f);
          let valid = 0;
          let invalid = 0;
          for (const r of sheet.rows) (mapRow(slot, r) ? valid++ : invalid++);
          next[slot] = { kind: "xlsx", file: f, rows: sheet.rows, valid, invalid };
        } else {
          const pdfs = await parseZipPdfs(f);
          next[slot] = { kind: "zip", file: f, pdfs };
        }
      } catch (err) {
        toast.error(`Erreur sur ${f.name}: ${err instanceof Error ? err.message : "parsing"}`);
      }
    }
    setSlots(next);
    setParsing(false);
  };

  const reassign = (oldSlot: Slot, newSlot: Slot) => {
    if (oldSlot === newSlot) return;
    setSlots((cur) => {
      const v = cur[oldSlot];
      if (!v) return cur;
      const isXlsx = XLSX_SLOTS.includes(newSlot);
      if (isXlsx !== (v.kind === "xlsx")) {
        toast.error("Le type cible est incompatible (xlsx vs zip)");
        return cur;
      }
      const copy = { ...cur };
      delete copy[oldSlot];
      copy[newSlot] = v;
      return copy;
    });
  };

  const removeSlot = (slot: Slot) =>
    setSlots((cur) => {
      const c = { ...cur };
      delete c[slot];
      return c;
    });

  const runImport = useMutation({
    mutationFn: async () => {
      if (!cohortId) throw new Error("Cohorte requise");

      const payload: Record<string, unknown[]> = {
        patients: [], sejours: [], prescriptions: [], medsChron: [], divergences: [],
      };
      for (const slot of XLSX_SLOTS) {
        const st = slots[slot];
        if (!st || st.kind !== "xlsx") continue;
        for (const r of st.rows) {
          const mapped = mapRow(slot, r);
          if (mapped) payload[slot].push(mapped);
        }
      }

      // 1) dataset import
      setProgress({ done: 0, total: 1, label: "Import des tableurs…" });
      const ds = await importDataset({ data: { cohortId, ...payload } as never });

      // 2) PDFs
      const allPdfs: Array<{ pdf: ZipPdf; kind: "ordonnance_ville" | "bilan_bio" }> = [];
      const ord = slots.ordonnancesZip;
      const bio = slots.bilansZip;
      if (ord && ord.kind === "zip") ord.pdfs.forEach((p) => allPdfs.push({ pdf: p, kind: "ordonnance_ville" }));
      if (bio && bio.kind === "zip") bio.pdfs.forEach((p) => allPdfs.push({ pdf: p, kind: "bilan_bio" }));

      let done = 0;
      let okPdfs = 0;
      let failedPdfs = 0;
      const total = allPdfs.length || 1;
      for (const { pdf, kind } of allPdfs) {
        setProgress({ done, total, label: `PDFs ${done}/${allPdfs.length}` });
        try {
          const base64 = await pdf.getBase64();
          await importPdf({
            data: {
              cohortId,
              externalPatientRef: pdf.patientRef,
              kind,
              subtype: pdf.subtype,
              fileName: pdf.name,
              mimeType: pdf.mimeType,
              fileBase64: base64,
            },
          });
          okPdfs++;
        } catch {
          failedPdfs++;
        }
        done++;
      }
      setProgress({ done: total, total, label: "Terminé" });
      return { ds, okPdfs, failedPdfs };
    },
    onSuccess: (r) => {
      const s = r.ds.stats;
      toast.success(
        `Import OK — ${s.patients} patients, ${s.episodes} séjours, ${s.prescriptions} prescriptions, ${s.traitements} BMO, ${s.divergences} gold, ${r.okPdfs} PDFs${r.failedPdfs ? ` (${r.failedPdfs} échecs)` : ""}`,
      );
      qc.invalidateQueries({ queryKey: ["cohortPatients", cohortId] });
      setSlots({});
      setTimeout(() => setProgress(null), 1500);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Échec import");
      setProgress(null);
    },
  });

  const filledSlots = (Object.keys(slots) as Slot[]).filter((k) => slots[k]);
  const totalRows = filledSlots
    .filter((k) => slots[k]?.kind === "xlsx")
    .reduce((a, k) => a + ((slots[k] as { valid: number }).valid ?? 0), 0);
  const totalPdfs = filledSlots
    .filter((k) => slots[k]?.kind === "zip")
    .reduce((a, k) => a + ((slots[k] as { pdfs: ZipPdf[] }).pdfs.length ?? 0), 0);

  return (
    <Card className="p-4 space-y-3 border-primary/40">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <Database className="h-4 w-4" /> Import dataset cohorte (multi-fichiers)
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Déposez les tableurs (patients, séjours, prescriptions, traitements chroniques, divergences) et/ou les ZIP de PDFs (ordonnances ville, bilans bio) — tout en une fois.
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv,.zip"
          multiple
          className="hidden"
          disabled={!cohortId || parsing || runImport.isPending}
          onChange={onPick}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={!cohortId || parsing || runImport.isPending}
        >
          {parsing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
          Ajouter fichiers
        </Button>
      </div>

      {!cohortId && (
        <p className="text-xs text-amber-600">Sélectionnez ou créez une cohorte d'abord.</p>
      )}

      {filledSlots.length > 0 && (
        <div className="border rounded-md divide-y">
          {filledSlots.map((slot) => {
            const st = slots[slot]!;
            const Icon = st.kind === "zip" ? FileArchive : FileSpreadsheet;
            return (
              <div key={slot} className="flex items-center gap-2 p-2 text-sm">
                <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="font-mono text-xs truncate flex-1">{st.file.name}</span>
                <Select value={slot} onValueChange={(v) => reassign(slot, v as Slot)}>
                  <SelectTrigger className="h-8 w-[230px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(st.kind === "zip" ? ZIP_SLOTS : XLSX_SLOTS).map((s2) => (
                      <SelectItem key={s2} value={s2} className="text-xs">{SLOT_LABELS[s2]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {st.kind === "xlsx" ? (
                  <Badge variant={st.valid > 0 ? "default" : "destructive"}>
                    {st.valid} lignes{st.invalid ? ` (+${st.invalid} ignorées)` : ""}
                  </Badge>
                ) : (
                  <Badge variant="default">{st.pdfs.length} PDFs</Badge>
                )}
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeSlot(slot)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {filledSlots.length > 0 && (
        <div className="text-xs text-muted-foreground">
          Récapitulatif : <strong>{totalRows}</strong> lignes de données + <strong>{totalPdfs}</strong> PDFs.
        </div>
      )}

      {progress && (
        <div className="space-y-1">
          <Progress value={(progress.done / Math.max(1, progress.total)) * 100} />
          <div className="text-xs text-muted-foreground">{progress.label}</div>
        </div>
      )}

      <Button
        className="w-full"
        disabled={!cohortId || runImport.isPending || filledSlots.length === 0}
        onClick={() => runImport.mutate()}
      >
        {runImport.isPending ? (
          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
        ) : (
          <Upload className="h-4 w-4 mr-1" />
        )}
        Tout importer
      </Button>
    </Card>
  );
}
