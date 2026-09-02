import { api } from "@/lib/api";
import type {
  ValuationReport,
  CogsReport,
  KardexReport,
  AlertsSummary,
  KardexFilters,
} from "./types";

function toQueryParams(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== "",
  );
  if (entries.length === 0) return "";
  return "?" + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
}

export function fetchValuation() {
  return api.get<ValuationReport>("/inventory/reports/valuation");
}

export function fetchCogs(from?: string, to?: string) {
  return api.get<CogsReport>(
    `/inventory/reports/cogs${toQueryParams({ from, to })}`,
  );
}

export function fetchKardex(filters: KardexFilters = {}) {
  return api.get<KardexReport>(
    `/inventory/reports/kardex${toQueryParams(filters)}`,
  );
}

export function fetchAlerts() {
  return api.get<AlertsSummary>("/inventory/reports/alerts");
}
