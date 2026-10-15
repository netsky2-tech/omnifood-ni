import { useQuery } from "@tanstack/react-query";
import { useTenantId } from "@/lib/tenant";
import { fetchDishMargins } from "./dish-margins";

export function useDishMargins() {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["inventory", tenantId, "dish-margins"],
    queryFn: ({ signal }) => fetchDishMargins({ signal }),
    staleTime: 5 * 60 * 1000,
  });
}
