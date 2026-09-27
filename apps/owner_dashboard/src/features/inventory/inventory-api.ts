import { api, type ApiClientMethodOptions } from "@/lib/api";
import type {
  ValuationReport,
  CogsReport,
  KardexReport,
  AlertsSummary,
  KardexFilters,
} from "./types";
import {
  normalizeInventoryCoverage,
  type InventoryCoverage,
} from "./inventory-types";

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

/**
 * COGS read model with the WU2 `inventoryCoverage` trust evidence appended.
 * The base CogsReport shape lives in ./types (shared with the inventory
 * page); coverage is additive. Optional on the type so producers that do not
 * know the field (older wires, test fixtures) stay assignable — the gate
 * treats undefined exactly like null: fail closed.
 */
export interface CogsReportWithCoverage extends CogsReport {
  inventoryCoverage?: InventoryCoverage | null;
}

export async function fetchCogs(
  from?: string,
  to?: string,
  opts?: ApiClientMethodOptions,
): Promise<CogsReportWithCoverage> {
  const url = `/inventory/reports/cogs${toQueryParams({ from, to })}`;
  const raw = opts ? await api.get<unknown>(url, opts) : await api.get<unknown>(url);
  const report = raw as CogsReport;
  return {
    ...report,
    inventoryCoverage: normalizeInventoryCoverage(
      (raw as Record<string, unknown> | null)?.inventoryCoverage ?? null,
    ),
  };
}

export function fetchKardex(filters: KardexFilters = {}, opts?: ApiClientMethodOptions) {
  const url = `/inventory/reports/kardex${toQueryParams(filters)}`;
  return opts ? api.get<KardexReport>(url, opts) : api.get<KardexReport>(url);
}

export function fetchAlerts(opts?: ApiClientMethodOptions) {
  return opts ? api.get<AlertsSummary>("/inventory/reports/alerts", opts) : api.get<AlertsSummary>("/inventory/reports/alerts");
}
