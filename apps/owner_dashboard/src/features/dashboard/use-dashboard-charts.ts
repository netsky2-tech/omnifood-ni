/**
 * React-query composition for the Dashboard V2 performance band (Batch 5b).
 *
 * Same conventions as use-dashboard-kpis: tenant-scoped query keys, staleTime
 * windows, `retry: false` so widget-level failure states render immediately
 * (PRD FR-STATE-04) without killing sibling widgets.
 *
 * Data sources:
 * - SalesTrend: GET /sales/reports/dashboard/daily-series (frozen Batch 5b
 *   contract, backend under concurrent construction — consumed only through
 *   the wire normalization in dashboard-api).
 * - HourlySales: GET /sales/reports/hourly-sales (Batch 5c wire, via the
 *   normalization in dashboard-api): single-day mode when start === end,
 *   aggregated multi-day distribution otherwise.
 * - TopProducts: existing GET /sales/reports/top-products.
 * - PaymentMix: existing GET /sales/reports/dashboard (Batch-1
 *   paymentMethodsBreakdown, net of changeGiven server-side).
 */
import { useQuery } from "@tanstack/react-query";
import { useTenantId } from "@/lib/tenant";
import { fetchDailySeries, fetchHourlyReport } from "./dashboard-api";
import {
  fetchSalesDashboard,
  fetchTopProducts,
} from "@/features/sales/sales-api";

const STALE_2_MIN = 2 * 60 * 1000;

/** Daily series for one inclusive local range; disable with `enabled` for optional comparison fetches. */
export function useDailySeries(start: string, end: string, enabled = true) {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["sales", tenantId, "daily-series", start, end],
    queryFn: ({ signal }) => fetchDailySeries(start, end, { signal }),
    staleTime: STALE_2_MIN,
    retry: false,
    enabled,
  });
}

/**
 * Hourly distribution for an inclusive local range (FR-HOURLY-01/03): a
 * single day queries with `date`; a multi-day range queries with
 * `startDate`/`endDate` and gets the averaged per-hour distribution plus
 * `meta.dayCount`.
 */
export function useHourlyReport(start: string, end: string) {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["sales", tenantId, "hourly", start, end],
    queryFn: ({ signal }) =>
      fetchHourlyReport(
        start === end ? { date: start } : { startDate: start, endDate: end },
        { signal },
      ),
    staleTime: STALE_2_MIN,
    retry: false,
  });
}

/** Existing top-products route (compact card budget, default 5 rows). */
export function useTopProductsReport(start: string, end: string, limit = 5) {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["sales", tenantId, "top-products", start, end, limit],
    queryFn: ({ signal }) => fetchTopProducts(start, end, limit, { signal }),
    staleTime: STALE_2_MIN,
    retry: false,
  });
}

/** Legacy dashboard report for the Batch-1 paymentMethodsBreakdown. */
export function usePaymentMixReport(start: string, end: string) {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["sales", tenantId, "dashboard", start, end],
    queryFn: ({ signal }) => fetchSalesDashboard(start, end, { signal }),
    staleTime: STALE_2_MIN,
    retry: false,
  });
}
