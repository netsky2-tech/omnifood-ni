/**
 * Single source of truth for the COGS-coverage caveat copy (review round 2,
 * P0 #4).
 *
 * Why a separate module: the margin gate is rendered by two surfaces — the
 * Margen Bruto KPI tile and the Rentabilidad card — and round-2 validation
 * found the card had NO caveat at all while the tile did. That is the exact
 * failure mode this batch is meant to eliminate: the same unproven figure
 * allowed to be more confident on one surface than on another. Sharing the
 * copy makes a divergent treatment visible instead of silent.
 *
 * Owner-facing strings are Spanish; code comments stay English.
 */
import type { InventoryCoverageReasonCode } from "@/features/inventory/inventory-types";
import type { MarginGate } from "./dashboard-types";

const MARGIN_NOTE_BY_REASON: Record<InventoryCoverageReasonCode, string> = {
  NO_EXPLICIT_INSUMO_MAPPING:
    "Sin costo: hay productos sin insumos mapeados. Mapea los insumos del producto para incluir su costo.",
  MISSING_INVENTORY_IMPACT:
    "Sin costo: el impacto de inventario de algunas ventas está pendiente. Sincroniza el terminal para completarlo.",
  MISSING_COST_BASIS:
    "Sin costo: algunas ventas no tienen costo registrado en inventario.",
  // WU12: the movement chain is intact — the insumo simply has no purchase
  // cost yet (averageCost defaults to 0). The fix is recording purchases.
  ZERO_COST_BASIS:
    "Sin costo: algunos insumos todavía no tienen costo de compra registrado. Registra el costo de compra de esos insumos para calcular el margen.",
  UNRESOLVED_SOURCE_DOCUMENT:
    "Sin costo: no se pudo resolver el documento de origen de algunas ventas.",
  INCOMPLETE_SYNC:
    "Sin costo: faltan datos de inventario por sincronizar.",
};

/**
 * Resolve the actionable "Sin costo" note in backend emission order: the
 * first known code wins (MISSING_INVENTORY_IMPACT and
 * NO_EXPLICIT_INSUMO_MAPPING lead the list server-side). A raw reason-code
 * string is never rendered; unknown or empty codes degrade to the generic
 * copy rather than to silence.
 */
export function marginGateNote(reasonCodes: InventoryCoverageReasonCode[]): string {
  const known = reasonCodes.find((code) =>
    Object.prototype.hasOwnProperty.call(MARGIN_NOTE_BY_REASON, code),
  );
  return (
    (known && MARGIN_NOTE_BY_REASON[known]) ||
    "Sin costo: no hay datos de costo suficientes para este periodo."
  );
}

/**
 * PARTIAL coverage caveat (finding D1).
 *
 * The margin AMOUNT is provable at PARTIAL only for the costed part of the
 * period: every uncosted sale still contributes its revenue to `netSalesNio`
 * while contributing nothing to `salesCogsNio`.
 *
 * Deliberately NO direction is claimed here. An earlier draft asserted the
 * displayed margin was an upper bound on the real one. That is true for the
 * PARTIAL shape alone (cost omitted ⇒ margin inflated), but it is NOT true of
 * the number in general: a canceled invoice whose SALE movement has no
 * matching SALE_CANCEL does the opposite — its revenue leaves `netSalesNio`
 * (`isRevenueAffectingDocument` requires `!isCanceled`) while its cost stays
 * in `salesCogsNio`, which sums every SALE movement in the window with no
 * cancellation join. So the two reachable shapes push the figure in opposite
 * directions, and which one applies depends on a reversal invariant this
 * repository has not proven (see the follow-up risk note in
 * odd/tasks/dashboard-v2-review-round-2.md). Claiming a direction would be a
 * fabricated guarantee — exactly the defect class this batch exists to remove.
 * What IS provable, and all the caveat claims, is that the figure is not the
 * period's real margin.
 */
export const PARTIAL_MARGIN_CAVEAT =
  "Costo de ventas incompleto: parte del período no tiene costo registrado, así que este margen no es el margen real del período.";

/**
 * Every caveat line a gated margin must show, in render order — shared by the
 * KPI tile and the Rentabilidad card.
 *
 * This function exists because finding D1 was a *divergence*, not a missing
 * string: the tile warned about hidden cost while the card printed the same
 * unproven margin without a word. Returning the ordered lines from one place
 * removes the only degree of freedom that produced it — a surface can no
 * longer choose its own honesty level for the same gate state.
 *
 * At PARTIAL the amount renders, so the incompleteness caveat comes first and
 * the actionable reason note follows. At UNAVAILABLE (and unknown/absent
 * coverage) the amount is hidden, so only the unavailability line is emitted.
 */
export function marginGateCaveatLines(marginGate: MarginGate): string[] {
  if (!marginGate.gated) return [];
  if (marginGate.amount) {
    return [PARTIAL_MARGIN_CAVEAT, marginGateNote(marginGate.reasonCodes)];
  }
  // UNAVAILABLE / unknown / absent: the amount is hidden, but the actionable
  // reason still belongs on the surface — hiding the figure without saying why
  // would be the same half-explanation D1 was.
  return ["Costo de ventas no disponible", marginGateNote(marginGate.reasonCodes)];
}
