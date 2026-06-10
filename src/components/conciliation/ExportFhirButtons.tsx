import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Download, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { exportConciliationFhir } from "@/lib/sih/fhirExport.functions";
import { pushConciliationToSih } from "@/lib/sih/fhirPush.functions";
import { getSihConfig } from "@/lib/sih/sihConfig.functions";

interface Props {
  validationId: string;
  patientId: string;
}

export function ExportFhirButtons({ validationId, patientId }: Props) {
  const exportFn = useServerFn(exportConciliationFhir);
  const pushFn = useServerFn(pushConciliationToSih);
  const getCfg = useServerFn(getSihConfig);
  const [downloading, setDownloading] = useState(false);

  const orgQ = useQuery({
    queryKey: ["patient-org", patientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("patients")
        .select("organization_id")
        .eq("id", patientId)
        .maybeSingle();
      return data?.organization_id ?? null;
    },
  });
  const orgId = orgQ.data ?? null;

  const cfgQ = useQuery({
    queryKey: ["sih-cfg", orgId],
    queryFn: () => (orgId ? getCfg({ data: { organizationId: orgId } }) : null),
    enabled: !!orgId,
  });
  const canPush = !!cfgQ.data?.config?.is_active && !!cfgQ.data?.config?.fhir_base_url;

  const push = useMutation({
    mutationFn: () => pushFn({ data: { organizationId: orgId!, validationId } }),
    onSuccess: (r) => toast.success(`Bundle FHIR transmis (HTTP ${r.status})`),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Échec du push FHIR"),
  });

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const { bundle } = await exportFn({ data: { validationId } });
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/fhir+json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `conciliation-${validationId}.fhir.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Bundle FHIR téléchargé");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de l'export");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button size="sm" variant="outline" onClick={handleDownload} disabled={downloading}>
        {downloading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Download className="h-3 w-3 mr-1" />}
        Exporter FHIR
      </Button>
      {canPush && (
        <Button size="sm" variant="outline" onClick={() => push.mutate()} disabled={push.isPending}>
          {push.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Upload className="h-3 w-3 mr-1" />}
          Pousser vers SIH
        </Button>
      )}
    </div>
  );
}
