import { api, type ApiClientMethodOptions } from "@/lib/api";
import { toFiniteNumber } from "@/lib/numeric";

/**
 * The DIVERGENCE ledger, seen from the backoffice.
 *
 * WHY THIS SURFACE EXISTS (FD-01, openspec/changes/fiscal-no-se-congela-por-inventario):
 * the cloud used to REJECT a sale whose outflow the lots could not cover, and
 * that rejection blocked the fiscal stream: every later sale stopped landing
 * in the cloud and the terminal's fiscal sequence froze. The owner ruled that
 * the invoice is always applied and that what does not add up is declared,
 * visible and reconcilable.
 *
 * So here it is visible: the sale, the insumo, the units that nothing backed
 * and the money they represent — plus the diagnostic that NAMES the origin
 * (the insumos whose aggregate stock does not add up to the sum of their
 * lots). Without that second list, the owner would be hunting the difference
 * blind.
 */

export type InventoryDivergenceCause =
  | "LOT_COVERAGE_INSUFFICIENT"
  | "DECLARED_STOCK_INSUFFICIENT";

export interface InventoryDivergence {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  insumoId: string;
  quantity: number;
  unitCostNio: number;
  amountNio: number;
  cause: InventoryDivergenceCause;
  status: "OPEN" | "RECONCILED";
  sourceDeviceId: string | null;
  sourceSequence: string | null;
  createdAt: string;
  reconciledAt: string | null;
  reconciliationRef: string | null;
  resolutionNote: string | null;
}

export interface InventoryParityGap {
  insumoId: string;
  insumoName: string;
  declaredStock: number;
  lotStock: number;
  gap: number;
}

export interface InventoryDivergenceList {
  total: number;
  items: InventoryDivergence[];
}

export interface InventoryParityReport {
  total: number;
  items: InventoryParityGap[];
}

function toCause(raw: unknown): InventoryDivergenceCause {
  return raw === "DECLARED_STOCK_INSUFFICIENT"
    ? "DECLARED_STOCK_INSUFFICIENT"
    : "LOT_COVERAGE_INSUFFICIENT";
}

function toDivergence(raw: unknown): InventoryDivergence | null {
  if (typeof raw !== "object" || raw === null) return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== "string") return null;
  return {
    id: row.id,
    invoiceId: typeof row.invoiceId === "string" ? row.invoiceId : "",
    invoiceNumber:
      typeof row.invoiceNumber === "string" ? row.invoiceNumber : "",
    insumoId: typeof row.insumoId === "string" ? row.insumoId : "",
    quantity: toFiniteNumber(row.quantity),
    unitCostNio: toFiniteNumber(row.unitCostNio),
    amountNio: toFiniteNumber(row.amountNio),
    cause: toCause(row.cause),
    status: row.status === "RECONCILED" ? "RECONCILED" : "OPEN",
    sourceDeviceId:
      typeof row.sourceDeviceId === "string" ? row.sourceDeviceId : null,
    sourceSequence:
      typeof row.sourceSequence === "string" ? row.sourceSequence : null,
    createdAt: typeof row.createdAt === "string" ? row.createdAt : "",
    reconciledAt:
      typeof row.reconciledAt === "string" ? row.reconciledAt : null,
    reconciliationRef:
      typeof row.reconciliationRef === "string"
        ? row.reconciliationRef
        : null,
    resolutionNote:
      typeof row.resolutionNote === "string" ? row.resolutionNote : null,
  };
}

export function fetchInventoryDivergences(
  status: "OPEN" | "RECONCILED" | undefined = "OPEN",
  opts?: ApiClientMethodOptions,
): Promise<InventoryDivergenceList> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return api
    .get<unknown>(`/inventory/divergences${query}`, opts)
    .then((raw) => {
      const body = (typeof raw === "object" && raw !== null
        ? raw
        : {}) as Record<string, unknown>;
      const rows = Array.isArray(body.items) ? body.items : [];
      return {
        total: toFiniteNumber(body.total),
        items: rows
          .map(toDivergence)
          .filter((row): row is InventoryDivergence => row !== null),
      };
    });
}

/**
 * The ORIGIN of the differences: the insumos whose aggregate stock does not
 * add up to the sum of their lot balances.
 */
export function fetchInventoryParityGaps(
  opts?: ApiClientMethodOptions,
): Promise<InventoryParityReport> {
  return api
    .get<unknown>("/inventory/divergences/parity", opts)
    .then((raw) => {
      const body = (typeof raw === "object" && raw !== null
        ? raw
        : {}) as Record<string, unknown>;
      const rows = Array.isArray(body.items) ? body.items : [];
      return {
        total: toFiniteNumber(body.total),
        items: rows.map((row) => {
          const item = (typeof row === "object" && row !== null
            ? row
            : {}) as Record<string, unknown>;
          return {
            insumoId:
              typeof item.insumoId === "string" ? item.insumoId : "",
            insumoName:
              typeof item.insumoName === "string" ? item.insumoName : "",
            declaredStock: toFiniteNumber(item.declaredStock),
            lotStock: toFiniteNumber(item.lotStock),
            gap: toFiniteNumber(item.gap),
          };
        }),
      };
    });
}
