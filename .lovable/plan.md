## Objectif
Corriger la génération de la conciliation médicamenteuse globale qui reste bloquée sur “Analyse en cours…” sans retour utilisateur.

## Diagnostic probable
- Le bouton appelle `analyzePatientConciliationComplete`, une fonction serveur qui attend toute la réponse IA avant de rendre la main.
- La tâche `analyze_patient_complete` est configurée en base sur `gpt-5.5` via le provider Azure interne, sans limite `max_tokens`.
- Cette analyse est longue et très verbeuse : elle peut dépasser le temps raisonnable côté requête, ce qui laisse l’UI en attente sans résultat visible.
- Aucune analyse `conciliation_complete` n’a été persistée en base, ce qui confirme que l’appel n’aboutit pas.

## Changements prévus
1. Ajouter une protection de timeout côté fonction serveur pour `analyzePatientConciliationComplete` afin qu’un appel IA trop long échoue proprement au lieu de bloquer indéfiniment.
2. Renvoyer une erreur claire côté UI, par exemple “Analyse trop longue, réessayez ou utilisez un modèle plus rapide”, et réactiver le bouton automatiquement.
3. Limiter la sortie de cette tâche (`maxOutputTokens`) pour éviter les générations interminables tout en gardant assez de place pour le JSON clinique.
4. Réduire le payload envoyé au modèle aux champs réellement utiles pour l’analyse globale afin de diminuer le temps de génération.
5. Vérifier que la tâche continue de passer par Admin IA (`analyze_patient_complete`) et conserve le prompt système géré en base.

## Fichiers concernés
- `src/lib/conciliation/analyzePatientConciliationComplete.functions.ts`
- éventuellement `src/lib/ai/runAITask.server.ts` si une protection générique de timeout est plus propre
- éventuellement une migration de configuration pour définir un `max_tokens` raisonnable sur la tâche `analyze_patient_complete`

## Validation
- Relancer l’analyse depuis le dossier patient.
- Vérifier que le bouton ne reste plus bloqué sans fin.
- Vérifier qu’en cas d’échec/timeout, un toast d’erreur apparaît.
- Vérifier qu’en cas de succès, une ligne `conciliation_complete` est bien créée en base et affichée dans la carte.