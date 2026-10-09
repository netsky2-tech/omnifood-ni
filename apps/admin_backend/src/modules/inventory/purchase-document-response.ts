import { PurchaseDocument } from './entities/purchase-document.entity';

/**
 * Postgres `numeric` columns reach Node as strings: node-postgres parses
 * `numeric` to text and TypeORM's Postgres driver has no decimal hydration
 * case, while `PurchaseDocument` declares five decimal columns as `number`.
 * `GET /inventory/purchases` returned the entity raw, so the wire payload
 * lied to the owner panel (which wrapped `unit_cost_nio` in
 * `Number(x) || 0` — the same latent pattern the cash shift had). The
 * coercion lives here, at the response boundary only, so internal readers
 * and services keep seeing exactly what the driver returned. Entities are
 * never mutated; every other field is passed through untouched.
 *
 * Miss-path semantics mirror `insumo-response.ts` exactly: a value that is
 * already a number passes through, and anything missing, null or not
 * finite fails closed to 0 (`Number(null)` is 0). `PurchaseDocument`
 * declares NO nullable decimal columns, so the explicit null-preserving
 * variant used for the nullable decimals of the sibling mappers
 * (`toFiniteNumberOrNull`) has no case here: the five decimals
 * (`quantity`, `unit_cost`, `bcn_rate`, `unit_cost_nio`,
 * `projected_cpp_nio`) are all non-nullable and fail closed to 0. The
 * write paths (`recordPurchase`, `correctPurchase`) assign these decimals
 * in code before `save`, so mapping them is an identity pass-through kept
 * on the same boundary for a uniform wire contract.
 */
export type PurchaseDocumentResponse = Omit<
  PurchaseDocument,
  'quantity' | 'unit_cost' | 'bcn_rate' | 'unit_cost_nio' | 'projected_cpp_nio'
> & {
  quantity: number;
  unit_cost: number;
  bcn_rate: number;
  unit_cost_nio: number;
  projected_cpp_nio: number;
};

function toFiniteNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function serializePurchaseDocument(
  document: PurchaseDocument,
): PurchaseDocumentResponse {
  return {
    ...document,
    quantity: toFiniteNumber(document.quantity),
    unit_cost: toFiniteNumber(document.unit_cost),
    bcn_rate: toFiniteNumber(document.bcn_rate),
    unit_cost_nio: toFiniteNumber(document.unit_cost_nio),
    projected_cpp_nio: toFiniteNumber(document.projected_cpp_nio),
  };
}

export function serializePurchaseDocuments(
  documents: PurchaseDocument[],
): PurchaseDocumentResponse[] {
  return documents.map(serializePurchaseDocument);
}
