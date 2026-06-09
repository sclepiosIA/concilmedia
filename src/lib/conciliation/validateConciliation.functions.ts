import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type ItemDecision = {
  category: "interactions" | "contre_indications" | "adaptations_posologiques" | "doublons_therapeutiques" | "allergies_croisees" | "medicaments_haut_risque" | "divergences_conciliation";
  index: number;
  status: "accepted" | "rejected" | "modified";
  comment?: string;
  modification?: string;
};

const ItemDecisionSchema: z.ZodType<ItemDecision> = z.object({
  category: z.enum([
    "interactions",
    "contre_indications",
    "adaptations_posologiques",
    "doublons_therapeutiques",
    "allergies_croisees",
    "medicaments_haut_risque",
    "divergences_conciliation",
  ]),
  index: z.number().int().min(0),
  status: z.enum(["accepted", "rejected", "modified"]),
  comment: z.string().max(2000).optional(),
  modification: z.string().max(2000).optional(),
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
    const { supabase } = context;
    const { error } = await supabase
      .from("conciliation_validations")
      .delete()
      .eq("analysis_id", data.analysisId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
