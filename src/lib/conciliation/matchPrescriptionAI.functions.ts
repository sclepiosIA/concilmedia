import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const InputSchema = z.object({
  prescriptionId: z.string().uuid(),
  patientId: z.string().uuid(),
});

const AISchema = z.object({
  status: z.enum(["vert", "jaune", "orange", "rouge"]),
  reason: z.string().min(1).max(500),
  recommandation: z.string().max(800).optional(),
});

export const matchPrescriptionAI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const [{ data: hosp }, { data: domicile }, { data: allergies }, { data: comorb }] = await Promise.all([
      supabase.from("prescriptions_hospitalieres").select("*").eq("id", data.prescriptionId).maybeSingle(),
      supabase.from("traitements_habituels").select("dci,nom_commercial,dosage,dosage_unite,voie_administration,posologie_matin,posologie_midi,posologie_soir,posologie_coucher,posologie_texte,indication").eq("patient_id", data.patientId).eq("actif", true),
      supabase.from("allergies").select("substance,severite").eq("patient_id", data.patientId),
      supabase.from("comorbidites").select("libelle").eq("patient_id", data.patientId),
    ]);

    if (!hosp) throw new Error("Prescription introuvable");

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY manquant");

    const { generateText, Output } = await import("ai");
    const { resolveAITask } = await import("@/lib/ai/runAITask.server");
    const { model: aiModel } = await resolveAITask("match_prescription", {
      systemPrompt: "",
      model: "google/gemini-2.5-flash",
    });

    const prompt = `Tu es pharmacien clinicien. Analyse la concordance entre une prescription hospitalière et le traitement habituel du patient à domicile.

PRESCRIPTION HOSPITALIÈRE :
${JSON.stringify({
  medicament: hosp.medicament,
  dosage: `${hosp.dosage ?? "?"} ${hosp.dosage_unite ?? ""}`,
  voie: hosp.voie_administration,
  posologie: `M:${hosp.posologie_matin ?? 0} Mi:${hosp.posologie_midi ?? 0} S:${hosp.posologie_soir ?? 0} Co:${hosp.posologie_coucher ?? 0}`,
  texte: hosp.posologie,
  indication: hosp.indication,
}, null, 2)}

TRAITEMENT DOMICILE (${(domicile ?? []).length} médicament(s)) :
${JSON.stringify(domicile ?? [], null, 2)}

ALLERGIES : ${JSON.stringify(allergies ?? [])}
COMORBIDITÉS : ${JSON.stringify((comorb ?? []).map((c) => c.libelle))}

Classe la prescription :
- "vert"   : strictement conforme au domicile, pas d'alerte
- "jaune"  : différent mais adaptation logique/normale dans le contexte hospitalier (switch IV↔PO, ajustement rénal, etc.)
- "orange" : différent et probablement non souhaité (oubli, divergence non justifiée)
- "rouge"  : erreur, hors-AMM, surdosage, contre-indication, allergie

Réponds en français, raison courte (<200 caractères), recommandation seulement si statut ≠ vert.`;

    // Tentative 1 : structured output. Fallback : parsing JSON manuel.
    let output: z.infer<typeof AISchema> | null = null;
    let lastError: unknown = null;
    try {
      const res = await generateText({
        model: aiModel,
        prompt,
        experimental_output: Output.object({ schema: AISchema }),
      });
      output = res.experimental_output;
    } catch (e) {
      lastError = e;
      try {
        const res = await generateText({
          model: aiModel,
          prompt:
            prompt +
            `\n\nRéponds UNIQUEMENT avec un JSON valide de la forme :\n{"status":"vert|jaune|orange|rouge","reason":"...","recommandation":"..."}`,
        });
        const txt = res.text.trim().replace(/^```json\s*|\s*```$/g, "");
        const match = txt.match(/\{[\s\S]*\}/);
        if (match) output = AISchema.parse(JSON.parse(match[0]));
      } catch (e2) {
        lastError = e2;
      }
    }

    if (!output) {
      // Pas d'analyse IA possible : on conserve l'analyse déterministe déjà en base, sans erreur côté UI.
      console.warn("[matchPrescriptionAI] IA indisponible", lastError);
      return { status: "gris" as const, reason: "Analyse IA non disponible — résultat déterministe conservé", recommandation: null, skipped: true as const };
    }



    await supabase
      .from("prescriptions_hospitalieres")
      .update({
        match_status: output.status,
        match_reason: output.reason,
        match_recommandation: output.recommandation ?? null,
        match_source: "ia",
        match_analyzed_at: new Date().toISOString(),
      })
      .eq("id", data.prescriptionId);

    return output;
  });
