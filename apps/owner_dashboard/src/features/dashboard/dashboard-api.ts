/**
 * Dashboard V2 API client (Batch 4).
 *
 * Authority:
 * - docs/dashboard/owner_dashboard_v2_architecture_spec_v0.3.md §7.2 (the
 *   additive V2 fields that exist on GET /sales/reports/dashboard today)
 * - apps/admin_backend FiscalSetupController: GET /onboarding/fiscal-setup
 *   returns FiscalSetupResponse with an explicit `regime`.
 *
 * Wire normalization uses the repo convention (toFiniteNumber): Postgres
 * `numeric` values reach the client as numeric strings.
 */
import { api, type ApiClientMethodOptions } from "@/lib/api";
import { toFiniteNumber } from "@/lib/numeric";

/** Fiscal regimes accepted by the backend (FiscalRegime enum). */
export type FiscalRegime = "CUOTA_FIJA" | "REGIMEN_GENERAL";

/** Normalized fiscal profile the strip is allowed to consume. */
export interface FiscalProfile {
  regime: FiscalRegime;
}

/** reportingPeriod metadata (arch spec §7.2). */
export interface ReportingPeriodWire {
  timezone: string;
  localStartDate: string;
  localEndDate: string;
}

export interface DashboardV2Report {
  // Legacy — retained until all consumers migrate (arch spec §7.3).
  grossSales: number;
  netTaxableSales: number;
  totalTax: number;
  totalDiscounts: number;
  invoiceCount: number;
  ticketAverage: number;
  // V2 explicit semantics (arch spec §7.2).
  netSalesNio: number;
  preDiscountSalesNio: number;
  completedTicketCount: number;
  /** null when the completed-ticket denominator is zero. */
  averageTicketNetNio: number | null;
  totalTaxNio: number;
  totalDiscountsNio: number;
  reportingPeriod: ReportingPeriodWire | null;
  startDate?: string;
  endDate?: string;
  generatedAt: string;
}

/**
 * Nullable numeric wire coercion: absent or non-finite stays null (never a
 * fabricated 0, which would render as C$0.00 instead of "—").
 */
function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = toFiniteNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeReportingPeriod(raw: unknown): ReportingPeriodWire | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.timezone !== "string") return null;
  return {
    timezone: r.timezone,
    localStartDate: typeof r.localStartDate === "string" ? r.localStartDate : "",
    localEndDate: typeof r.localEndDate === "string" ? r.localEndDate : "",
  };
}

export function normalizeDashboardReport(raw: unknown): DashboardV2Report {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    grossSales: toFiniteNumber(r.grossSales),
    netTaxableSales: toFiniteNumber(r.netTaxableSales),
    totalTax: toFiniteNumber(r.totalTax),
    totalDiscounts: toFiniteNumber(r.totalDiscounts),
    invoiceCount: toFiniteNumber(r.invoiceCount),
    ticketAverage: toFiniteNumber(r.ticketAverage),
    netSalesNio: toFiniteNumber(r.netSalesNio),
    preDiscountSalesNio: toFiniteNumber(r.preDiscountSalesNio),
    completedTicketCount: toFiniteNumber(r.completedTicketCount),
    averageTicketNetNio: toNullableNumber(r.averageTicketNetNio),
    totalTaxNio: toFiniteNumber(r.totalTaxNio),
    totalDiscountsNio: toFiniteNumber(r.totalDiscountsNio),
    reportingPeriod: normalizeReportingPeriod(r.reportingPeriod),
    startDate: typeof r.startDate === "string" ? r.startDate : undefined,
    endDate: typeof r.endDate === "string" ? r.endDate : undefined,
    generatedAt: typeof r.generatedAt === "string" ? r.generatedAt : "",
  };
}

/**
 * Normalizes the fiscal-setup response. Returns null when the regime is not
 * one of the two known values: per FR-FISCAL-04 an unreliable regime must
 * never be inferred or defaulted into an authoritative IVA conclusion.
 */
export function normalizeFiscalProfile(raw: unknown): FiscalProfile | null {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  if (r.regime !== "CUOTA_FIJA" && r.regime !== "REGIMEN_GENERAL") return null;
  return { regime: r.regime };
}

function toQueryParams(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(
    (entry): entry is [string, string] => entry[1] !== undefined && entry[1] !== "",
  );
  if (entries.length === 0) return "";
  return "?" + new URLSearchParams(entries).toString();
}

export async function fetchDashboardReport(
  startDate: string,
  endDate: string,
  opts?: ApiClientMethodOptions,
): Promise<DashboardV2Report> {
  const url = `/sales/reports/dashboard${toQueryParams({ startDate, endDate })}`;
  const raw = opts
    ? await api.get<unknown>(url, opts)
    : await api.get<unknown>(url);
  return normalizeDashboardReport(raw);
}

/**
 * Fiscal regime source (FR-FISCAL-01): the tenant's configured fiscal setup,
 * never a client-side inference. Resolves to null when the payload shape is
 * unexpected; network/auth failures reject and surface as fiscal-unknown.
 */
export async function fetchFiscalSetup(
  opts?: ApiClientMethodOptions,
): Promise<FiscalProfile | null> {
  const raw = opts ? await api.get<unknown>("/onboarding/fiscal-setup", opts) : await api.get<unknown>("/onboarding/fiscal-setup");
  return normalizeFiscalProfile(raw);
}
