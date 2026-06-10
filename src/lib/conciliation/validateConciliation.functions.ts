import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type ItemOverrides = Partial<{
  severite: string;
  medicaments: string;
  mecanisme: string;
  risque: string;
  recommandation: string;
  alternative: string;
  reference: string;
}>;

export type ItemDecision = {
  category: "interactions" | "contre_indications" | "adaptations_posologiques" | "doublons_therapeutiques" | "allergies_croisees" | "medicaments_haut_risque" | "divergences_conciliation" | "alertes_regles";
  index: number;
  status: "accepted" | "rejected" | "modified";
  comment?: string;
  modification?: string;
  overrides?: ItemOverrides;
};

const ItemOverridesSchema: z.ZodType<ItemOverrides> = z.object({
  severite: z.string().max(100).optional(),
  medicaments: z.string().max(1000).optional(),
  mecanisme: z.string().max(4000).optional(),
  risque: z.string().max(4000).optional(),
  recommandation: z.string().max(4000).optional(),
  alternative: z.string().max(4000).optional(),
  reference: z.string().max(1000).optional(),
}).partial();

const ItemDecisionSchema: z.ZodType<ItemDecision> = z.object({
  category: z.enum([
    "interactions",
    "contre_indications",
    "adaptations_posologiques",
    "doublons_therapeutiques",
    "allergies_croisees",
    "medicaments_haut_risque",
    "divergences_conciliation",
    "alertes_regles",
  ]),
  index: z.number().int().min(0),
  status: z.enum(["accepted", "rejected", "modified"]),
  comment: z.string().max(2000).optional(),
  modification: z.string().max(2000).optional(),
  overrides: ItemOverridesSchema.optional(),
});


const SaveInput = z.object({
  analysisId: z.string().uuid(),
  patientId: z.string().uuid(),
  pharmacienNom: z.string().min(1).max(255),
  commentaireGlobal: z.string().max(4000).optional(),
  itemDecisions: z.array(ItemDecisionSchema).max(500),
});

export const saveConciliationValidation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SaveInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const row = {
      analysis_id: data.analysisId,
      patient_id: data.patientId,
      validated_by: userId,
      validated_at: new Date().toISOString(),
      pharmacien_nom: data.pharmacienNom,
      commentaire_global: data.commentaireGlobal ?? null,
      item_decisions: data.itemDecisions,
    };
    const { data: result, error } = await supabase
      .from("conciliation_validations")
      .upsert(row, { onConflict: "analysis_id" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    // Archivage automatique du patient à la validation : il sort du flux actif
    // sans qu'on modifie artificiellement son classement P.
    const { error: archErr } = await supabase
      .from("patients")
      .update({ archived: true })
      .eq("id", data.patientId);
    if (archErr) console.warn("[validateConciliation] archive failed:", archErr.message);

    // RLHF — capture des signaux de feedback (pipeline d'amélioration continue).
    try {
      const { recordFeedbackSignals } = await import("@/lib/ai/feedbackSignals.functions");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (recordFeedbackSignals as any)({
        data: {
          validationId: result.id,
          analysisId: data.analysisId,
          patientId: data.patientId,
        },
      });
    } catch (e) {
      console.warn("[validateConciliation] recordFeedbackSignals failed:", e);
    }

    return result;
  });


const GetInput = z.object({ analysisId: z.string().uuid() });

export const getConciliationValidation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => GetInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: result, error } = await supabase
      .from("conciliation_validations")
      .select("*")
      .eq("analysis_id", data.analysisId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return result;
  });

const DeleteInput = z.object({ analysisId: z.string().uuid() });

export const deleteConciliationValidation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DeleteInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Défense en profondeur : on supprime uniquement si l'utilisateur courant
    // est bien l'auteur de la validation (en plus de la RLS).
    const { error } = await supabase
      .from("conciliation_validations")
      .delete()
      .eq("analysis_id", data.analysisId)
      .eq("validated_by", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
