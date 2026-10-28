import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  clearSupervisionPolicy,
  fetchSupervisionPolicy,
  updateSupervisionPolicy,
} from "./supervision-api";
import type { SupervisionPolicy } from "./types";
import { useToast } from "@/hooks/use-toast";
import { useTenantId } from "@/lib/tenant";
import { getApiErrorMessage } from "@/lib/api-error";

export const SUPERVISION_QUERY_KEYS = {
  policy: (tenantId?: string | null) =>
    ["supervision", tenantId ?? "unknown", "policy"] as const,
};

export function useSupervisionPolicy() {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: SUPERVISION_QUERY_KEYS.policy(tenantId),
    queryFn: ({ signal }) => fetchSupervisionPolicy({ signal }),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Writes the policy (or clears it with `null`).
 *
 * The toast says WHAT happened and WHAT it changes — including the honest
 * part: the terminals pick it up on their next sync, not instantly.
 */
export function useUpdateSupervisionPolicy() {
  const queryClient = useQueryClient();
  const tenantId = useTenantId();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (payload: SupervisionPolicy | null) =>
      payload === null
        ? clearSupervisionPolicy()
        : updateSupervisionPolicy(payload),
    onSuccess: (data) => {
      queryClient.setQueryData(SUPERVISION_QUERY_KEYS.policy(tenantId), data);
      toast({
        variant: "success",
        title: data.configured
          ? "Política de supervisión guardada"
          : "Política de supervisión restablecida",
        description: data.configured
          ? "Las terminales la aplicarán en su próxima sincronización."
          : "Cada terminal vuelve a aplicar el valor por defecto de su modo de operación.",
      });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "No se pudo guardar la política de supervisión",
        description: getApiErrorMessage(
          err,
          "Revise la configuración e intente de nuevo.",
        ),
      });
    },
  });
}
