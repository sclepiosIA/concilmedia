# Édition en masse provider/modèle des tâches IA

Sur `/admin/ai`, ajouter la possibilité d'appliquer **un même provider et/ou modèle à plusieurs tâches en une seule action**, sans avoir à entrer dans chaque tâche.

## UX

Sur la page `admin.ai.tsx` :

1. Une **case à cocher** apparaît à gauche de chaque tâche.
2. Un bouton **« Tout sélectionner »** dans l'en-tête.
3. Dès qu'au moins une tâche est cochée, une **barre d'actions sticky** apparaît en haut de la liste avec :
   - Compteur : `N tâche(s) sélectionnée(s)`
   - Select **Fournisseur** (liste des providers actifs + option « — inchangé — » + « Aucun (Lovable AI Gateway) »)
   - Select **Modèle** (liste des modèles Lovable AI courants + champ libre + « — inchangé — »)
   - Bouton **Appliquer** (désactivé si rien à changer)
   - Bouton **Annuler**
4. Toast de confirmation `N tâches mises à jour`, invalidation de la query, la liste se rafraîchit.

Les champs `system_prompt`, `temperature`, `max_tokens`, `execution_mode` **ne sont pas touchés** par l'action en masse — seul provider et/ou modèle. Chaque tâche modifiée crée bien une nouvelle version `v+1` dans `ai_prompt_versions` (pour traçabilité), en réutilisant son prompt existant.

## Implémentation technique

**`src/lib/admin/ai.functions.ts`** — nouvelle server fn :

```ts
export const bulkUpdateTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    slugs: z.array(z.string().min(1)).min(1).max(50),
    provider_id: z.string().uuid().nullable().optional(), // undefined = inchangé
    model: z.string().min(1).max(255).optional(),         // undefined = inchangé
    note: z.string().max(500).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Récupère chaque tâche (prompt + version courante), applique les overrides,
    // appelle la même logique que updateTask (UPDATE + insert version).
    // Retourne { updated: number, errors: Array<{slug, error}> }.
  });
```

Réutilise le pattern d'`updateTask` (incrément `current_version`, insertion dans `ai_prompt_versions`) — pas de transaction SQL (Supabase JS ne l'expose pas), on boucle séquentiellement et on capture les erreurs par tâche.

**`src/routes/_authenticated/admin.ai.tsx`** :
- État local `selected: Set<string>` (slugs cochés).
- État local `bulkProvider`, `bulkModel` (avec valeur sentinelle `"__unchanged__"`).
- `useMutation(bulkUpdateTasks)` + `queryClient.invalidateQueries(["admin-ai-tasks"])`.
- Liste des modèles proposés : reprend la palette par défaut (`google/gemini-3-flash-preview`, `google/gemini-2.5-flash`, `google/gemini-2.5-pro`, `openai/gpt-5-mini`, `openai/gpt-5`) + Input pour saisie libre.
- Liste des providers : `listProviders()` (déjà existant), filtre `is_active`.

**Aucune migration DB** — on s'appuie sur le schéma existant.

## Hors scope

- Édition en masse du `system_prompt` / `temperature` / `execution_mode` (risque trop élevé, prompts spécifiques par tâche).
- Sélection multi-pages (la liste fait moins de 20 tâches).
- Diff visuel avant application.
