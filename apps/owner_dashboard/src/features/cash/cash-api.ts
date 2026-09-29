import { api, type ApiClientMethodOptions } from "@/lib/api";
import type { CashShiftSession, CashShiftStatus } from "./types";

function toQueryParams(
  params: Record<string, string | number | undefined>,
): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== "",
  );
  if (entries.length === 0) return "";
  return (
    "?" + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()
  );
}

/**
 * Owner-dashboard oversight list of cash-shift sessions
 * (GET /sales/shifts, OWNER/MANAGER on the backend). `status` is optional;
 * `limit` caps the page server-side (backend default 50, max 100).
 */
export function fetchCashSessions(
  status?: CashShiftStatus,
  limit?: number,
  opts?: ApiClientMethodOptions,
) {
  const url = `/sales/shifts${toQueryParams({ status, limit })}`;
  return opts
    ? api.get<CashShiftSession[]>(url, opts)
    : api.get<CashShiftSession[]>(url);
}
