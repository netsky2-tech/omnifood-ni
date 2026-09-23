/**
 * Numeric coercion for API payloads that declare `number` but may arrive as
 * text on the wire.
 *
 * Postgres `numeric` columns reach the client as strings: node-postgres
 * parses `numeric` to text and the JSON payload carries them unchanged.
 *
 * Mirrors the backend helper in
 * `apps/admin_backend/src/modules/inventory/product-response.ts` exactly:
 * same semantics (accept numbers and numeric strings, reject everything
 * non-finite) and the same fail-closed default of 0.
 */
export function toFiniteNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
