/**
 * Margin display gate for the Margen Bruto KPI tile (review round 2, P0 #4).
 *
 * Defect: the strip derived the margin ratio from `salesCogsNio` alone, so a
 * tenant with COGS data but no APPLIED insumo movements rendered
 * "Margen Bruto 100.0%" with a fabricated delta. After WU11 flipped the
 * coverage policy, that hidden-margin path is the COMMON path.
 *
 * Contract (owner review round 2):
 * - The RATIO (percent + pp delta) is trust-gated on
 *   `inventoryCoverage.status === "COMPLETE"` for the period it describes.
 *   Any other status, an unknown status or absent coverage fails closed —
 *   a zero denominator is never fabricated into a percentage.
 * - The AMOUNT (C$ = netSales − salesCogsNio) is authoritative whenever the
 *   COGS read model loaded and the period is COMPLETE or PARTIAL (real cost
 *   evidence exists for the costed part). At UNAVAILABLE the backend cannot
 *   demonstrate per-sale cost evidence, and `salesCogsNio` is NOT provably
 *   authoritative there: the reports service sums every SALE movement in the
 *   window, including movements the coverage counter cannot attribute (rows
 *   without an invoice-prefixed source document, canceled invoices). So the
 *   amount hides too — hiding is the only safe rendering.
 * - Pure data module: no labels, no fetching, no React.
 */
import type {
  InventoryCoverage,
  InventoryCoverageReasonCode,
} from "@/features/inventory/inventory-types";

export interface MarginGate {
  /** Percent ratio may render (current-period coverage COMPLETE). */
  ratio: boolean;
  /** pp delta may render (ratio plus COMPLETE previous-period coverage). */
  delta: boolean;
  /** C$ amount (netSales − salesCogsNio) may render. */
  amount: boolean;
  /** COGS loaded but the ratio is gated: render the "Sin costo" note. */
  gated: boolean;
  /** Backend reason codes for a gated period (backend emission order). */
  reasonCodes: InventoryCoverageReasonCode[];
}

export interface MarginGateInput {
  /** True when the current-period COGS report loaded successfully. */
  isCogsLoaded: boolean;
  /** Fail-closed normalized current-period coverage (null = unusable/absent). */
  current: InventoryCoverage | null;
  /** Fail-closed normalized previous-period coverage (null = unusable/absent). */
  previous: InventoryCoverage | null;
}

/** COGS not loaded: legacy degraded rendering ("—" / "Sin base comparable"). */
const COGS_NOT_LOADED_GATE: MarginGate = {
  ratio: false,
  delta: false,
  amount: false,
  gated: false,
  reasonCodes: [],
};

/**
 * Derives the margin display gate from the coverage evidence. Pure and
 * total: every unknown input fails closed.
 */
export function evaluateMarginGate(input: MarginGateInput): MarginGate {
  const { isCogsLoaded, current, previous } = input;
  if (!isCogsLoaded) return COGS_NOT_LOADED_GATE;

  if (current?.status === "COMPLETE") {
    return {
      ratio: true,
      // The pp delta compares two authoritative ratios; a previous period
      // whose coverage is not COMPLETE is not a comparable base.
      delta: previous?.status === "COMPLETE",
      amount: true,
      gated: false,
      reasonCodes: [],
    };
  }

  return {
    ratio: false,
    delta: false,
    // PARTIAL: costed sales carry a real cost basis, so a margin AMOUNT exists
    // for the costed part of the period and renders with a caveat
    // (coverage-notes.ts). "Lower-bound"/"upper-bound" wording is intentionally
    // avoided: the two reachable data shapes push the figure in opposite
    // directions, so no bound is provable. UNAVAILABLE/unknown/absent: nothing
    // is provable — hide the amount as well.
    amount: current?.status === "PARTIAL",
    gated: true,
    reasonCodes: current?.reasonCodes ?? [],
  };
}
