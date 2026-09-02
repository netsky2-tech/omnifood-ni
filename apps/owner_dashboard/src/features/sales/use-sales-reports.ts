import { useQuery } from "@tanstack/react-query";
import {
  fetchSalesDashboard,
  fetchHourlySales,
  fetchTopProducts,
  fetchCashierPerformance,
} from "./sales-api";

export function useSalesDashboard(startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ["sales", "dashboard", startDate, endDate],
    queryFn: () => fetchSalesDashboard(startDate, endDate),
    staleTime: 2 * 60 * 1000,
  });
}

export function useHourlySales(date?: string) {
  return useQuery({
    queryKey: ["sales", "hourly", date],
    queryFn: () => fetchHourlySales(date),
    staleTime: 2 * 60 * 1000,
  });
}

export function useTopProducts(startDate?: string, endDate?: string, limit = 10) {
  return useQuery({
    queryKey: ["sales", "topProducts", startDate, endDate, limit],
    queryFn: () => fetchTopProducts(startDate, endDate, limit),
    staleTime: 2 * 60 * 1000,
  });
}

export function useCashierPerformance(startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ["sales", "cashierPerformance", startDate, endDate],
    queryFn: () => fetchCashierPerformance(startDate, endDate),
    staleTime: 2 * 60 * 1000,
  });
}
