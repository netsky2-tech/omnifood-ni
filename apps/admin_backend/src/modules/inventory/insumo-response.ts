import { Insumo } from './entities/insumo.entity';

/**
 * Postgres `numeric` columns reach Node as strings: node-postgres parses
 * `numeric` to text and TypeORM's Postgres driver has no decimal hydration
 * case, while `Insumo` declares seven decimal columns as `number`. Unlike
 * `Product`, `/insumos` returns the entity raw, so the wire payload lies to
 * the owner panel (which compares `stock <= parLevel` and formats
 * `averageCost` with Intl). The coercion lives here, at the response
 * boundary only, so internal readers and services keep seeing exactly what
 * the driver returned. Entities are never mutated; every other field is
 * passed through untouched.
 *
 * Miss-path semantics mirror `product-response.ts` exactly for the
 * non-nullable columns: a value that is already a number passes through,
 * and anything missing, null or not finite fails closed to 0
 * (`Number(null)` is 0). For the nullable decimal columns (`parLevel`,
 * `minStock`, `maxStock`) only the null/undefined case diverges, by
 * explicit contract: null stays null, because a nullable decimal coerced
 * to 0 would fabricate a fact the row never carried. A non-null value on a
 * nullable column still follows the same `toFiniteNumber` path.
 */
export type InsumoResponse = Omit<
  Insumo,
  'conversionFactor' | 'stock' | 'existenciaActual' | 'averageCost' | 'parLevel' | 'minStock' | 'maxStock'
> & {
  conversionFactor: number;
  stock: number;
  existenciaActual: number;
  averageCost: number;
  parLevel: number | null;
  minStock: number | null;
  maxStock: number | null;
};

function toFiniteNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toFiniteNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return toFiniteNumber(value);
}

export function serializeInsumo(insumo: Insumo): InsumoResponse {
  return {
    ...insumo,
    conversionFactor: toFiniteNumber(insumo.conversionFactor),
    stock: toFiniteNumber(insumo.stock),
    existenciaActual: toFiniteNumber(insumo.existenciaActual),
    averageCost: toFiniteNumber(insumo.averageCost),
    parLevel: toFiniteNumberOrNull(insumo.parLevel),
    minStock: toFiniteNumberOrNull(insumo.minStock),
    maxStock: toFiniteNumberOrNull(insumo.maxStock),
  };
}

export function serializeInsumos(insumos: Insumo[]): InsumoResponse[] {
  return insumos.map(serializeInsumo);
}
