import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { FileText, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { getSourceDocumentUrl } from "@/lib/conciliation/sourceDocuments.functions";

export function SourceDocumentLink({ documentId, label = "Voir source" }: { documentId: string | null | undefined; label?: string }) {
  const fetchUrl = useServerFn(getSourceDocumentUrl);
  const [loading, setLoading] = useState(false);

  if (!documentId) return null;

  const open = async () => {
    setLoading(true);
    try {
      const r = await fetchUrl({ data: { documentId } });
      window.open(r.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur ouverture");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={open} disabled={loading}>
      {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <FileText className="h-3 w-3 mr-1" />}
      {label}
    </Button>
  );
}
