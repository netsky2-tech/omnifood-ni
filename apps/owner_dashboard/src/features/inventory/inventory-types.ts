/**
 * Inventory coverage evidence types (review round 2; WU2/WU11 consumption).
 *
 * Mirrors the backend contract in
 * apps/admin_backend/src/modules/inventory/dto/inventory-reports.dto.ts:
 * `inventoryCoverage` on the COGS read model is trust evidence for the COGS
 * figure. It is NOT freshness and NOT derived from `salesCogsNio` — coverage
 * answers "can the backend establish the authoritative cost for every
 * relevant sale of the period". After WU11 (owner-signed), a sale whose
 * recipe resolved to APPLIED_NO_INVENTORY_IMPACT / NO_EXPLICIT_INSUMO_MAPPING
 * is uncosted, so PARTIAL/UNAVAILABLE is the COMMON path for tenants selling
 * products without insumo mapping.
 *
 * Wire normalization is fail-closed: an unknown status, an absent payload or
 * non-finite counts degrade to null (the downstream margin gate closes); an
 * unknown reason code is filtered out instead of ever reaching the UI.
 */

export type InventoryCoverageStatus = "COMPLETE" | "PARTIAL" | "UNAVAILABLE";

export type InventoryCoverageReasonCode =
  | "MISSING_INVENTORY_IMPACT"
  | "NO_EXPLICIT_INSUMO_MAPPING"
  | "MISSING_COST_BASIS"
  | "ZERO_COST_BASIS"
  | "UNRESOLVED_SOURCE_DOCUMENT"
  | "INCOMPLETE_SYNC";

/** Backend emission order (COVERAGE_REASON_CODE_ORDER in the reports service). */
export const INVENTORY_COVERAGE_REASON_CODES: readonly InventoryCoverageReasonCode[] = [
  "MISSING_INVENTORY_IMPACT",
  "NO_EXPLICIT_INSUMO_MAPPING",
  "MISSING_COST_BASIS",
  // WU12: a recorded-but-zero movement cost (Insumo.averageCost defaults to
  // 0, so a mapped insumo with no purchase stamps totalCostNio = 0). Must be
  // known here or the fail-closed filter drops it and its note degrades.
  "ZERO_COST_BASIS",
  "UNRESOLVED_SOURCE_DOCUMENT",
  "INCOMPLETE_SYNC",
];

const INVENTORY_COVERAGE_STATUSES: readonly InventoryCoverageStatus[] = [
  "COMPLETE",
  "PARTIAL",
  "UNAVAILABLE",
];

export interface InventoryCoverage {
  status: InventoryCoverageStatus;
  costedSalesCount: number;
  uncostedSalesCount: number;
  /** Known reason codes only, in backend emission order; empty when absent. */
  reasonCodes: InventoryCoverageReasonCode[];
}

/**
 * Fail-closed normalization of the wire `InventoryCoverageDto`. Returns null
 * when the payload cannot be trusted (unknown/absent status, non-numeric or
 * non-finite counts) so consumers never treat garbage as COMPLETE.
 *
 * The counts are validated explicitly rather than coerced: `Number(null)` and
 * `Number("")` are both `0`, so coercion would accept a malformed wire as
 * `COMPLETE 0/0` — an empty-but-authoritative-looking coverage that OPENS the
 * ratio gate. An absent or unparseable count means "we do not know how many",
 * which must close the gate. Numeric strings are tolerated purely as transport
 * defensiveness for fields the DTO declares as `number`: these counts are
 * in-memory `++` counters in the reports service, NOT `numeric` columns, so the
 * backend emits JSON numbers and the string branch is expected to stay dead.
 * It is kept because accepting one extra wire shape costs nothing — not
 * because of any claim about how these values are produced.
 */
function toKnownCount(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && Number.isInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) && Number.isInteger(parsed) && parsed >= 0
      ? parsed
      : null;
  }
  return null;
}

export function normalizeInventoryCoverage(raw: unknown): InventoryCoverage | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (!INVENTORY_COVERAGE_STATUSES.includes(r.status as InventoryCoverageStatus)) {
    return null;
  }
  const costed = toKnownCount(r.costedSalesCount);
  const uncosted = toKnownCount(r.uncostedSalesCount);
  if (costed === null || uncosted === null) return null;
  const reasonCodes = Array.isArray(r.reasonCodes)
    ? r.reasonCodes.filter((code): code is InventoryCoverageReasonCode =>
        INVENTORY_COVERAGE_REASON_CODES.includes(code as InventoryCoverageReasonCode),
      )
    : [];
  return {
    status: r.status as InventoryCoverageStatus,
    costedSalesCount: costed,
    uncostedSalesCount: uncosted,
    reasonCodes,
  };
}
