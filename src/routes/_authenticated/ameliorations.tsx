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
import {
  Brain,
  Database,
  BookOpen,
  ShieldCheck,
  Timer,
  Network,
  ScanLine,
  Users,
  LogOut,
  Share2,
  TrendingUp,
  WifiOff,
  FileCheck2,
  Plug,
  GaugeCircle,
  Building2,
  Sparkles,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/ameliorations")({
  head: () => ({
    meta: [
      { title: "Pistes d'amélioration — ConcilMed" },
      {
        name: "description",
        content:
          "Roadmap et axes de R&D de ConcilMed : RLHF, BDPM, RAG sur thésaurus, intégration SIH, mesure du temps de conciliation, données réelles et plus.",
      },
    ],
  }),
  component: AmeliorationsPage,
});

type Horizon = "Court terme" | "Moyen terme" | "Long terme";
type Complexite = "Faible" | "Moyenne" | "Élevée";

interface Piste {
  id: number;
  titre: string;
  categorie: string;
  icon: React.ComponentType<{ className?: string }>;
  beneficeCle: string;
  horizon: Horizon;
  complexite: Complexite;
  objectif: string;
  benefices: string[];
  miseEnOeuvre: string[];
  prerequis: string[];
  statut?: "Livré v1" | "En cours" | "Roadmap";
}


const PISTES: Piste[] = [
  {
    id: 1,
    titre: "RLHF après conciliation par pharmacien",
    categorie: "IA & apprentissage",
    icon: Brain,
    beneficeCle: "Modèles qui apprennent des validations terrain",
    horizon: "Moyen terme",
    complexite: "Élevée",
    objectif:
      "Capturer le feedback explicite et implicite du pharmacien sur chaque alerte, score et proposition LLM pour entraîner une boucle d'amélioration continue (prompt tuning, fine-tuning, reranking).",
    benefices: [
      "Réduction du bruit (faux positifs d'interactions, alertes non pertinentes)",
      "Adaptation aux pratiques locales et aux livrets thérapeutiques d'établissement",
      "Traçabilité des décisions cliniques pour justifier les évolutions de modèles",
      "Création progressive d'un dataset d'évaluation propriétaire à haute valeur",
    ],
    miseEnOeuvre: [
      "Table conciliation_feedback (analyse_id, item_id, action: accept/reject/edit, commentaire, user_id)",
      "UI : boutons ✓ / ✗ / ✏️ sur chaque alerte et chaque proposition LLM",
      "Job d'agrégation hebdomadaire → métriques par règle / par modèle",
      "Pipeline d'export vers fine-tuning (OpenAI, Azure Foundry) sur sous-corpus validé",
    ],
    prerequis: [
      "Consentement et anonymisation conformes RGPD/HDS",
      "Volume minimum de cas validés (~1000) avant fine-tuning utile",
    ],
    statut: "Livré v1",
  },

  {
    id: 2,
    titre: "Ajout de la BDPM (Base de Données Publique des Médicaments)",
    categorie: "Référentiels",
    icon: Database,
    beneficeCle: "Source officielle ANSM pour DCI, CIS/CIP, RCP",
    horizon: "Court terme",
    complexite: "Faible",
    objectif:
      "Intégrer la BDPM publiée par l'ANSM/HAS pour fiabiliser la normalisation des médicaments, enrichir formes galéniques, dosages, voies, statuts d'AMM et accéder aux RCP officiels.",
    benefices: [
      "Normalisation DCI plus exhaustive que les synonymes actuels",
      "Détection précise des génériques / princeps via CIS/CIP",
      "Récupération automatique du SMR/ASMR et des indications",
      "Référence opposable et gratuite (vs Vidal/Thériaque payants)",
    ],
    miseEnOeuvre: [
      "Téléchargement périodique des fichiers BDPM (CIS_bdpm.txt, CIS_CIP_bdpm.txt, etc.)",
      "Table bdpm_medicaments + index trigram sur dénomination",
      "Service normalizeDrugName fallback : synonymes → BDPM → LLM",
      "Cron mensuel de rafraîchissement",
    ],
    prerequis: ["Stockage ~200 Mo", "Job cron de mise à jour"],
    statut: "Livré v1",
  },

  {
    id: 3,
    titre: "RAG avec les thésaurus cliniques",
    categorie: "IA & apprentissage",
    icon: BookOpen,
    beneficeCle: "LLM ancrés sur des sources opposables",
    horizon: "Moyen terme",
    complexite: "Élevée",
    objectif:
      "Mettre en place une recherche vectorielle sur les thésaurus de référence (ANSM, HAS, thésaurus des interactions, STOPP/START complet, Laroche, recommandations sociétés savantes) injectée comme contexte des prompts LLM.",
    benefices: [
      "Réduction drastique des hallucinations",
      "Citations sources vérifiables dans chaque analyse",
      "Mise à jour des connaissances sans réentraînement",
      "Compatibilité avec exigences HAS de traçabilité des recommandations",
    ],
    miseEnOeuvre: [
      "Ingestion : PDF/HTML → chunks 500-800 tokens → embeddings (text-embedding-3-large)",
      "Stockage pgvector + métadonnées (source, version, date)",
      "Retrieval hybride BM25 + dense + reranking",
      "Modification des prompts analyzeConciliation pour intégrer les passages récupérés",
    ],
    prerequis: [
      "Droits de réutilisation des thésaurus (vérifier licences Thériaque/Vidal)",
      "Activation pgvector sur la base",
    ],
    statut: "Livré v1",
  },

  {
    id: 4,
    titre: "Utilisation de données réelles (pas synthétiques)",
    categorie: "Données & conformité",
    icon: ShieldCheck,
    beneficeCle: "Validation clinique sur cas réels",
    horizon: "Long terme",
    complexite: "Élevée",
    objectif:
      "Passer du jeu de patients synthétiques à un flux de cas réels issus d'un ou plusieurs établissements partenaires, dans un cadre RGPD/HDS et avec convention de recherche.",
    benefices: [
      "Évaluation des performances en conditions réelles",
      "Découverte des cas limites non couverts par les générateurs",
      "Crédibilité scientifique (publications, certification)",
      "Préparation du marquage CE dispositif médical (DM logiciel classe IIa)",
    ],
    miseEnOeuvre: [
      "Hébergement HDS confirmé pour les environnements concernés",
      "Pipeline de pseudonymisation à l'import (suppression INS, dates → décalages aléatoires)",
      "Convention de mise à disposition de données + avis CNIL/CPP si recherche",
      "Espace de travail séparé par établissement (cloisonnement)",
    ],
    prerequis: [
      "Hébergeur HDS certifié",
      "DPO et comité d'éthique de l'établissement partenaire",
      "Convention de recherche / méthodologie de référence MR-004",
    ],
    statut: "Livré v1",
  },
  {
    id: 5,
    titre: "Mesure du temps de conciliation",
    categorie: "Observabilité",
    icon: Timer,
    beneficeCle: "Preuve quantitative du gain de productivité",
    horizon: "Court terme",
    complexite: "Faible",
    objectif:
      "Instrumenter chaque étape du workflow (ouverture dossier, recueil ATCD, comparaison, validation) pour mesurer le temps réel et le comparer aux pratiques sans outil.",
    benefices: [
      "Argument commercial chiffré (ROI pharmacien)",
      "Identification des étapes les plus chronophages → priorisation produit",
      "Tableau de bord direction pharmacie (volumétrie, productivité, complexité)",
      "Données pour publication scientifique",
    ],
    miseEnOeuvre: [
      "Table conciliation_events (episode_id, step, started_at, ended_at, user_id)",
      "Hooks dans l'UI sur changements d'onglet et validations",
      "Dashboard agrégé : temps médian par étape, par pharmacien, par niveau P1-P5",
      "Étude avant/après sur cohorte volontaire",
    ],
    prerequis: ["Aucun blocage technique"],
  },
  {
    id: 6,
    titre: "Intégration SIH (lecture + réintégration)",
    categorie: "Interopérabilité",
    icon: Network,
    beneficeCle: "Plus de double saisie, conciliation dans le DPI",
    horizon: "Long terme",
    complexite: "Élevée",
    objectif:
      "Connecter ConcilMed au Système d'Information Hospitalier pour récupérer automatiquement les prescriptions hôpital, biologie et antécédents, puis pousser la conciliation validée dans le DPI.",
    benefices: [
      "Suppression de la ressaisie manuelle (gain de temps majeur)",
      "Conciliation disponible pour tous les soignants dans le DPI",
      "Cohérence des données patient à travers les outils",
      "Conformité aux référentiels d'interopérabilité (CI-SIS, Ségur)",
    ],
    miseEnOeuvre: [
      "Connecteur HL7 v2.5 (ORM, ORU) pour les SIH historiques (DxCare, Orbis, Cerner, Easily)",
      "Connecteur FHIR R4 (MedicationRequest, Observation, Condition, AllergyIntolerance)",
      "Push : MedicationStatement + DocumentReference (lettre de conciliation PDF)",
      "Gestion des identifiants (INS, IPP local) et des autorités d'identification",
    ],
    prerequis: [
      "Référencement Ségur du SIH cible",
      "Convention d'interopérabilité avec la DSI de l'établissement",
      "Tests sur environnement de qualification",
    ],
  },
  {
    id: 7,
    titre: "OCR avancé des ordonnances manuscrites",
    categorie: "IA & apprentissage",
    icon: ScanLine,
    beneficeCle: "Lecture fiable des ordonnances papier",
    horizon: "Moyen terme",
    complexite: "Moyenne",
    objectif:
      "Améliorer extractOrdonnance avec des modèles de vision spécialisés et une vérification croisée BDPM pour fiabiliser la lecture des ordonnances manuscrites et photos de mauvaise qualité.",
    benefices: [
      "Réduction des erreurs de lecture de posologie",
      "Couverture des médecins de ville qui prescrivent encore sur papier",
      "Validation automatique des DCI extraites contre la BDPM",
    ],
    miseEnOeuvre: [
      "Azure Document Intelligence — modèle custom entraîné sur ordonnances",
      "Vérification post-OCR : chaque ligne extraite → match BDPM (score de confiance)",
      "UI de correction assistée avec suggestions",
    ],
    prerequis: ["BDPM intégrée (piste 2)", "Corpus d'ordonnances annotées"],
  },
  {
    id: 8,
    titre: "Module pharmacien conciliateur multi-sites",
    categorie: "Workflow & organisation",
    icon: Users,
    beneficeCle: "Travail en équipe pharmaceutique",
    horizon: "Moyen terme",
    complexite: "Moyenne",
    objectif:
      "Permettre à une équipe de pharmaciens et internes de partager une file de dossiers, transférer des cas et superviser le travail à l'échelle d'un GHT.",
    benefices: [
      "Mutualisation des ressources entre établissements d'un GHT",
      "Supervision pédagogique des internes",
      "Continuité de service (vacances, congés)",
    ],
    miseEnOeuvre: [
      "Notion d'équipe/service rattachée aux user_roles",
      "File partagée filtrée par site/service",
      "Action « transférer à » avec historique",
      "Vue superviseur (dossiers en cours, en attente, validés)",
    ],
    prerequis: ["Modèle de permissions revu"],
  },
  {
    id: 9,
    titre: "Conciliation de sortie",
    categorie: "Workflow & organisation",
    icon: LogOut,
    beneficeCle: "Couvrir tout le parcours hospitalier",
    horizon: "Moyen terme",
    complexite: "Moyenne",
    objectif:
      "Ajouter un workflow dédié à la conciliation de sortie avec génération automatique de la lettre de liaison médicamenteuse destinée au médecin traitant et au pharmacien d'officine.",
    benefices: [
      "Continuité ville-hôpital sécurisée",
      "Conformité aux recommandations HAS (sortie d'hospitalisation)",
      "Document partageable via DMP / Mon Espace Santé",
    ],
    miseEnOeuvre: [
      "Nouveau type d'épisode : sortie",
      "Comparaison entrée vs sortie vs traitement habituel d'origine",
      "Template PDF lettre de liaison + envoi MSSanté",
    ],
    prerequis: ["Intégration MSSanté pour l'envoi sécurisé"],
  },
  {
    id: 10,
    titre: "Interopérabilité DMP / Mon Espace Santé",
    categorie: "Interopérabilité",
    icon: Share2,
    beneficeCle: "Historique médicamenteux officiel du patient",
    horizon: "Long terme",
    complexite: "Élevée",
    objectif:
      "Récupérer l'historique médicamenteux via le DMP (HMD — Historique de Médicaments Délivrés) pour fiabiliser le recueil des traitements habituels.",
    benefices: [
      "Source de vérité opposable (délivrances officinales remontées par AMELI)",
      "Complète l'entretien patient (qui peut être imprécis)",
      "Détection des observances réelles vs prescrites",
    ],
    miseEnOeuvre: [
      "Référencement DMP via INS + carte CPS pharmacien",
      "Lecture HMD via API DMP",
      "Fusion avec ATCD recueillis",
    ],
    prerequis: [
      "Cartes CPS",
      "Référencement Ségur",
      "Validation ANS (Agence du Numérique en Santé)",
    ],
  },
  {
    id: 11,
    titre: "Score de risque iatrogène longitudinal",
    categorie: "Clinique",
    icon: TrendingUp,
    beneficeCle: "Suivre la trajectoire du risque dans le temps",
    horizon: "Moyen terme",
    complexite: "Moyenne",
    objectif:
      "Conserver l'historique des risk_scores pour chaque patient et alerter en cas de dégradation entre deux séjours.",
    benefices: [
      "Repérer les patients dont le risque s'aggrave",
      "Justifier des consultations pharmaceutiques de suivi",
      "Indicateurs populationnels (établissement, service)",
    ],
    miseEnOeuvre: [
      "Conservation de l'historique risk_scores (déjà partiellement en place)",
      "Vue patient : courbe temporelle du score",
      "Alertes : delta > seuil entre deux conciliations",
    ],
    prerequis: ["Plusieurs séjours par patient"],
  },
  {
    id: 12,
    titre: "Mode hors-ligne / dégradé",
    categorie: "Résilience",
    icon: WifiOff,
    beneficeCle: "Outil utilisable sans LLM",
    horizon: "Long terme",
    complexite: "Élevée",
    objectif:
      "Permettre l'utilisation des couches déterministe + ML inline sans dépendance aux providers LLM externes, pour les sites à connectivité limitée ou en cas d'incident provider.",
    benefices: [
      "Continuité de service en cas de panne Azure/OpenAI",
      "Couverture des établissements à connectivité restreinte",
      "Argument souveraineté numérique",
    ],
    miseEnOeuvre: [
      "Banner UI mode dégradé",
      "Désactivation gracieuse des panneaux IA",
      "Possibilité d'un LLM auto-hébergé (Mistral, Llama) en option",
    ],
    prerequis: ["Évaluation clinique du moteur déterministe seul"],
  },
  {
    id: 13,
    titre: "Audit & traçabilité réglementaire",
    categorie: "Données & conformité",
    icon: FileCheck2,
    beneficeCle: "Conformité HDS / HAS / ISO 27001",
    horizon: "Moyen terme",
    complexite: "Moyenne",
    objectif:
      "Journal d'audit horodaté complet de toutes les actions (consultations, modifications, validations, exports) avec export inviolable pour les audits réglementaires.",
    benefices: [
      "Conformité HDS",
      "Préparation certification HAS / ISO 27001",
      "Investigations post-incident facilitées",
    ],
    miseEnOeuvre: [
      "Table audit_log append-only (trigger sur tables sensibles)",
      "Hash chaîné pour inviolabilité",
      "Export CSV/JSON daté et signé",
    ],
    prerequis: ["Politique de rétention validée DPO"],
  },
  {
    id: 14,
    titre: "API publique ConcilMed",
    categorie: "Interopérabilité",
    icon: Plug,
    beneficeCle: "Intégration dans LGC et DPI tiers",
    horizon: "Long terme",
    complexite: "Moyenne",
    objectif:
      "Exposer les analyses ConcilMed via une API REST documentée pour permettre l'intégration dans les logiciels de gestion de cabinet, DPI et solutions tierces.",
    benefices: [
      "Élargissement du marché (officines, MSP)",
      "Effet plateforme",
      "Monétisation via API keys",
    ],
    miseEnOeuvre: [
      "Routes /api/public/v1/* avec clés API",
      "Schémas OpenAPI 3 + portail développeur",
      "Rate limiting + quotas par client",
    ],
    prerequis: ["Modèle économique défini"],
  },
  {
    id: 15,
    titre: "Évaluation continue des modèles LLM",
    categorie: "IA & apprentissage",
    icon: GaugeCircle,
    beneficeCle: "Détection automatique des régressions",
    horizon: "Court terme",
    complexite: "Moyenne",
    objectif:
      "Banc d'essai automatisé qui rejoue un jeu de cas annotés sur chaque modèle et provider pour mesurer précision, rappel et coût, et alerter en cas de régression.",
    benefices: [
      "Choix factuel du meilleur modèle par tâche",
      "Détection précoce des dérives (nouvelles versions de GPT/Claude)",
      "Optimisation coût/performance",
    ],
    miseEnOeuvre: [
      "Dataset golden : 50-200 cas annotés par tâche IA",
      "Job nocturne : rejoue chaque modèle disponible",
      "Tableau de bord admin : F1, latence, coût par 1000 tokens",
    ],
    prerequis: ["Constitution du dataset annoté"],
  },
  {
    id: 16,
    titre: "Personnalisation par établissement",
    categorie: "Workflow & organisation",
    icon: Building2,
    beneficeCle: "Adaptation au livret thérapeutique local",
    horizon: "Moyen terme",
    complexite: "Moyenne",
    objectif:
      "Permettre à chaque établissement d'injecter ses règles locales, son livret thérapeutique et ses protocoles internes dans le contexte LLM et les alertes déterministes.",
    benefices: [
      "Adoption facilitée (l'outil parle le langage de l'établissement)",
      "Respect des protocoles internes (antibioprophylaxie, anticoagulation, etc.)",
      "Alertes pertinentes (équivalents thérapeutiques locaux)",
    ],
    miseEnOeuvre: [
      "Table establishment_settings (livret, protocoles, équivalents)",
      "Injection dans les prompts LLM",
      "UI admin établissement pour gérer ces référentiels",
    ],
    prerequis: ["Modèle multi-établissement (lié piste 8)"],
  },
];

const HORIZON_VARIANT: Record<Horizon, string> = {
  "Court terme": "bg-emerald-100 text-emerald-800 border-emerald-200",
  "Moyen terme": "bg-amber-100 text-amber-800 border-amber-200",
  "Long terme": "bg-violet-100 text-violet-800 border-violet-200",
};

const COMPLEXITE_VARIANT: Record<Complexite, string> = {
  Faible: "bg-emerald-100 text-emerald-800 border-emerald-200",
  Moyenne: "bg-amber-100 text-amber-800 border-amber-200",
  Élevée: "bg-rose-100 text-rose-800 border-rose-200",
};

function AmeliorationsPage() {
  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      <header className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">Pistes d'amélioration</h1>
        </div>
        <p className="text-muted-foreground max-w-3xl">
          Feuille de route produit, recherche et interopérabilité de ConcilMed. Cette page
          synthétise les évolutions identifiées avec leurs objectifs, bénéfices attendus,
          mise en œuvre technique et complexité.
        </p>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">Roadmap</Badge>
          <Badge variant="outline">Recherche & développement</Badge>
          <Badge variant="outline">Interopérabilité</Badge>
          <Badge variant="outline">Conformité</Badge>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Vue d'ensemble</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Piste</TableHead>
                <TableHead>Catégorie</TableHead>
                <TableHead>Bénéfice clé</TableHead>
                <TableHead>Horizon</TableHead>
                <TableHead>Complexité</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {PISTES.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">{p.id}</TableCell>
                  <TableCell className="font-medium">{p.titre}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{p.categorie}</TableCell>
                  <TableCell className="text-sm">{p.beneficeCle}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={HORIZON_VARIANT[p.horizon]}>
                      {p.horizon}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={COMPLEXITE_VARIANT[p.complexite]}>
                      {p.complexite}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold tracking-tight">Pistes détaillées</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {PISTES.map((p) => {
            const Icon = p.icon;
            return (
              <Card key={p.id} className="flex flex-col">
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                        <Icon className="h-5 w-5" />
                      </span>
                      <div>
                        <CardTitle className="text-base leading-tight">
                          {p.id}. {p.titre}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">{p.categorie}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {p.statut && (
                        <Badge className="bg-emerald-600 hover:bg-emerald-700">
                          {p.statut}
                        </Badge>
                      )}
                      <Badge variant="outline" className={HORIZON_VARIANT[p.horizon]}>
                        {p.horizon}
                      </Badge>
                      <Badge variant="outline" className={COMPLEXITE_VARIANT[p.complexite]}>
                        {p.complexite}
                      </Badge>
                    </div>
                  </div>

                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div>
                    <h3 className="font-semibold mb-1">Objectif</h3>
                    <p className="text-muted-foreground">{p.objectif}</p>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">Bénéfices attendus</h3>
                    <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                      {p.benefices.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">Mise en œuvre</h3>
                    <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                      {p.miseEnOeuvre.map((m, i) => (
                        <li key={i}>{m}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">Prérequis / risques</h3>
                    <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                      {p.prerequis.map((pr, i) => (
                        <li key={i}>{pr}</li>
                      ))}
                    </ul>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <Card className="bg-muted/30">
        <CardHeader>
          <CardTitle className="text-base">Méthodologie de priorisation</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            Les horizons sont indicatifs : <strong>court terme</strong> = réalisable sous 1 à 3 mois
            sans dépendance externe forte ; <strong>moyen terme</strong> = 3 à 9 mois, peut nécessiter
            partenariat ou validation interne ; <strong>long terme</strong> = &gt; 9 mois,
            nécessite contractualisation (HDS, Ségur, conventions hospitalières, certifications).
          </p>
          <p>
            La complexité combine effort de développement, charge réglementaire et risque d'intégration.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
