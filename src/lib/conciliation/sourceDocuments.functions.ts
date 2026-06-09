import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({ documentId: z.string().uuid() });

export const getSourceDocumentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: doc, error } = await supabase
      .from("documents_sources")
      .select("storage_path, file_name, mime_type")
      .eq("id", data.documentId)
      .maybeSingle();
    if (error || !doc) throw new Error("Document introuvable");
    const { data: signed, error: sErr } = await supabase.storage
      .from("ordonnances")
      .createSignedUrl((doc as { storage_path: string }).storage_path, 300);
    if (sErr || !signed) throw new Error("URL signée indisponible");
    return {
      url: signed.signedUrl,
      file_name: (doc as { file_name: string }).file_name,
      mime_type: (doc as { mime_type: string }).mime_type,
    };
  });
