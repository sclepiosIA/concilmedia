## Audit terminé — résumé

J'ai confronté chaque affirmation de la page `/architecture-ia` au code réel (triageScale, riskScore, mlConcilmed, deterministicAlerts, stoppStart, runAITask, availableModels, migrations RLS). **La grande majorité est exacte** (coefficients ML, seuils P1–P5, providers LLM, modèles disponibles, sécurité auth, explicabilité). Restent **2 erreurs factuelles**, **1 omission majeure** et **3 imprécisions** à corriger.

## Corrections à apporter dans `src/routes/_authenticated/architecture-ia.tsx`

### 1. FAUX — Seuils de la couche 4 (gravité d'omission) — ligne 436
- Affiché : `level = high ≥ 0.7 · moderate ≥ 0.4 · low sinon`
- Code réel (`mlConcilmed.server.ts:112`) : retourne `severity_score` (0–1) + `is_severe = score ≥ 0.5` (binaire)
- → Remplacer par : `is_severe = 1 si severity_score ≥ 0.5, sinon 0` (seuil binaire unique)

### 2. FAUX/IMPRÉCIS — "STOPP/START" — couche 1 (ligne ~565)
- `stoppStart.ts` ne contient que 7 règles STOPP (A1, B1, B2, C1, D1, E1, F1) — **aucune règle START**
- → Remplacer toutes les mentions "STOPP/START" par "STOPP" tant qu'aucune règle START n'est codée

### 3. OMISSION MAJEURE — `computeRiskScore` (riskScore.ts) absent de la page
C'est ce score (système à points 0–100) qui alimente `worstRisk` dans le triage, **pas** le ML `predictLayer2Sync`. À documenter dans la vue complète (couche 2) :
- Échelle 0–100, seuils : `≥70 critique · ≥50 élevé · ≥30 modéré · <30 faible`
- Points : âge ≥75 +20 / 65–74 +10 ; ≥10 méd +25 / ≥5 méd +15 ; classes à risque +8/classe (plafond 30) ; ≥3 comorbidités +10 ; IR +10 ; IH +10 ; via urgences +15
- Préciser que c'est ce score (et non le ML) qui produit `worstRisk` utilisé par `computePatientTriage`
- Reformuler la couche ML pour clarifier qu'elle est un signal complémentaire (best-effort), pas la source de `worstRisk`

### 4. IMPRÉCIS — Vue simplifiée, déclencheurs P2 (ligne 358)
- Manque le 3ᵉ déclencheur : `worstRisk = élevé non validé`
- → Ajouter : "ou un score de risque élevé non validé → P2"

### 5. IMPRÉCIS — Vue simplifiée, plafond gériatrique P3 (ligne 360)
- "polymédiqué" sans seuil
- → Préciser : "polymédiqué (≥ 5 traitements habituels) ou insuffisant rénal"

### 6. IMPRÉCIS — Sécurité RLS (lignes ~800–806)
- Depuis la dernière migration, `owns_patient()` / `owns_episode()` retournent vrai pour tout utilisateur authentifié (partage global voulu)
- → Reformuler : "Tables `patients` / `episodes` accessibles à tout utilisateur authentifié via `owns_patient()` / `owns_episode()` (SECURITY DEFINER) — partage global de la cohorte"
- Nuancer "Les règles métier tournent en parallèle de l'IA" → "en post-traitement de l'analyse LLM" (couche 1 n'est pas un watchdog parallèle systématique)

### 7. À vérifier au moment de l'édit
- Existence de `pharmacistDoc.functions.ts` (ligne TASKS) — sinon retirer ou corriger
- Diagramme simplifié SIMPLE_CHART : flux trop parallélisés ; rendre fidèle à la réalité (riskScore → triage ; ML = signal additionnel ; LLM → BDD → UI)

## Détails techniques

- Aucune modification de logique métier — édition documentaire uniquement
- Pas de nouveau fichier
- Pas de migration BDD
- Pas d'impact sur les routes/auth
- Une seule édition cible : `src/routes/_authenticated/architecture-ia.tsx`
- Les onglets "Complet" / "Simplifié" et les composants `LayerCard`, `MermaidDiagram` restent inchangés
