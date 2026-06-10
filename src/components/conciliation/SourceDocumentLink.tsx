import { useServerFn } from "@tanstack/react-start";
import { buttonVariants } from "@/components/ui/button";
import { FileText, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { getSourceDocumentUrl } from "@/lib/conciliation/sourceDocuments.functions";
import { cn } from "@/lib/utils";

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
    <span
      role="button"
      tabIndex={0}
      className={cn(buttonVariants({ size: "sm", variant: "ghost" }), "h-6 px-2 text-xs")}
      aria-disabled={loading}
      onClick={(event) => {
        event.stopPropagation();
        if (!loading) void open();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        if (!loading) void open();
      }}
    >
      {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <FileText className="h-3 w-3 mr-1" />}
      {label}
    </span>
  );
}
