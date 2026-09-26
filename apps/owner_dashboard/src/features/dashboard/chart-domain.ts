/**
 * Pure adapters for the Dashboard V2 performance band (Batch 5b).
 *
 * Map normalized wire data to chart-ready structures. No React, no fetching,
 * no Intl side channels beyond deterministic UTC formatting — every function
 * is unit-testable in isolation (Batch 5b task scope 7).
 *
 * Authority: PRD §14–§17, §23, §25.3 (color-never-alone). Revenue/currency
 * honesty is encoded here so the cards can display it verbatim:
 * - top-products `totalRevenue` sums tax-inclusive invoice line totals
 *   (backend `invoices.service`: line `total` includes `taxAmount`; invoice
 *   `subtotal = total - totalTax`), so it is NOT pre-tax Net Sales
 *   (FR-PRODUCT-01 gap, surfaced on the card).
 * - payment slots `cashUsd`/`cardUsd` carry original-currency amounts net of
 *   change; NIO slots and `totalNio` are the NIO consolidation (AG-08 net).
 */
import type { DailySeriesDay } from "./dashboard-api";
import type { HourlySalesBucket, PaymentMethodsBreakdown, TopProductItem } from "@/features/sales/types";

/** One trend row: current day plus the comparison value at the same range position. */
export interface TrendRow {
  date: string;
  /** es-NI short bucket label, e.g. "18 sep" (UTC arithmetic, locale-stable). */
  label: string;
  current: number;
  /** null when the comparison series is unavailable/short — never a fabricated 0. */
  previous: number | null;
}

/** Compact NIO axis formatter (e.g. 48520 -> "49k"). */
export function compactNio(value: number): string {
  if (!Number.isFinite(value)) return "";
  if (Math.abs(value) >= 1000) return `${Math.round(value / 1000)}k`;
  return String(Math.round(value));
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

/** es-NI córdobas formatter shared by the performance-band widgets. */
export function formatNio(amount: number): string {
  return new Intl.NumberFormat("es-NI", {
    style: "currency",
    currency: "NIO",
    minimumFractionDigits: 2,
  }).format(amount);
}

/** es-NI US-dollar formatter (original-currency payment slots, FR-PAY-03). */
export function formatUsd(amount: number): string {
  return new Intl.NumberFormat("es-NI", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
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
 * Fills the full 24h domain: buckets missing from the wire are zero-sale
 * inactivity gaps, never dropped points (Batch 5b scope 3).
 */
export function buildHourlyBars(
  hourly: HourlySalesBucket[] | null | undefined,
): HourlyBarsResult {
  const wire = Array.isArray(hourly) ? hourly : [];
  const salesByHour = new Map<number, number>();
  for (const b of wire) {
    const hour = Math.trunc(Number(b?.hour));
    const sales = Number(b?.totalSales);
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
  /** Backend line total (tax-inclusive) — NOT pre-tax Net Sales. */
  revenue: number;
  /** Client-side share of the listed rows' revenue; null on a zero base. */
  sharePercent: number | null;
}

const TOP_PRODUCTS_BASIS_NOTE =
  "Base monetaria: total de línea con IVA incluido según el endpoint existente; no equivale a Ventas Netas (pre-IVA).";

/**
 * Maps the existing GET /sales/reports/top-products response. The endpoint
 * provides units and revenue but no share field: share is computed here over
 * the listed rows' revenue sum and labeled as such (Batch 5b gap finding).
 */
export function buildTopProductRows(
  products: TopProductItem[] | null | undefined,
  limit = 5,
): { rows: TopProductRow[]; revenueBasisNote: string } {
  const wire = Array.isArray(products) ? products : [];
  const listed = wire.slice(0, Math.max(0, limit));
  const listedRevenue = listed.reduce((sum, p) => sum + (Number(p?.totalRevenue) || 0), 0);
  return {
    rows: listed.map((p) => ({
      name: typeof p?.productName === "string" && p.productName !== "" ? p.productName : "Producto sin nombre",
      units: Number(p?.totalQuantity) || 0,
      revenue: Number(p?.totalRevenue) || 0,
      sharePercent: percentOf(Number(p?.totalRevenue) || 0, listedRevenue),
    })),
    revenueBasisNote: TOP_PRODUCTS_BASIS_NOTE,
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
