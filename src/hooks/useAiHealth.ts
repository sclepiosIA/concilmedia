import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getAiGatewayHealth,
  forceRefreshAiGatewayHealth,
  type AiHealthSnapshot,
} from "@/lib/ai/aiHealth.functions";

export function useAiHealth() {
  const fn = useServerFn(getAiGatewayHealth);
  const refreshFn = useServerFn(forceRefreshAiGatewayHealth);
  const qc = useQueryClient();
  const q = useQuery<AiHealthSnapshot>({
    queryKey: ["ai-health"],
    queryFn: () => fn(),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
  const refresh = async () => {
    const v = await refreshFn();
    qc.setQueryData(["ai-health"], v);
  };
  const status = q.data?.status ?? "unknown";
  return {
    snapshot: q.data,
    status,
    degraded: status === "degraded" || status === "down",
    down: status === "down",
    message: q.data?.message ?? "Vérification en cours…",
    latencyMs: q.data?.latencyMs ?? null,
    isLoading: q.isLoading,
    refresh,
  };
}
