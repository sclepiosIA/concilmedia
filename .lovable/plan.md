# Page « Pistes d'amélioration »

Nouvelle route authentifiée `/ameliorations` au style identique à `architecture-ia.tsx` (cartes, badges, tableaux, sections par thème). Lien ajouté à la navigation principale.

## Structure de la page

**En-tête** — Titre + sous-titre + badges « Roadmap », « Recherche & développement », « Production ».

**Section 1 — Vue d'ensemble** : tableau récapitulatif des pistes avec colonnes Piste · Catégorie · Bénéfice clé · Complexité · Horizon (court/moyen/long terme).

**Section 2 — Pistes détaillées** : une `Card` par piste, structurée ainsi :
- Objectif (1–2 phrases)
- Bénéfices attendus (liste : qualité clinique, performance, conformité, UX…)
- Mise en œuvre (composants techniques à toucher, dépendances)
- Complexité estimée (badge Faible / Moyenne / Élevée)
- Prérequis / risques

## Pistes couvertes

### Vos 6 pistes
1. **RLHF après conciliation par pharmacien** — capture du feedback (validations / rejets / corrections d'alertes et propositions LLM), stockage dans une table dédiée, boucle d'amélioration des prompts et fine-tuning ciblé.
2. **Ajout de la BDPM** — intégration de la Base de Données Publique des Médicaments (ANSM) pour enrichir la normalisation DCI, les formes galéniques, les CIS/CIP, les SMR/ASMR et les RCP officiels.
3. **RAG avec les thésaurus** — indexation vectorielle de Thériaque, ANSM, HAS, Vidal, thésaurus interactions, STOPP/START complet, recommandations sociétés savantes ; récupération contextuelle au moment de l'analyse LLM.
4. **Données réelles vs synthétiques** — pipeline d'import sécurisé, pseudonymisation, conformité RGPD/HDS, conventions hôpital, datasets d'évaluation cliniques.
5. **Mesure du temps de conciliation** — instrumentation (timestamps d'ouverture/validation par étape), tableau de bord temps moyen par pharmacien / service / complexité patient, comparatif avant/après outil.
6. **Intégration SIH (lecture + réintégration)** — connecteurs HL7 v2 / FHIR R4, lecture des prescriptions hôpital + biologie + ATCD, push de la conciliation validée vers le DPI (FHIR MedicationStatement / DocumentReference).

### Pistes complémentaires que je propose d'ajouter
7. **OCR avancé des ordonnances manuscrites** — modèles vision spécialisés (Azure Document Intelligence custom, Gemini Vision) avec vérification croisée BDPM.
8. **Module pharmacien conciliateur multi-sites** — gestion d'équipes, file de travail partagée, transferts de dossiers, supervision.
9. **Conciliation de sortie (et non d'entrée seule)** — workflow dédié avec lettre de liaison médicamenteuse automatique.
10. **Interopérabilité DMP / Mon Espace Santé** — récupération directe de l'historique médicamenteux via INS.
11. **Score de risque iatrogène longitudinal** — suivi du score patient dans le temps, alertes de dégradation.
12. **Mode hors-ligne / dégradé** — moteur déterministe utilisable sans LLM pour les sites à connectivité limitée.
13. **Audit & traçabilité réglementaire** — journal horodaté complet (HDS, certification HAS, ISO 27001) avec export.
14. **API publique ConcilMed** — exposer les analyses pour intégration dans d'autres outils (LGC, DPI tiers).
15. **Évaluation continue des modèles LLM** — banc d'essai automatisé sur jeu de cas annotés, comparatif providers, alertes de régression.
16. **Personnalisation par établissement** — règles locales, livret thérapeutique, protocoles internes injectés dans le contexte LLM.

## Modifications techniques

- **Nouveau fichier** : `src/routes/_authenticated/ameliorations.tsx` (structure et composants UI identiques à `architecture-ia.tsx` : `Card`, `Badge`, `Table`, `Tabs` éventuels par catégorie, icônes `lucide-react`).
- **Navigation** : ajout d'un lien « Pistes d'amélioration » dans la barre de navigation authentifiée (à identifier dans `_authenticated/route.tsx` ou composant header partagé).
- **Aucune modification** de logique métier, base de données, server functions, routes API ou auth.
- **SEO** : `head()` avec title et meta description dédiés.

## Hors périmètre

- Aucune implémentation réelle de ces pistes (page documentaire uniquement).
- Aucun changement de schéma BDD.
- Aucune nouvelle dépendance npm.
