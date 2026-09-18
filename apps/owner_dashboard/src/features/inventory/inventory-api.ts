import { api, type ApiClientMethodOptions } from "@/lib/api";
import type {
  ValuationReport,
  CogsReport,
  KardexReport,
  AlertsSummary,
  KardexFilters,
} from "./types";

function toQueryParams(
  params: Record<string, string | number | undefined> | KardexFilters,
): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== "",
  );
  if (entries.length === 0) return "";
  return "?" + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
}

export function fetchValuation(opts?: ApiClientMethodOptions) {
  return opts ? api.get<ValuationReport>("/inventory/reports/valuation", opts) : api.get<ValuationReport>("/inventory/reports/valuation");
}

export function fetchCogs(from?: string, to?: string, opts?: ApiClientMethodOptions) {
  const url = `/inventory/reports/cogs${toQueryParams({ from, to })}`;
  return opts ? api.get<CogsReport>(url, opts) : api.get<CogsReport>(url);
}

export function fetchKardex(filters: KardexFilters = {}, opts?: ApiClientMethodOptions) {
  const url = `/inventory/reports/kardex${toQueryParams(filters)}`;
  return opts ? api.get<KardexReport>(url, opts) : api.get<KardexReport>(url);
}

export function fetchAlerts(opts?: ApiClientMethodOptions) {
  return opts ? api.get<AlertsSummary>("/inventory/reports/alerts", opts) : api.get<AlertsSummary>("/inventory/reports/alerts");
}
