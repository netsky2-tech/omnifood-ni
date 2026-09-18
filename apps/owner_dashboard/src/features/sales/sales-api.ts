import { api, type ApiClientMethodOptions } from "@/lib/api";
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

export function fetchSalesDashboard(startDate?: string, endDate?: string, opts?: ApiClientMethodOptions) {
  const url = `/sales/reports/dashboard${toQueryParams({ startDate, endDate })}`;
  return opts ? api.get<SalesDashboardReport>(url, opts) : api.get<SalesDashboardReport>(url);
}

export function fetchHourlySales(date?: string, opts?: ApiClientMethodOptions) {
  const url = `/sales/reports/hourly-sales${toQueryParams({ date })}`;
  return opts ? api.get<HourlySalesReport>(url, opts) : api.get<HourlySalesReport>(url);
}

export function fetchTopProducts(startDate?: string, endDate?: string, limit?: number, opts?: ApiClientMethodOptions) {
  const url = `/sales/reports/top-products${toQueryParams({ startDate, endDate, limit })}`;
  return opts ? api.get<TopProductsReport>(url, opts) : api.get<TopProductsReport>(url);
}

export function fetchCashierPerformance(startDate?: string, endDate?: string, opts?: ApiClientMethodOptions) {
  const url = `/sales/reports/cashier-performance${toQueryParams({ startDate, endDate })}`;
  return opts ? api.get<CashierPerformanceReport>(url, opts) : api.get<CashierPerformanceReport>(url);
}
