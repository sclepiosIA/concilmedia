## Objectif
Faire en sorte que l’écran Admin IA affiche immédiatement un prompt système éditable et des paramètres utiles pour chaque endpoint/tâche, au lieu de laisser les champs vides.

## Constat
- Les prompts système existent déjà dans le code pour les tâches comme `analyze_patient_complete`.
- En base, les `system_prompt` sont vides pour tous les endpoints IA, donc l’éditeur affiche un champ vide et utilise seulement un fallback à l’exécution.
- Les paramètres (`temperature`, `max_tokens`, `reasoning_effort`) sont aussi vides, donc l’admin ne permet pas vraiment de piloter les appels par endpoint.

## Plan d’implémentation
1. **Préremplir les prompts système en base**
   - Ajouter une migration qui remplit `ai_tasks.system_prompt` avec les prompts par défaut existants pour chaque slug.
   - Mettre à jour la version initiale dans `ai_prompt_versions` quand elle est vide, pour que l’historique reflète le vrai prompt.

2. **Afficher le prompt effectif dans l’éditeur**
   - Modifier `getTask` pour retourner `effective_system_prompt` : prompt DB si présent, sinon prompt par défaut codé.
   - Modifier l’écran `/admin/ai/tasks/$slug` pour initialiser le textarea avec ce prompt effectif.
   - Garder le bouton “Charger le prompt par défaut”, mais il deviendra un moyen de réinitialiser au prompt d’origine.

3. **Ajouter des paramètres éditables par endpoint**
   - Étendre l’admin pour sauvegarder les réglages dans `ai_tasks.extra_config` sans écraser les autres options.
   - Pour GPT-5.x : `reasoning_effort`, `verbosity` si pertinent, et tokens de sortie.
   - Pour modèles non GPT-5 : température + tokens de sortie.

4. **Utiliser ces paramètres à l’exécution**
   - Ajuster `runAITask.server.ts` pour lire les paramètres depuis `extra_config` et les passer au provider selon le type de modèle.
   - Ne pas envoyer `temperature` aux GPT-5.x pour éviter les erreurs d’API.

5. **Validation**
   - Vérifier en base que `analyze_patient_complete` et les autres endpoints ont bien un prompt non vide.
   - Vérifier que la page admin affiche directement le prompt et que l’enregistrement crée une nouvelle version.