import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MermaidDiagram } from "@/components/architecture/MermaidDiagram";
import { LayerCard } from "@/components/architecture/LayerCard";
import { AVAILABLE_MODELS, LOVABLE_PROVIDER_KEY } from "@/lib/ai/availableModels";
import {
  Layers,
  Cpu,
  Cloud,
  ShieldCheck,
  Workflow,
  Stethoscope,
  Database,
  KeyRound,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/architecture-ia")({
  head: () => ({
    meta: [
      { title: "Architecture IA — ConcilMed" },
      {
        name: "description",
        content:
          "Vue d'ensemble des 4 couches IA de ConcilMed : moteur déterministe, ML inline, LLM multi-providers (Lovable Gateway + Azure OpenAI + Azure Foundry) et orchestration.",
      },
    ],
  }),
  component: ArchitectureIAPage,
});

const GLOBAL_CHART = `
flowchart TB
  classDef src fill:#f1f5f9,stroke:#64748b,color:#0f172a
  classDef det fill:#dbeafe,stroke:#2563eb,color:#0f172a
  classDef ml  fill:#dcfce7,stroke:#16a34a,color:#052e16
  classDef llm fill:#fef3c7,stroke:#d97706,color:#451a03
  classDef orch fill:#ede9fe,stroke:#7c3aed,color:#1e1b4b
  classDef prov fill:#fff7ed,stroke:#ea580c,color:#431407

  P[Dossier patient<br/>allergies · antécédents · comorbidités<br/>biologie · ttt habituels · prescriptions hôpital]:::src

  subgraph L1[Couche 1 — Moteur déterministe]
    D1[normalizeDrugName + DRUG_SYNONYMS<br/>tokens DCI]:::det
    D2[hospitalCovers - détection omissions]:::det
    D3[deterministicAlerts.ts<br/>STOPP/START + interactions ATC]:::det
  end

  subgraph L2[Couche 2 — ML inline workerd]
    M1[Étage 2 — predictLayer2Sync<br/>triage patient logistique]:::ml
    M2[Étage 4 — predictLayer4Sync<br/>gravité des omissions]:::ml
  end

  subgraph L3[Couche 3 — LLM multi-providers]
    R[resolveAITask slug, fallback<br/>lit ai_tasks + ai_providers<br/>déchiffre clé via AI_PROVIDERS_ENCRYPTION_KEY]:::orch
    PV1[Lovable AI Gateway<br/>ai.gateway.lovable.dev/v1]:::prov
    PV2[Azure OpenAI classique<br/>*.openai.azure.com]:::prov
    PV3[Azure Foundry Responses<br/>services.ai.azure.com/openai/v1/responses<br/>GPT-5.4 · GPT-5 Nano]:::prov
    PV4[Azure Foundry Anthropic<br/>Claude Opus 4.8]:::prov
    PV5[OpenAI · Google · Anthropic directs<br/>+ openai_compatible]:::prov
    R --> PV1
    R --> PV2
    R --> PV3
    R --> PV4
    R --> PV5
  end

  subgraph L4[Couche 4 — Orchestration & UI]
    O1[Server functions TanStack Start<br/>analyzeConciliation · matchPrescriptionAI<br/>extractOrdonnance · ...]:::orch
    O2[conciliation_ai_analyses BDD]:::orch
    O3[UI — AIAnalysisPanel<br/>RiskScoreCompare · ClinicalAlertsPanel]:::llm
  end

  P --> D1 --> D2 --> D3
  P --> M1
  D2 --> M2
  P --> O1
  O1 --> R
  PV1 --> O1
  PV2 --> O1
  PV3 --> O1
  PV4 --> O1
  PV5 --> O1
  D3 --> O3
  M1 --> O3
  M2 --> O3
  O1 --> O2 --> O3
`;

const SEQUENCE_CHART = `
sequenceDiagram
  autonumber
  participant U as UI<br/>AIAnalysisPanel
  participant SF as Server fn<br/>analyzeConciliation
  participant DB as Supabase BDD
  participant RT as resolveAITask
  participant AZ as Azure Foundry<br/>OpenAI Responses
  participant ML as ML inline<br/>scoreOmissions

  U->>SF: useServerFn (auth bearer)
  SF->>DB: select dossier patient
  SF->>RT: resolve(slug=analyze_conciliation)
  RT->>DB: ai_tasks + ai_providers + decrypt key
  RT-->>SF: model + systemPrompt + callOptions
  SF->>AZ: generateText + Output.object Zod
  AZ-->>SF: payload structuré
  par En parallèle
    SF->>ML: predictLayer4Sync(items)
    ML-->>SF: severity_score / level
  end
  SF->>DB: insert conciliation_ai_analyses
  SF-->>U: AIAnalysisPayload
  U->>U: rendu sections A & B
`;

const PROVIDERS = [
  {
    kind: "lovable",
    sdk: "@ai-sdk/openai-compatible",
    endpoint: "ai.gateway.lovable.dev/v1",
    auth: "Header Lovable-API-Key",
    variant: "—",
    note: "Passerelle par défaut, multi-modèles",
  },
  {
    kind: "azure_openai",
    sdk: "@ai-sdk/azure",
    endpoint: "*.openai.azure.com",
    auth: "api-key + api-version",
    variant: "classique",
    note: "Resource Azure OpenAI standard",
  },
  {
    kind: "azure_openai",
    sdk: "@ai-sdk/openai (.responses())",
    endpoint: "services.ai.azure.com/openai/v1/responses",
    auth: "api-key",
    variant: "azure_foundry_responses",
    note: "GPT-5.4, GPT-5 Nano via Responses API",
  },
  {
    kind: "azure_openai",
    sdk: "@ai-sdk/openai-compatible",
    endpoint: "services.ai.azure.com/openai/v1",
    auth: "api-key + Bearer",
    variant: "foundry legacy",
    note: "Endpoint OpenAI-compatible Foundry",
  },
  {
    kind: "anthropic",
    sdk: "@ai-sdk/anthropic",
    endpoint: "Azure Foundry",
    auth: "api-key (Azure)",
    variant: "azure_foundry_anthropic",
    note: "Claude Opus 4.8 via Foundry",
  },
  {
    kind: "anthropic",
    sdk: "@ai-sdk/anthropic",
    endpoint: "api.anthropic.com",
    auth: "apiKey",
    variant: "—",
    note: "Anthropic direct",
  },
  {
    kind: "openai",
    sdk: "@ai-sdk/openai",
    endpoint: "api.openai.com",
    auth: "Bearer",
    variant: "—",
    note: "OpenAI direct",
  },
  {
    kind: "google",
    sdk: "@ai-sdk/google",
    endpoint: "generativelanguage.googleapis.com",
    auth: "apiKey",
    variant: "—",
    note: "Google AI direct",
  },
  {
    kind: "openai_compatible",
    sdk: "@ai-sdk/openai-compatible",
    endpoint: "custom",
    auth: "Bearer optionnel",
    variant: "—",
    note: "Tout endpoint OpenAI-compatible",
  },
];

const TASKS = [
  { slug: "analyze_conciliation", file: "analyze.functions.ts", role: "Analyse complète d'un épisode" },
  { slug: "analyze_patient_complete", file: "analyzePatientConciliationComplete.functions.ts", role: "Synthèse multi-épisodes patient" },
  { slug: "analyze_patient_synthesis", file: "analyzePatientSynthesis.functions.ts", role: "Header synthèse patient" },
  { slug: "match_prescription", file: "matchPrescriptionAI.functions.ts", role: "Concordance ville/hôpital (vert/jaune/orange/rouge)" },
  { slug: "extract_ordonnance", file: "extractOrdonnance.functions.ts", role: "OCR ordonnance ville" },
  { slug: "extract_lettre_admission", file: "extractLettreAdmission.functions.ts", role: "Extraction lettre admission" },
  { slug: "extract_biologie", file: "extractBiologie.functions.ts", role: "Extraction biologie" },
  { slug: "pharmacist_doc_compare", file: "pharmacistDoc.functions.ts", role: "Comparaison document pharmacien" },
  { slug: "prioritize", file: "prioritize.functions.ts", role: "Tri des actions cliniques" },
];

const SIMPLE_CHART = `
flowchart TB
  classDef src fill:#f1f5f9,stroke:#64748b,color:#0f172a
  classDef step fill:#dbeafe,stroke:#2563eb,color:#0f172a
  classDef ai fill:#fef3c7,stroke:#d97706,color:#451a03
  classDef out fill:#dcfce7,stroke:#16a34a,color:#052e16

  P[Dossier du patient<br/>traitements ville + hôpital<br/>biologie · antécédents]:::src
  R[1- Règles métier<br/>vérifie les omissions<br/>et interactions connues]:::step
  M[2- Petit modèle statistique<br/>évalue la gravité<br/>et priorise les patients]:::step
  L[3- Intelligence artificielle<br/>GPT-5 · Claude · Gemini<br/>via Lovable et Azure]:::ai
  U[Pharmacien<br/>reçoit alertes priorisées<br/>+ recommandations]:::out

  P --> R --> U
  P --> M --> U
  P --> L --> U
`;

function SimplifiedView() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Comment ça marche, en une image</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <MermaidDiagram chart={SIMPLE_CHART} />
          </div>
          <p className="text-sm text-muted-foreground mt-4">
            ConcilMed combine <strong>trois cerveaux complémentaires</strong> pour aider le
            pharmacien à comparer les traitements du patient à domicile et ceux prescrits à
            l'hôpital. Chacun a un rôle différent et se vérifie mutuellement.
          </p>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-3 gap-4">
        <Card className="border-2 border-sky-300 bg-sky-50/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Layers className="h-4 w-4 text-sky-700" /> 1. Les règles métier
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p><strong>Ce que ça fait :</strong> compare automatiquement la liste des médicaments du domicile à ceux de l'hôpital, et détecte les oublis ou les interactions dangereuses connues.</p>
            <p><strong>Pourquoi c'est utile :</strong> 100 % vérifiable, reproductible, jamais d'hallucination. C'est le garde-fou.</p>
            <p className="text-xs text-muted-foreground">Exemple : la vitamine D du domicile est-elle bien reprise à l'hôpital sous l'un de ses noms (cholécalciférol, ZymaD…) ?</p>
          </CardContent>
        </Card>

        <Card className="border-2 border-emerald-300 bg-emerald-50/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Cpu className="h-4 w-4 text-emerald-700" /> 2. Le petit modèle statistique
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p><strong>Ce que ça fait :</strong> calcule un score de 0 à 1 pour estimer la gravité d'un oubli et la priorité d'un patient.</p>
            <p><strong>Pourquoi c'est utile :</strong> très rapide, fonctionne sans connexion à un service externe, et trie la file d'attente du pharmacien.</p>
            <p className="text-xs text-muted-foreground">Exemple : un oubli d'anticoagulant chez une personne âgée fragile remonte tout en haut de la liste.</p>
          </CardContent>
        </Card>

        <Card className="border-2 border-amber-300 bg-amber-50/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Cloud className="h-4 w-4 text-amber-700" /> 3. L'intelligence artificielle
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p><strong>Ce que ça fait :</strong> les grands modèles (GPT-5, Claude Opus, Gemini) lisent les ordonnances, comprennent le contexte clinique et rédigent des recommandations.</p>
            <p><strong>Pourquoi c'est utile :</strong> gère le langage naturel, les abréviations, les ordonnances scannées, et synthétise le dossier.</p>
            <p className="text-xs text-muted-foreground">Fournis par <strong>Lovable AI Gateway</strong> et <strong>Microsoft Azure</strong> (OpenAI + Foundry).</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Stethoscope className="h-4 w-4 text-violet-700" /> Que voit le pharmacien au final ?
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <ul className="list-disc pl-5 space-y-1">
            <li>Une <strong>file de patients triée par priorité</strong> (du plus à risque au moins à risque).</li>
            <li>Pour chaque patient, une <strong>comparaison médicament par médicament</strong> entre ville et hôpital (vert / jaune / orange / rouge).</li>
            <li>Des <strong>alertes cliniques</strong> (interactions, oublis graves, posologies inhabituelles) avec leur source.</li>
            <li>Une <strong>synthèse rédigée</strong> par l'IA, relue et validée avant tout usage clinique.</li>
          </ul>
        </CardContent>
      </Card>

      <Card className="bg-muted/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-700" /> Sécurité, en clair
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          <ul className="list-disc pl-5 space-y-1">
            <li>Chaque pharmacien ne voit que ses propres patients (verrouillage en base).</li>
            <li>Les clés d'accès aux IA sont chiffrées et ne sortent jamais du serveur.</li>
            <li>Les règles métier tournent en parallèle de l'IA pour détecter une éventuelle erreur.</li>
            <li>L'IA propose, le pharmacien dispose — aucune décision n'est automatisée.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function ArchitectureIAPage() {
  return (
    <div className="container mx-auto px-4 py-8 space-y-6 max-w-6xl">
      {/* Header */}
      <header className="space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-3xl font-bold">Architecture IA de ConcilMed</h1>
          <Badge variant="secondary" className="text-xs">4 couches</Badge>
          <Badge variant="outline" className="text-xs">LLM + ML + Règles</Badge>
        </div>
        <p className="text-muted-foreground max-w-3xl">
          Trois moteurs complémentaires — moteur déterministe (règles métier), modèles ML
          embarqués (logistique calibrée) et LLM multi-providers (Lovable Gateway, Azure OpenAI,
          Azure Foundry GPT-5.x et Claude Opus via Foundry). Tous orchestrés par TanStack Start
          server functions, avec RLS Supabase et clés chiffrées en base.
        </p>
      </header>

      <Tabs defaultValue="simple" className="w-full">
        <TabsList>
          <TabsTrigger value="simple">Vue simplifiée</TabsTrigger>
          <TabsTrigger value="complete">Vue complète (technique)</TabsTrigger>
        </TabsList>

        <TabsContent value="simple" className="mt-6">
          <SimplifiedView />
        </TabsContent>

        <TabsContent value="complete" className="mt-6 space-y-8">
      {/* Schéma global */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="h-4 w-4 text-primary" /> Vue d'ensemble — les 4 couches
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <MermaidDiagram chart={GLOBAL_CHART} />
          </div>
        </CardContent>
      </Card>

      {/* Couche 1 */}
      <LayerCard
        index={1}
        title="Moteur déterministe — règles métier vérifiables"
        subtitle="TypeScript pur, exécution synchrone côté serveur, 100 % reproductible"
        accent="sky"
      >
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>
            <code className="text-xs bg-muted px-1 rounded">normalizeDrugName()</code> +
            table <code className="text-xs bg-muted px-1 rounded">DRUG_SYNONYMS</code> (vitamine D ↔
            cholécalciférol, calcium, B9/B12, magnésium, potassium, fer…).
          </li>
          <li>
            <code className="text-xs bg-muted px-1 rounded">hospitalCovers(homeTokens, hospTokens)</code>{" "}
            — détection d'omissions : un traitement ville est omis si aucune prescription hôpital
            ne couvre tous ses tokens significatifs.
          </li>
          <li>
            <code className="text-xs bg-muted px-1 rounded">deterministicAlerts.ts</code> — règles
            STOPP/START + interactions de classe ATC, dédupliquées par <code>rule.id</code>.
          </li>
          <li>Sert de garde-fou aux sorties LLM (alertes vérifiables affichées en parallèle).</li>
        </ul>
        <p className="text-xs text-muted-foreground">
          Sources : <code>src/lib/conciliation/normalize.ts</code>,{" "}
          <code>analyzePatientConciliationComplete.functions.ts</code>,{" "}
          <code>deterministicAlerts.ts</code>, <code>stoppStart.ts</code>,{" "}
          <code>atcInteractions.ts</code>.
        </p>
      </LayerCard>

      {/* Couche 2 */}
      <LayerCard
        index={2}
        title="ML inline — mlConcilmed.server.ts"
        subtitle="Logistique calibrée embarquée dans le Worker — 0 latence réseau, 0 secret, déterministe"
        accent="emerald"
      >
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Cpu className="h-4 w-4 text-emerald-700" /> Étage 2 — Triage patient
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs space-y-2">
              <p><strong>Entrées :</strong> âge, sexe, nb_comorbidités, IR/IH, nb_meds, via_urgences, durée séjour, créatinine, kaliémie, HbA1c.</p>
              <pre className="bg-muted p-2 rounded text-[10px] overflow-x-auto">
{`z = -3.2
  + 0.022·max(0, age-40)
  + 0.45·nbCom
  + 0.85 si IR
  + 0.65 si IH
  + 0.09·nbMeds
  + 0.55 si via_urgences
  + 0.035·min(30, durée)
  + 0.6 si créat > 130
  + 0.4 si K+ hors [3.3, 5.2]
  + 0.35 si HbA1c > 8
score = σ(z) ∈ [0, 1]`}
              </pre>
              <p><strong>Consommateur :</strong> <code>usePatientsTriage.ts</code> — priorisation de la file patients.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Stethoscope className="h-4 w-4 text-emerald-700" /> Étage 4 — Gravité des omissions
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs space-y-2">
              <p>
                <strong>Mots-clés haut risque :</strong> AVK, AOD, héparines, insulines, digoxine,
                amiodarone, lévothyrox, lithium, MTX, opioïdes, clopidogrel, statines…
              </p>
              <p>
                <strong>Classes ATC haut risque :</strong> B01, A10, C01, N03, L04, N05A, N02A.
              </p>
              <pre className="bg-muted p-2 rounded text-[10px] overflow-x-auto">
{`z = -2.0
  + 1.6 si keyword_HR
  + 1.2 si ATC_HR
  + 0.015·max(0, age-50)
  + 0.05·nb_meds_hosp
  + 0.3 si durée > 10
severity = σ(z) ∈ [0, 1]
level = high ≥ 0.7 | mod ≥ 0.4 | low`}
              </pre>
              <p>
                <strong>Injection :</strong> <code>DivergenceConciliation.ml_severity_score</code>{" "}
                + <code>ml_is_severe</code> via <code>scoreOmissions.functions.ts</code>.
              </p>
            </CardContent>
          </Card>
        </div>
        <p className="text-xs text-muted-foreground">
          <strong>Pourquoi inline :</strong> compatible Cloudflare workerd, aucune dépendance native,
          version <code>inline-1.0.0</code>. Remplaçable plus tard par des poids ONNX si besoin.
        </p>
      </LayerCard>

      {/* Couche 3 */}
      <LayerCard
        index={3}
        title="LLM multi-providers — résolution dynamique via ai_tasks"
        subtitle="resolveAITask() route chaque appel vers le bon provider en lisant la BDD"
        accent="amber"
      >
        <div className="rounded-md border bg-amber-50/40 p-3 text-xs space-y-1">
          <div className="flex items-center gap-2 font-semibold text-amber-900">
            <Workflow className="h-3.5 w-3.5" /> Pipeline de résolution
          </div>
          <ol className="list-decimal pl-5 space-y-0.5">
            <li>Lecture de <code>ai_tasks</code> par slug (model, system_prompt, temperature, max_tokens, extra_config).</li>
            <li>Lookup du <code>ai_providers</code> associé (kind, base_url, extra_config.variant).</li>
            <li>Déchiffrement de la clé : <code>ai_provider_decrypt_key()</code> avec <code>AI_PROVIDERS_ENCRYPTION_KEY</code> (pgcrypto <code>pgp_sym_decrypt</code>).</li>
            <li>Construction du modèle AI SDK selon <code>providerKind</code> + <code>variant</code>.</li>
            <li>Adaptation <code>callOptions</code> : famille GPT-5 → <code>max_completion_tokens</code> + <code>reasoning_effort</code> dans <code>providerOptions</code> ; sinon <code>maxOutputTokens</code>.</li>
            <li>Fallback vers <code>process.env.LOVABLE_API_KEY</code> ou <code>AZURE_OPENAI_API_KEY</code> si aucune clé en base.</li>
          </ol>
        </div>

        <div>
          <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Cloud className="h-4 w-4" /> Providers supportés
          </h4>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kind</TableHead>
                  <TableHead>SDK AI</TableHead>
                  <TableHead>Endpoint</TableHead>
                  <TableHead>Auth</TableHead>
                  <TableHead>Variant</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {PROVIDERS.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">{p.kind}</TableCell>
                    <TableCell className="font-mono text-xs">{p.sdk}</TableCell>
                    <TableCell className="font-mono text-xs">{p.endpoint}</TableCell>
                    <TableCell className="text-xs">{p.auth}</TableCell>
                    <TableCell className="font-mono text-xs">{p.variant}</TableCell>
                    <TableCell className="text-xs">{p.note}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-semibold mb-2">Modèles activés pour le banc d'essai cohorte</h4>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Libellé</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Model ID</TableHead>
                  <TableHead>Hint</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {AVAILABLE_MODELS.map((m) => (
                  <TableRow key={m.key}>
                    <TableCell className="text-xs font-medium">{m.label}</TableCell>
                    <TableCell className="text-xs font-mono">
                      {m.providerName === LOVABLE_PROVIDER_KEY ? "Lovable Gateway" : m.providerName}
                    </TableCell>
                    <TableCell className="text-xs font-mono">{m.modelId}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{m.hint}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Source : <code>src/lib/ai/runAITask.server.ts</code>,{" "}
          <code>src/lib/ai/availableModels.ts</code>, tables <code>ai_tasks</code> et{" "}
          <code>ai_providers</code>.
        </p>
      </LayerCard>

      {/* Couche 4 */}
      <LayerCard
        index={4}
        title="Tâches IA & orchestration"
        subtitle="Server functions TanStack Start protégées par requireSupabaseAuth"
        accent="violet"
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Slug ai_tasks</TableHead>
                <TableHead>Fichier server fn</TableHead>
                <TableHead>Rôle</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {TASKS.map((t) => (
                <TableRow key={t.slug}>
                  <TableCell className="text-xs font-mono">{t.slug}</TableCell>
                  <TableCell className="text-xs font-mono">{t.file}</TableCell>
                  <TableCell className="text-xs">{t.role}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground">
          Chaque tâche expose un mode d'exécution{" "}
          <code className="bg-muted px-1 rounded">execution_mode ∈ &#123;llm, ml, both&#125;</code>{" "}
          (colonne <code>ai_tasks.execution_mode</code>) — permet de basculer une tâche entre LLM
          seul, ML inline seul, ou fusion des deux sans redéploiement.
        </p>
      </LayerCard>

      {/* Flux end-to-end */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Workflow className="h-4 w-4 text-violet-700" /> Flux end-to-end d'une analyse
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <MermaidDiagram chart={SEQUENCE_CHART} />
          </div>
        </CardContent>
      </Card>

      {/* Sécurité */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-700" /> Sécurité & gestion des clés
          </CardTitle>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4 text-sm">
          <div className="space-y-2">
            <div className="flex items-center gap-2 font-semibold">
              <KeyRound className="h-4 w-4" /> Secrets serveur
            </div>
            <ul className="list-disc pl-5 text-xs space-y-1">
              <li><code>LOVABLE_API_KEY</code> — passerelle Lovable AI (auto-provisionnée).</li>
              <li><code>AZURE_OPENAI_API_KEY</code> — fallback Azure OpenAI / Foundry.</li>
              <li><code>AI_PROVIDERS_ENCRYPTION_KEY</code> — clé maître <code>pgcrypto</code> pour déchiffrer les clés provider stockées en base.</li>
              <li>Jamais exposés au client — uniquement lus dans les handlers <code>createServerFn</code>.</li>
            </ul>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 font-semibold">
              <Database className="h-4 w-4" /> Accès BDD
            </div>
            <ul className="list-disc pl-5 text-xs space-y-1">
              <li>Toutes les server fn IA passent par <code>requireSupabaseAuth</code> (middleware) — RLS appliqué comme l'utilisateur.</li>
              <li><code>attachSupabaseAuth</code> côté client attache le bearer à chaque RPC.</li>
              <li>Tables <code>patients</code> / <code>episodes</code> protégées par <code>owns_patient()</code> / <code>owns_episode()</code> (SECURITY DEFINER).</li>
              <li>Rôles via table <code>user_roles</code> + <code>has_role()</code>, jamais sur <code>profiles</code>.</li>
            </ul>
          </div>
        </CardContent>
      </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
