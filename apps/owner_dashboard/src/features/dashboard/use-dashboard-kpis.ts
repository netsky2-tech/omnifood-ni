/**
 * React-query composition for the Dashboard V2 executive KPI strip (Batch 4).
 *
 * Fetches current + previous comparison ranges (resolver: domain/comparison-period.ts),
 * the tenant fiscal regime (FR-FISCAL-01) and the COGS report for the margin
 * KPI (arch spec §AD-06). Query failures stay per-part so the strip can render
 * degraded states without killing sibling widgets (PRD FR-STATE-04).
 */
import { useQuery } from "@tanstack/react-query";
import { useTenantId } from "@/lib/tenant";
import { fetchCogs } from "@/features/inventory/inventory-api";
import { toFiniteNumber } from "@/lib/numeric";
import { formatLocalDate } from "@/lib/utils";
import { resolveComparisonPeriod, type ComparisonPeriod, type LocalDateRange } from "./domain/comparison-period";
import { fetchDashboardReport, fetchFiscalSetup, type FiscalProfile } from "./dashboard-api";
import { buildKpiSnapshot, type KpiSnapshot } from "./kpi-deltas";

export interface DashboardKpis {
  period: ComparisonPeriod;
  snapshot: KpiSnapshot | null;
  /** True while either sales range is still loading. */
  isSalesPending: boolean;
  /** True when any sales range fetch failed (strip-level degraded state). */
  isSalesFailed: boolean;
  fiscal: FiscalProfile | null;
  /** True when the fiscal regime cannot be trusted: fetch failed or the
   *  payload had no valid regime (FR-FISCAL-04 warning). */
  isFiscalFailed: boolean;
  isFiscalPending: boolean;
  isCogsFailed: boolean;
}

function useSalesRangeQuery(tenantId: string, start: string, end: string, enabled: boolean) {
  return useQuery({
    queryKey: ["sales", tenantId, "dashboard-v2", start, end],
    queryFn: ({ signal }) => fetchDashboardReport(start, end, { signal }),
    staleTime: 2 * 60 * 1000,
    retry: false,
    enabled,
  });
}

function useCogsRangeQuery(tenantId: string, start: string, end: string, enabled: boolean) {
  return useQuery({
    queryKey: ["inventory", tenantId, "cogs", start, end],
    queryFn: ({ signal }) => fetchCogs(start, end, { signal }),
    staleTime: 5 * 60 * 1000,
    retry: false,
    enabled,
  });
}

export interface DashboardKpisOptions {
  /**
   * AG-06 / AC-17 gate: when false, the COGS reads are never fired and the
   * margin KPI is omitted — a permission-limited Manager must neither see
   * nor trigger a fetch of sensitive cost figures.
   */
  canViewCost?: boolean;
}

export function useDashboardKpis(
  range: LocalDateRange,
  today?: string,
  options: DashboardKpisOptions = {},
): DashboardKpis {
  const { canViewCost = true } = options;
  const tenantId = useTenantId();
  const now = today ?? formatLocalDate(new Date());
  const period = resolveComparisonPeriod(range, now);

  const currentQuery = useSalesRangeQuery(tenantId, period.currentStart, period.currentEnd, true);
  const previousQuery = useSalesRangeQuery(
    tenantId,
    period.previousStart,
    period.previousEnd,
    true,
  );

  const cogsCurrentQuery = useCogsRangeQuery(
    tenantId,
    period.currentStart,
    period.currentEnd,
    currentQuery.isSuccess && canViewCost,
  );
  const cogsPreviousQuery = useCogsRangeQuery(
    tenantId,
    period.previousStart,
    period.previousEnd,
    previousQuery.isSuccess && canViewCost,
  );

  const fiscalQuery = useQuery({
    queryKey: ["onboarding", tenantId, "fiscal-setup"],
    queryFn: ({ signal }) => fetchFiscalSetup({ signal }),
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  const cogsCurrentNio = cogsCurrentQuery.data
    ? toFiniteNumber(cogsCurrentQuery.data.salesCogsNio, Number.NaN)
    : null;
  const cogsPreviousNio = cogsPreviousQuery.data
    ? toFiniteNumber(cogsPreviousQuery.data.salesCogsNio, Number.NaN)
    : null;

  const snapshot = buildKpiSnapshot(
    currentQuery.data ?? null,
    previousQuery.data ?? null,
    cogsCurrentNio !== null && Number.isFinite(cogsCurrentNio) ? cogsCurrentNio : null,
    cogsPreviousNio !== null && Number.isFinite(cogsPreviousNio) ? cogsPreviousNio : null,
  );

  return {
    period,
    snapshot,
    isSalesPending: currentQuery.isPending || previousQuery.isPending,
    isSalesFailed: currentQuery.isError || previousQuery.isError,
    fiscal: fiscalQuery.data ?? null,
    isFiscalFailed: fiscalQuery.isError || (fiscalQuery.isSuccess && fiscalQuery.data === null),
    isFiscalPending: fiscalQuery.isPending,
    isCogsFailed: cogsCurrentQuery.isError || cogsPreviousQuery.isError,
  };
}
