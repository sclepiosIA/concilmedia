import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({ patientId: z.string().uuid() });

// Wrapper that calls analyzePatientConciliationComplete for ONE patient.
// The UI loops over patients sequentially to show progress.
export const runOnePatientConciliation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const { analyzePatientConciliationComplete } = await import(
      "@/lib/conciliation/analyzePatientConciliationComplete.functions"
    );
    try {
      // Call the underlying serverFn handler directly via its exported function (it is a serverFn,
      // calling it server-side runs the handler in-process).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = await (analyzePatientConciliationComplete as any)({ data: { patientId: data.patientId } });
      return { ok: true, patientId: data.patientId, result: r };
    } catch (e) {
      return { ok: false, patientId: data.patientId, error: e instanceof Error ? e.message : String(e) };
    }
  });
