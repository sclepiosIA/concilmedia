// Référentiel ATC simplifié : mapping DCI → classe ATC niveau 2 et niveaux de risque
// Source : ATC/DDH WHO + classes à marge thérapeutique étroite (HAS)

export type AtcClassKey =
  | "anticoagulant"
  | "antiagregant"
  | "antidiabetique"
  | "insuline"
  | "antiarythmique"
  | "betabloquant"
  | "iec_ara2"
  | "diuretique"
  | "statine"
  | "ains"
  | "opioide"
  | "benzodiazepine"
  | "antidepresseur"
  | "antipsychotique"
  | "antiepileptique"
  | "ipp"
  | "antiasthmatique"
  | "levothyroxine"
  | "antalgique"
  | "antibiotique"
  | "autre";

export const ATC_LABELS: Record<AtcClassKey, string> = {
  anticoagulant: "Anticoagulant",
  antiagregant: "Antiagrégant plaquettaire",
  antidiabetique: "Antidiabétique oral",
  insuline: "Insuline",
  antiarythmique: "Antiarythmique",
  betabloquant: "Bêtabloquant",
  iec_ara2: "IEC / ARA II",
  diuretique: "Diurétique",
  statine: "Statine",
  ains: "AINS",
  opioide: "Opioïde",
  benzodiazepine: "Benzodiazépine",
  antidepresseur: "Antidépresseur",
  antipsychotique: "Antipsychotique",
  antiepileptique: "Antiépileptique",
  ipp: "IPP",
  antiasthmatique: "Antiasthmatique",
  levothyroxine: "Hormone thyroïdienne",
  antalgique: "Antalgique non opioïde",
  antibiotique: "Antibiotique",
  autre: "Autre",
};

const DCI_TO_ATC: Array<[RegExp, AtcClassKey]> = [
  [/warfarin|fluindione|acenocoumarol|apixaban|rivaroxaban|dabigatran|edoxaban|enoxaparine|tinzaparine|h[ée]parine/i, "anticoagulant"],
  [/clopidogrel|ticagrelor|prasugrel|aspirine|acide ac[ée]tylsalicylique/i, "antiagregant"],
  [/metformine|gliclazide|glim[ée]piride|sitagliptine|empagliflozine|dapagliflozine|liraglutide|s[ée]maglutide/i, "antidiabetique"],
  [/insulin/i, "insuline"],
  [/amiodarone|flecainide|sotalol|digoxine/i, "antiarythmique"],
  [/bisoprolol|atenolol|metoprolol|nebivolol|propranolol|carvedilol/i, "betabloquant"],
  [/ramipril|enalapril|perindopril|lisinopril|losartan|valsartan|irbesartan|candesartan|telmisartan/i, "iec_ara2"],
  [/furosemide|hydrochlorothiazide|indapamide|spironolactone|eplerenone|bumetanide/i, "diuretique"],
  [/atorvastatine|simvastatine|rosuvastatine|pravastatine|fluvastatine/i, "statine"],
  [/ibuprofene|ketoprofene|diclofenac|naproxene|c[ée]l[ée]coxib/i, "ains"],
  [/tramadol|morphine|oxycodone|fentanyl|codeine|tapentadol/i, "opioide"],
  [/diazepam|alprazolam|lorazepam|bromazepam|oxazepam|clonazepam|zolpidem|zopiclone/i, "benzodiazepine"],
  [/sertraline|paroxetine|fluoxetine|escitalopram|citalopram|venlafaxine|duloxetine|mirtazapine|amitriptyline/i, "antidepresseur"],
  [/risperidone|olanzapine|quetiapine|haloperidol|aripiprazole|clozapine/i, "antipsychotique"],
  [/valproate|carbamazepine|lamotrigine|levetiracetam|pregabaline|gabapentine|phenytoine/i, "antiepileptique"],
  [/omeprazole|pantoprazole|esomeprazole|lansoprazole|rabeprazole/i, "ipp"],
  [/salbutamol|terbutaline|salmeterol|formoterol|tiotropium|budesonide|fluticasone/i, "antiasthmatique"],
  [/levothyroxine|l[\s-]?thyrox/i, "levothyroxine"],
  [/paracetamol|ac[ée]taminoph[èe]ne/i, "antalgique"],
  [/amoxicilline|ciprofloxacine|levofloxacine|ceftriaxone|cefixime|azithromycine|clarithromycine|metronidazole|doxycycline/i, "antibiotique"],
];

export function classifyDci(dci: string): AtcClassKey {
  const n = (dci ?? "").trim();
  for (const [re, cls] of DCI_TO_ATC) if (re.test(n)) return cls;
  return "autre";
}

// Mapping ATC (5 premiers caractères) → classe interne.
// Source : OMS ATC + correspondance manuelle avec les classes utilisées par le moteur déterministe.
const ATC_PREFIX_TO_CLASS: Array<[RegExp, AtcClassKey]> = [
  [/^B01AA|^B01AE|^B01AF|^B01AB/, "anticoagulant"], // antithrombotiques (AVK, AOD, héparines)
  [/^B01AC/, "antiagregant"],
  [/^A10A/, "insuline"],
  [/^A10B/, "antidiabetique"],
  [/^C01B|^C01AA/, "antiarythmique"],
  [/^C07/, "betabloquant"],
  [/^C09/, "iec_ara2"],
  [/^C03/, "diuretique"],
  [/^C10AA|^C10BA/, "statine"],
  [/^M01A/, "ains"],
  [/^N02A/, "opioide"],
  [/^N05BA|^N05CD|^N05CF/, "benzodiazepine"],
  [/^N06A/, "antidepresseur"],
  [/^N05A/, "antipsychotique"],
  [/^N03A/, "antiepileptique"],
  [/^A02BC/, "ipp"],
  [/^R03/, "antiasthmatique"],
  [/^H03A/, "levothyroxine"],
  [/^N02BE/, "antalgique"],
  [/^J01/, "antibiotique"],
];

// Utilisé par le moteur déterministe quand un code ATC BDPM est disponible.
// Fallback automatique sur classifyDci si ATC absent ou non mappé.
export function classifyByAtc(codeAtc: string | null | undefined, fallbackDci: string): AtcClassKey {
  const code = (codeAtc ?? "").trim().toUpperCase();
  if (code) {
    for (const [re, cls] of ATC_PREFIX_TO_CLASS) if (re.test(code)) return cls;
  }
  return classifyDci(fallbackDci);
}


// Classes à haut risque iatrogène (poids dans le score de priorisation)
export const HIGH_RISK_CLASSES: AtcClassKey[] = [
  "anticoagulant",
  "antiagregant",
  "insuline",
  "antidiabetique",
  "antiarythmique",
  "opioide",
  "antiepileptique",
  "levothyroxine",
];

// Couples de classes avec risque d'interaction notable
export const CLASS_INTERACTIONS: Array<{
  a: AtcClassKey;
  b: AtcClassKey;
  severite: "moderee" | "majeure" | "contre_indication";
  mecanisme: string;
}> = [
  { a: "anticoagulant", b: "ains", severite: "majeure", mecanisme: "Majoration du risque hémorragique" },
  { a: "anticoagulant", b: "antiagregant", severite: "majeure", mecanisme: "Risque hémorragique cumulé" },
  { a: "iec_ara2", b: "ains", severite: "moderee", mecanisme: "Risque d'insuffisance rénale aiguë" },
  { a: "iec_ara2", b: "diuretique", severite: "moderee", mecanisme: "Hypotension, insuffisance rénale" },
  { a: "betabloquant", b: "antiarythmique", severite: "majeure", mecanisme: "Bradycardie, bloc AV" },
  { a: "benzodiazepine", b: "opioide", severite: "majeure", mecanisme: "Dépression respiratoire" },
  { a: "antidepresseur", b: "opioide", severite: "moderee", mecanisme: "Syndrome sérotoninergique" },
  { a: "antidiabetique", b: "betabloquant", severite: "moderee", mecanisme: "Masque les signes d'hypoglycémie" },
];

export function severityGravite(s: "mineure" | "moderee" | "majeure" | "contre_indication"): "mineur" | "modere" | "majeur" | "critique" {
  return s === "mineure" ? "mineur" : s === "moderee" ? "modere" : s === "majeure" ? "majeur" : "critique";
}
