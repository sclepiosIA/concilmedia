import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft } from "lucide-react";
import { CohortImportTab } from "@/components/cohort/CohortImportTab";
import { CohortRunTab } from "@/components/cohort/CohortRunTab";
import { GoldStandardTab } from "@/components/cohort/GoldStandardTab";
import { CohortResultsTab } from "@/components/cohort/CohortResultsTab";

export const Route = createFileRoute("/_authenticated/evaluation")({
  head: () => ({ meta: [{ title: "Évaluation précision — cohortes" }] }),
  component: EvaluationPage,
});

function EvaluationPage() {
  const [cohortId, setCohortId] = useState<string | null>(null);
  const [tab, setTab] = useState("import");

  const selectCohort = (id: string) => {
    setCohortId(id);
    setTab("run");
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl">
      <Link to="/dashboard" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-3">
        <ChevronLeft className="h-4 w-4" /> Retour dashboard
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold">Banc d'essai cohorte — Précision détection</h1>
        <p className="text-sm text-muted-foreground">
          Importez les fichiers d'une cohorte, lancez la conciliation IA, comparez avec les PDF pharmacien (gold standard) et benchmarkez LLM vs ML.
        </p>
        {cohortId && (
          <Badge variant="default" className="mt-2">Cohorte active : {cohortId.slice(0, 8)}…</Badge>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="import">1. Import cohorte</TabsTrigger>
          <TabsTrigger value="run" disabled={!cohortId}>2. Conciliation IA</TabsTrigger>
          <TabsTrigger value="gold" disabled={!cohortId}>3. Gold standard</TabsTrigger>
          <TabsTrigger value="results" disabled={!cohortId}>4. Résultats</TabsTrigger>
        </TabsList>
        <TabsContent value="import" className="mt-4">
          <CohortImportTab activeCohortId={cohortId} onCohortSelected={selectCohort} />
        </TabsContent>
        <TabsContent value="run" className="mt-4">
          {cohortId && <CohortRunTab cohortId={cohortId} />}
        </TabsContent>
        <TabsContent value="gold" className="mt-4">
          {cohortId && <GoldStandardTab cohortId={cohortId} />}
        </TabsContent>
        <TabsContent value="results" className="mt-4">
          {cohortId && <CohortResultsTab cohortId={cohortId} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
