import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({ q: z.string().min(2).max(100) });

export type BdpmSearchHit = {
  cis: number;
  denomination: string;
  forme: string | null;
  voies: string | null;
  dci: string | null;
  code_atc: string | null;
  libelle_atc: string | null;
};

export const searchBdpm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const q = data.q.trim();
    const pattern = `%${q.replace(/[%_]/g, "\\$&")}%`;

    const { data: rows, error } = await supabaseAdmin
      .from("bdpm_specialites")
      .select(
        "cis, denomination, forme, voies, bdpm_atc(code_atc, libelle_atc), bdpm_compositions(denomination_substance)",
      )
      .ilike("denomination", pattern)
      .limit(20);
    if (error) throw new Error(error.message);

    const hits: BdpmSearchHit[] = (rows ?? []).map((r) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const atc = (r as any).bdpm_atc?.[0] ?? (r as any).bdpm_atc ?? null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const compos = ((r as any).bdpm_compositions as Array<{ denomination_substance: string | null }> | null) ?? [];
      const dci =
        compos
          .map((c) => c.denomination_substance)
          .filter((s): s is string => !!s)
          .join(" + ") || null;
      return {
        cis: r.cis as number,
        denomination: r.denomination as string,
        forme: (r.forme as string | null) ?? null,
        voies: (r.voies as string | null) ?? null,
        dci,
        code_atc: atc?.code_atc ?? null,
        libelle_atc: atc?.libelle_atc ?? null,
      };
    });
    return { hits };
  });
