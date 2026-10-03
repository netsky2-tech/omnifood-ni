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

/** PRD §21.1 / spec §18.7 tip-coverage metadata (Batch 7). */
export interface TipCoverageWire {
  recordedInvoicesCount: number;
  totalInvoicesCount: number;
}

/**
 * Voluntary-tip summary (PRD §21.2, Batch 7). Tips are NEVER part of any
 * sales total (PRD §21.3); tipCoverage distinguishes legacy NULL rows from
 * genuine zero-tip sales (AD-10) so "no tip data" is never read as "tips
 * disabled" (PRD §21.4).
 */
export interface TipsSummaryWire {
  /** null when no tip was recorded in the period (never a fabricated 0). */
  totalTipsNio: number | null;
  tippedTicketCount: number;
  /** null when no ticket tipped. */
  averageTipNio: number | null;
  /** null when the sale-time tip-eligible base is 0. */
  tipRate: number | null;
  tipCoverage: TipCoverageWire;
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
  /** Batch 7 (PRD §21): null when the backend did not send a usable summary. */
  tipsSummary: TipsSummaryWire | null;
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

/**
 * Tips-summary wire normalization (Batch 7, PRD §21): counts must be finite
 * (fail closed to null — the widget is hidden, never fabricated) and nullable
 * money/rate fields keep null, mirroring toNullableNumber discipline.
 */
export function normalizeTipsSummary(raw: unknown): TipsSummaryWire | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const coverage =
    typeof r.tipCoverage === "object" && r.tipCoverage !== null
      ? (r.tipCoverage as Record<string, unknown>)
      : null;
  if (!coverage) return null;
  const recorded = toFiniteNumber(coverage.recordedInvoicesCount, Number.NaN);
  const total = toFiniteNumber(coverage.totalInvoicesCount, Number.NaN);
  const tipped = toFiniteNumber(r.tippedTicketCount, Number.NaN);
  if (!Number.isFinite(recorded) || !Number.isFinite(total) || !Number.isFinite(tipped)) {
    return null;
  }
  return {
    totalTipsNio: toNullableNumber(r.totalTipsNio),
    tippedTicketCount: Math.trunc(tipped),
    averageTipNio: toNullableNumber(r.averageTipNio),
    tipRate: toNullableNumber(r.tipRate),
    tipCoverage: {
      recordedInvoicesCount: Math.trunc(recorded),
      totalInvoicesCount: Math.trunc(total),
    },
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
    tipsSummary: normalizeTipsSummary(r.tipsSummary),
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

/** One calendar day of the frozen daily-series contract (Batch 5b). */
export interface DailySeriesDay {
  date: string;
  netSalesNio: number;
  completedTicketCount: number;
  /** null when the completed-ticket denominator is zero. */
  averageTicketNetNio: number | null;
}

/** Normalized GET /sales/reports/dashboard/daily-series response. */
export interface DailySeries {
  days: DailySeriesDay[];
  reportingPeriod: ReportingPeriodWire | null;
  generatedAt: string;
}

/**
 * Daily-series wire normalization (frozen Batch 5b contract; same rules as
 * normalizeDashboardReport): Postgres numeric arrives as numeric strings,
 * absent/non-finite averages stay null, garbage fails closed.
 */
export function normalizeDailySeries(raw: unknown): DailySeries {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const days = Array.isArray(r.days) ? r.days : [];
  return {
    days: days.map((entry) => {
      const d = (typeof entry === "object" && entry !== null ? entry : {}) as Record<string, unknown>;
      return {
        date: typeof d.date === "string" ? d.date : "",
        netSalesNio: toFiniteNumber(d.netSalesNio),
        completedTicketCount: toFiniteNumber(d.completedTicketCount),
        averageTicketNetNio: toNullableNumber(d.averageTicketNetNio),
      };
    }),
    reportingPeriod: normalizeReportingPeriod(r.reportingPeriod),
    generatedAt: typeof r.generatedAt === "string" ? r.generatedAt : "",
  };
}

/**
 * Daily series for an inclusive local calendar-day range (2–60 days; every
 * calendar day present, zero days included). Backend contract under
 * construction in apps/admin_backend — consumed here strictly per the frozen
 * wire contract, never by probing a live backend.
 */
export async function fetchDailySeries(
  startDate: string,
  endDate: string,
  opts?: ApiClientMethodOptions,
): Promise<DailySeries> {
  const url = `/sales/reports/dashboard/daily-series${toQueryParams({ startDate, endDate })}`;
  const raw = opts
    ? await api.get<unknown>(url, opts)
    : await api.get<unknown>(url);
  return normalizeDailySeries(raw);
}

/**
 * Hourly distribution (FR-HOURLY-01/03, Batch 5c wire contract).
 *
 * Single-day mode queries with `date`; multi-day ranges query with
 * `startDate`/`endDate` (mutually exclusive per HourlySalesQueryDto) and get
 * the aggregated per-hour distribution across the whole range. Buckets carry
 * the V2 `netSalesNio` (post-discount, pre-tax; reconciles with the executive
 * KPI, FR-HOURLY-03); the deprecated tax-inclusive `totalSales` is never read.
 */
export interface HourlyBucketV2 {
  hour: number;
  invoiceCount: number;
  netSalesNio: number;
}

export interface HourlyReportV2 {
  /** Requested day (single-day mode) or range start (range mode). */
  date: string;
  /** Local calendar days aggregated in the response; 1 in single-day mode. */
  dayCount: number;
  hourly: HourlyBucketV2[];
  generatedAt: string;
}

export type HourlyQuery = { date: string } | { startDate: string; endDate: string };

export function normalizeHourlyReport(raw: unknown): HourlyReportV2 {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const buckets = Array.isArray(r.hourly) ? r.hourly : [];
  const meta = (typeof r.meta === "object" && r.meta !== null ? r.meta : {}) as Record<string, unknown>;
  const dayCount = Number(meta.dayCount);
  return {
    date: typeof r.date === "string" ? r.date : "",
    dayCount: Number.isFinite(dayCount) && dayCount >= 1 ? Math.trunc(dayCount) : 1,
    hourly: buckets.map((entry) => {
      const b = (typeof entry === "object" && entry !== null ? entry : {}) as Record<string, unknown>;
      return {
        hour: toFiniteNumber(b.hour),
        invoiceCount: toFiniteNumber(b.invoiceCount),
        netSalesNio: toFiniteNumber(b.netSalesNio),
      };
    }),
    generatedAt: typeof r.generatedAt === "string" ? r.generatedAt : "",
  };
}

export async function fetchHourlyReport(
  query: HourlyQuery,
  opts?: ApiClientMethodOptions,
): Promise<HourlyReportV2> {
  const params =
    "date" in query
      ? { date: query.date }
      : { startDate: query.startDate, endDate: query.endDate };
  const url = `/sales/reports/hourly-sales${toQueryParams(params)}`;
  const raw = opts ? await api.get<unknown>(url, opts) : await api.get<unknown>(url);
  return normalizeHourlyReport(raw);
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

// ---------------------------------------------------------------------------
// Batch 6b — Attention Required signal reads (PRD §19, arch spec §15/§16/§18)
// ---------------------------------------------------------------------------

/**
 * GET /sales/reports/card-reconciliation-summary (arch spec §15).
 *
 * Outstanding-state scoped, NOT date-range scoped (spec §15.1): the attention
 * band labels this as current outstanding state, never as "for the selected
 * period".
 */
export interface CardReconciliationSummary {
  pendingCount: number;
  pendingAmountNio: number;
  /** ISO 8601 of the oldest pending row; null when nothing is pending. */
  oldestPendingAt: string | null;
  generatedAt: string;
}

export function normalizeCardReconciliationSummary(
  raw: unknown,
): CardReconciliationSummary {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    pendingCount: toFiniteNumber(r.pendingCount),
    pendingAmountNio: toFiniteNumber(r.pendingAmountNio),
    oldestPendingAt: typeof r.oldestPendingAt === "string" ? r.oldestPendingAt : null,
    generatedAt: typeof r.generatedAt === "string" ? r.generatedAt : "",
  };
}

export async function fetchCardReconciliationSummary(
  opts?: ApiClientMethodOptions,
): Promise<CardReconciliationSummary> {
  const url = "/sales/reports/card-reconciliation-summary";
  const raw = opts ? await api.get<unknown>(url, opts) : await api.get<unknown>(url);
  return normalizeCardReconciliationSummary(raw);
}

/**
 * GET /operations/audit/summary (arch spec §16).
 *
 * Executive contract only: counts and the latest high-severity marker — no
 * raw forensic payload ever reaches the dashboard (spec §16.1).
 */
export interface AuditExecutiveSummary {
  criticalCount: number;
  warningCount: number;
  /** Awareness-level events; historical rows (NULL severity) surface here. */
  infoCount: number;
  generatedAt: string;
}

export function normalizeAuditExecutiveSummary(raw: unknown): AuditExecutiveSummary {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    criticalCount: toFiniteNumber(r.criticalCount),
    warningCount: toFiniteNumber(r.warningCount),
    infoCount: toFiniteNumber(r.infoCount),
    generatedAt: typeof r.generatedAt === "string" ? r.generatedAt : "",
  };
}

export async function fetchAuditSummary(
  startDate: string,
  endDate: string,
  opts?: ApiClientMethodOptions,
): Promise<AuditExecutiveSummary> {
  const url = `/operations/audit/summary${toQueryParams({ startDate, endDate })}`;
  const raw = opts ? await api.get<unknown>(url, opts) : await api.get<unknown>(url);
  return normalizeAuditExecutiveSummary(raw);
}

// ---------------------------------------------------------------------------
// Sync freshness (PRD §20, FR-SYNC-01..05; arch spec §17.12)
// ---------------------------------------------------------------------------

/** Top-level tenant freshness state (SyncFreshnessDto.state). */
export type SyncFreshnessState = "COMPLETE" | "STALE" | "PARTIAL" | "UNKNOWN";

/**
 * Terminal-level state: 'PENDING' is display-only (a provisioned device with
 * no first successful checkpoint) and never appears in the top-level state.
 */
export type SyncFreshnessTerminalState = SyncFreshnessState | "PENDING";

export interface SyncFreshnessTerminal {
  terminalId: string;
  label: string | null;
  state: SyncFreshnessTerminalState;
  acceptedThroughSequence: number | null;
  lastReceiptAt: string | null;
  hasDeclaredGaps?: boolean;
}

/**
 * GET /operations/sync/freshness response (apps/admin_backend
 * SyncFreshnessDto). `evaluatedAt` is technical metadata only (FR-SYNC-04):
 * freshness meaning lives in `state`/`lastCompleteAt`, derived from confirmed
 * receipt watermarks — never from report generation time.
 */
export interface SyncFreshnessResponse {
  state: SyncFreshnessState;
  /** Platform freshness target in minutes (FR-SYNC-03, server-configured). */
  thresholdMinutes: number;
  /** Oldest confirmed watermark; null for PARTIAL/UNKNOWN. */
  lastCompleteAt: string | null;
  perTerminal: SyncFreshnessTerminal[];
  evaluatedAt: string;
  hasDeclaredGaps?: boolean;
}

const FRESHNESS_STATES: readonly SyncFreshnessState[] = [
  "COMPLETE",
  "STALE",
  "PARTIAL",
  "UNKNOWN",
];
const TERMINAL_STATES: readonly SyncFreshnessTerminalState[] = [
  ...FRESHNESS_STATES,
  "PENDING",
];

function toFreshnessState(value: unknown): SyncFreshnessState {
  return FRESHNESS_STATES.includes(value as SyncFreshnessState)
    ? (value as SyncFreshnessState)
    : "UNKNOWN";
}

function toTerminalState(value: unknown): SyncFreshnessTerminalState {
  return TERMINAL_STATES.includes(value as SyncFreshnessTerminalState)
    ? (value as SyncFreshnessTerminalState)
    : "UNKNOWN";
}

/**
 * Fail-closed wire normalization: an unrecognized state degrades to UNKNOWN
 * (never silently to COMPLETE) and the freshness threshold defaults to the
 * FR-SYNC-03 platform target of 5 minutes when the server omits it.
 */
export function normalizeSyncFreshness(raw: unknown): SyncFreshnessResponse {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const terminals = Array.isArray(r.perTerminal) ? r.perTerminal : [];
  const threshold = toNullableNumber(r.thresholdMinutes);
  return {
    state: toFreshnessState(r.state),
    thresholdMinutes:
      threshold !== null && threshold > 0 ? Math.trunc(threshold) : 5,
    lastCompleteAt: typeof r.lastCompleteAt === "string" ? r.lastCompleteAt : null,
    ...(typeof r.hasDeclaredGaps === "boolean"
      ? { hasDeclaredGaps: r.hasDeclaredGaps }
      : {}),
    perTerminal: terminals.map((entry) => {
      const t = (typeof entry === "object" && entry !== null ? entry : {}) as Record<
        string,
        unknown
      >;
      return {
        terminalId: typeof t.terminalId === "string" ? t.terminalId : "",
        label: typeof t.label === "string" ? t.label : null,
        state: toTerminalState(t.state),
        acceptedThroughSequence: toNullableNumber(t.acceptedThroughSequence),
        lastReceiptAt: typeof t.lastReceiptAt === "string" ? t.lastReceiptAt : null,
        ...(typeof t.hasDeclaredGaps === "boolean"
          ? { hasDeclaredGaps: t.hasDeclaredGaps }
          : {}),
      };
    }),
    evaluatedAt: typeof r.evaluatedAt === "string" ? r.evaluatedAt : "",
  };
}

export async function fetchSyncFreshness(
  opts?: ApiClientMethodOptions,
): Promise<SyncFreshnessResponse> {
  const url = "/operations/sync/freshness";
  const raw = opts ? await api.get<unknown>(url, opts) : await api.get<unknown>(url);
  return normalizeSyncFreshness(raw);
}
