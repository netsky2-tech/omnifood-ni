/**
 * Pure adapters for the Dashboard V2 performance band (Batch 5b).
 *
 * Map normalized wire data to chart-ready structures. No React, no fetching,
 * no Intl side channels beyond deterministic UTC formatting — every function
 * is unit-testable in isolation (Batch 5b task scope 7).
 *
 * Authority: PRD §14–§17, §23, §25.3 (color-never-alone). Revenue/currency
 * honesty is encoded here so the cards can display it verbatim:
 * - top-products `netRevenueNio` is the post-discount, pre-tax Net Sales
 *   contribution per product (backend Batch 5c; reconciles line-by-line with
 *   the executive KPI `netSalesNio`, FR-PRODUCT-01). The deprecated
 *   tax-inclusive `totalRevenue` is never displayed.
 * - payment slots `cashUsd`/`cardUsd` carry original-currency amounts net of
 *   change; NIO slots and `totalNio` are the NIO consolidation (AG-08 net).
 */
import type { DailySeriesDay } from "./dashboard-api";
import type { PaymentMethodsBreakdown } from "@/features/sales/types";

/** One trend row: current day plus the comparison value at the same range position. */
export interface TrendRow {
  date: string;
  /** es-NI short bucket label, e.g. "18 sep" (UTC arithmetic, locale-stable). */
  label: string;
  current: number;
  /** null when the comparison series is unavailable/short — never a fabricated 0. */
  previous: number | null;
}

/** es-NI short date label from a YYYY-MM-DD local date (UTC calendar math). */
export function trendBucketLabel(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return new Intl.DateTimeFormat("es-NI", { day: "numeric", month: "short", timeZone: "UTC" }).format(d);
}

/** Round to one decimal, or null when the base is not a positive number. */
export function percentOf(part: number, total: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return null;
  return Math.round((part / total) * 1000) / 10;
}

/**
 * Money that rounds to zero at display precision (2 decimals) is rounding
 * noise, not a real negative: 0, -0 and -0.001 must render as C$0.00, never
 * "-C$0.00". A genuinely small negative (-0.01) is real money and keeps its
 * sign. Normalized here — in the shared formatter — so no call site can
 * reintroduce a signed zero (review round 2, WU9).
 */
function unsignedZeroAtDisplayPrecision(amount: number): number {
  if (!Number.isFinite(amount) || Math.round(amount * 100) / 100 !== 0) return amount;
  return 0;
}

/**
 * es-NI córdobas formatter shared by the performance-band widgets AND the
 * money-axis ticks (WU9: axes carry the C$ unit with this same formatter —
 * one definition of how money is printed, no compact duplicate).
 */
export function formatNio(amount: number): string {
  return new Intl.NumberFormat("es-NI", {
    style: "currency",
    currency: "NIO",
    minimumFractionDigits: 2,
  }).format(unsignedZeroAtDisplayPrecision(amount));
}

/** es-NI US-dollar formatter (original-currency payment slots, FR-PAY-03). */
export function formatUsd(amount: number): string {
  return new Intl.NumberFormat("es-NI", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(unsignedZeroAtDisplayPrecision(amount));
}

/**
 * Merges current and comparison daily series by range position (the resolver
 * guarantees equal-duration, non-overlapping ranges). A missing or short
 * comparison series null-fills; it never fabricates zeros (PRD §23/FR-STATE-03).
 */
export function buildTrendRows(
  current: DailySeriesDay[] | null | undefined,
  previous: DailySeriesDay[] | null | undefined,
): TrendRow[] {
  const cur = Array.isArray(current) ? current : [];
  const prev = Array.isArray(previous) ? previous : [];
  return cur.map((day, i) => ({
    date: day.date,
    label: trendBucketLabel(day.date),
    current: day.netSalesNio,
    previous: prev[i]?.netSalesNio ?? null,
  }));
}

/**
 * FR-CHART-04: an all-zero range is "no sales", not a chart. Null/empty
 * inputs count as empty.
 */
export function isZeroSeries(days: DailySeriesDay[] | null | undefined): boolean {
  if (!Array.isArray(days) || days.length === 0) return true;
  return days.every((d) => d.netSalesNio === 0 && d.completedTicketCount === 0);
}

export interface HourlyBar {
  hour: number;
  /** Zero-padded "HH:00" label. */
  label: string;
  sales: number;
}

export interface HourlyBarsResult {
  bars: HourlyBar[];
  hasActivity: boolean;
  firstActiveHour: number | null;
  lastActiveHour: number | null;
}

/** Zero-pads an hour into "HH:00". */
export function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

/**
 * Wire bucket shape accepted by buildHourlyBars. Structurally compatible with
 * the legacy `HourlySalesBucket`; the adapter reads the V2 additive
 * `netSalesNio` (post-discount, pre-tax per bucket, FR-HOURLY-03) and never
 * the deprecated tax-inclusive `totalSales`.
 */
export interface HourlyWireBucket {
  hour: unknown;
  invoiceCount?: unknown;
  /** V2 Net Sales per bucket (post-discount, pre-tax; FR-HOURLY-03). */
  netSalesNio?: unknown;
  /** @deprecated legacy tax-inclusive bucket total; never displayed. */
  totalSales?: unknown;
}

/**
 * Fills the full 24h domain: buckets missing from the wire are zero-sale
 * inactivity gaps, never dropped points (Batch 5b scope 3). Sales are read
 * from the V2 `netSalesNio` bucket field; absent/garbage values fail closed
 * to 0.
 */
export function buildHourlyBars(
  hourly: HourlyWireBucket[] | null | undefined,
): HourlyBarsResult {
  const wire = Array.isArray(hourly) ? hourly : [];
  const salesByHour = new Map<number, number>();
  for (const b of wire) {
    const hour = Math.trunc(Number(b?.hour));
    const sales = Number(b?.netSalesNio);
    if (Number.isInteger(hour) && hour >= 0 && hour <= 23 && Number.isFinite(sales)) {
      salesByHour.set(hour, (salesByHour.get(hour) ?? 0) + sales);
    }
  }
  const bars: HourlyBar[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: hourLabel(hour),
    sales: salesByHour.get(hour) ?? 0,
  }));
  const activeHours = bars.filter((b) => b.sales > 0).map((b) => b.hour);
  return {
    bars,
    hasActivity: activeHours.length > 0,
    firstActiveHour: activeHours.length > 0 ? Math.min(...activeHours) : null,
    lastActiveHour: activeHours.length > 0 ? Math.max(...activeHours) : null,
  };
}

export interface TopProductRow {
  name: string;
  /** Backend line-item quantity (`totalQuantity`) — a real units field. */
  units: number;
  /** Backend `netRevenueNio`: post-discount, pre-tax Net Sales contribution (FR-PRODUCT-01). */
  revenue: number;
  /** Client-side share of the period's Net Sales (`periodNetSalesNio`); null when the period denominator is missing/zero/negative (fail closed). */
  sharePercent: number | null;
  /**
   * The exact denominator `sharePercent` was computed against, already passed
   * through the same `isFinite && > 0` gate. Exposed so a per-cell explanation
   * can show the arithmetic it actually used instead of restating the generic
   * card note; null when the share is not computable, so nothing can render a
   * division that did not happen.
   */
  periodNetSalesNio: number | null;
}

/**
 * Wire item shape accepted by buildTopProductRows. Structurally compatible
 * with the legacy `TopProductItem`; the adapter reads the V2 additive
 * `netRevenueNio` and never the deprecated tax-inclusive `totalRevenue`.
 */
export interface TopProductWireItem {
  productId: unknown;
  productName: unknown;
  totalQuantity: unknown;
  /** V2 Net Sales contribution (post-discount, pre-tax; FR-PRODUCT-01). */
  netRevenueNio?: unknown;
  /** @deprecated legacy tax-inclusive line total; never displayed. */
  totalRevenue?: unknown;
}

/**
 * Maps GET /sales/reports/top-products (Batch 5c-backend reconciled contract,
 * WU6 share fix). Revenue is `netRevenueNio`: post-discount, pre-tax Net
 * Sales per product, reconciled line-by-line with the KPI `netSalesNio`
 * (FR-PRODUCT-01). Share is computed against the backend's authoritative
 * `periodNetSalesNio` — the period's Net Sales over the SAME invoice set the
 * aggregates were built from — so a truncated Top-N never inflates shares to
 * a fabricated 100%. Fail closed: when the denominator is missing, zero,
 * negative or non-finite (e.g. an older backend that omits the field), the
 * share is null (rendered as an em-dash); it never falls back to the listed
 * rows' sum, because a silently wrong denominator is worse than an absent
 * share.
 */
export function buildTopProductRows(
  products: TopProductWireItem[] | null | undefined,
  limit = 5,
  periodNetSalesNio?: unknown,
): { rows: TopProductRow[] } {
  const wire = Array.isArray(products) ? products : [];
  const listed = wire.slice(0, Math.max(0, limit));
  const revenueOf = (p: TopProductWireItem | undefined) =>
    Number.isFinite(Number(p?.netRevenueNio)) ? Number(p?.netRevenueNio) : 0;
  const denominator = Number(periodNetSalesNio);
  const hasDenominator = Number.isFinite(denominator) && denominator > 0;
  return {
    rows: listed.map((p) => ({
      name: typeof p?.productName === "string" && p.productName !== "" ? p.productName : "Producto sin nombre",
      units: Number(p?.totalQuantity) || 0,
      revenue: revenueOf(p),
      sharePercent: hasDenominator ? percentOf(revenueOf(p), denominator) : null,
      periodNetSalesNio: hasDenominator ? denominator : null,
    })),
  };
}

export interface PaymentMixRow {
  key: string;
  label: string;
  amount: number;
  /** "USD" rows are original-currency amounts; NIO rows consolidate in C$. */
  currency: "NIO" | "USD";
  /** Percent of `totalNio` (the NIO consolidation); null on a zero base. */
  percent: number | null;
}

/**
 * Maps the legacy dashboard paymentMethodsBreakdown (Batch 1; already net of
 * `changeGiven` server-side per AG-08). USD slots keep their original currency
 * (FR-PAY-03: never raw-add USD to NIO); percentages use the NIO total.
 */
export function buildPaymentMixRows(breakdown: PaymentMethodsBreakdown | null | undefined): {
  rows: PaymentMixRow[];
  totalNio: number;
} {
  if (typeof breakdown !== "object" || breakdown === null) return { rows: [], totalNio: 0 };
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const totalNio = num(breakdown.totalNio);
  const defs: Array<[string, string, number, "NIO" | "USD"]> = [
    ["cashNio", "Efectivo (C$)", num(breakdown.cashNio), "NIO"],
    ["cashUsd", "Efectivo (US$)", num(breakdown.cashUsd), "USD"],
    ["cardNio", "Tarjeta (C$)", num(breakdown.cardNio), "NIO"],
    ["cardUsd", "Tarjeta (US$)", num(breakdown.cardUsd), "USD"],
    ["other", "Otros", num(breakdown.other), "NIO"],
  ];
  return {
    rows: defs
      .filter(([, , amount]) => amount !== 0)
      .map(([key, label, amount, currency]) => ({
        key,
        label,
        amount,
        currency,
        percent: percentOf(amount, totalNio),
      })),
    totalNio,
  };
}
