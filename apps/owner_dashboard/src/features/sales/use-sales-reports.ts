import { useQuery } from "@tanstack/react-query";
import { useTenantId } from "@/lib/tenant";
import {
  fetchSalesDashboard,
  fetchHourlySales,
  fetchTopProducts,
  fetchCashierPerformance,
} from "./sales-api";

export function useSalesDashboard(startDate?: string, endDate?: string) {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["sales", tenantId, "dashboard", startDate, endDate],
    queryFn: ({ signal }) => fetchSalesDashboard(startDate, endDate, { signal }),
    staleTime: 2 * 60 * 1000,
  });
}

export function useHourlySales(date?: string) {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["sales", tenantId, "hourly", date],
    queryFn: ({ signal }) => fetchHourlySales(date, { signal }),
    staleTime: 2 * 60 * 1000,
  });
}

export function useTopProducts(startDate?: string, endDate?: string, limit = 10) {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["sales", tenantId, "topProducts", startDate, endDate, limit],
    queryFn: ({ signal }) => fetchTopProducts(startDate, endDate, limit, { signal }),
    staleTime: 2 * 60 * 1000,
  });
}

export function useCashierPerformance(startDate?: string, endDate?: string) {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["sales", tenantId, "cashierPerformance", startDate, endDate],
    queryFn: ({ signal }) => fetchCashierPerformance(startDate, endDate, { signal }),
    staleTime: 2 * 60 * 1000,
  });
}
