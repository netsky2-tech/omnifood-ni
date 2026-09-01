import { api } from "@/lib/api";
import type {
  SalesDashboardReport,
  HourlySalesReport,
  TopProductsReport,
  CashierPerformanceReport,
} from "./types";

function toQueryParams(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== "",
  );
  if (entries.length === 0) return "";
  return "?" + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
}

export function fetchSalesDashboard(startDate?: string, endDate?: string) {
  return api.get<SalesDashboardReport>(
    `/sales/reports/dashboard${toQueryParams({ startDate, endDate })}`,
  );
}

export function fetchHourlySales(date?: string) {
  return api.get<HourlySalesReport>(
    `/sales/reports/hourly-sales${toQueryParams({ date })}`,
  );
}

export function fetchTopProducts(startDate?: string, endDate?: string, limit?: number) {
  return api.get<TopProductsReport>(
    `/sales/reports/top-products${toQueryParams({ startDate, endDate, limit })}`,
  );
}

export function fetchCashierPerformance(startDate?: string, endDate?: string) {
  return api.get<CashierPerformanceReport>(
    `/sales/reports/cashier-performance${toQueryParams({ startDate, endDate })}`,
  );
}
