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
 * while contributing nothing to `salesCogsNio`. Because an uncosted sale's
 * real cost is >= 0, omitting it can only INFLATE the margin — so the
 * displayed figure is an upper bound on the period's true margin, never a
 * lower one. Saying which direction the error runs is the whole point of the
 * caveat: an unqualified "C$29,780.50" reads as a completed measurement.
 */
export const PARTIAL_MARGIN_CAVEAT =
  "Costo de ventas parcial: las ventas sin costo registrado cuentan su ingreso pero no su costo, así que el margen mostrado es mayor que el real.";
