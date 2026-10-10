import { CashShiftSession } from '../entities/cash-shift.entity';
import { CashMovement } from '../entities/cash-movement.entity';

/**
 * Postgres `numeric` columns reach Node as strings: node-postgres parses
 * `numeric` to text and TypeORM's Postgres driver has no decimal hydration
 * case, while `CashShiftSession` and `CashMovement` declare their money
 * columns as `number`. `/sales/shifts` returns the entities raw, so the
 * wire payload lies; the panel happens to wrap `difference_nio` in
 * `Number(...)` today, which masks the latent defect. The coercion lives
 * here, at the response boundary only, so internal readers (services, sync
 * listeners) keep seeing exactly what the driver returned. Entities are
 * never mutated; every other field is passed through untouched.
 *
 * Miss-path semantics mirror `product-response.ts` exactly for the
 * non-nullable columns: a value that is already a number passes through,
 * and anything missing, null or not finite fails closed to 0
 * (`Number(null)` is 0). For the nullable decimal columns (`final_counted_*`
 * and `difference_*`) only the null/undefined case diverges, by explicit
 * contract: null stays null, because NULL means "the shift is still open /
 * never counted" and coercing it to 0 would fabricate a fact the row never
 * carried. A non-null value still follows `toFiniteNumber`. The `int`
 * columns (`z_report_sequence`, voucher counts) are real numbers from the
 * driver and pass through untouched.
 */
export type CashShiftSessionResponse = Omit<
  CashShiftSession,
  | 'initial_float_nio'
  | 'initial_float_usd'
  | 'final_counted_nio'
  | 'final_counted_usd'
  | 'expected_cash_nio'
  | 'expected_cash_usd'
  | 'difference_nio'
  | 'difference_usd'
> & {
  initial_float_nio: number;
  initial_float_usd: number;
  final_counted_nio: number | null;
  final_counted_usd: number | null;
  expected_cash_nio: number;
  expected_cash_usd: number;
  difference_nio: number | null;
  difference_usd: number | null;
};

export type CashMovementResponse = Omit<
  CashMovement,
  'amount_nio' | 'amount_usd'
> & {
  amount_nio: number;
  amount_usd: number;
};

function toFiniteNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toFiniteNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return toFiniteNumber(value);
}

export function serializeCashShiftSession(
  shift: CashShiftSession,
): CashShiftSessionResponse {
  return {
    ...shift,
    initial_float_nio: toFiniteNumber(shift.initial_float_nio),
    initial_float_usd: toFiniteNumber(shift.initial_float_usd),
    final_counted_nio: toFiniteNumberOrNull(shift.final_counted_nio),
    final_counted_usd: toFiniteNumberOrNull(shift.final_counted_usd),
    expected_cash_nio: toFiniteNumber(shift.expected_cash_nio),
    expected_cash_usd: toFiniteNumber(shift.expected_cash_usd),
    difference_nio: toFiniteNumberOrNull(shift.difference_nio),
    difference_usd: toFiniteNumberOrNull(shift.difference_usd),
  };
}

export function serializeCashShiftSessions(
  shifts: CashShiftSession[],
): CashShiftSessionResponse[] {
  return shifts.map(serializeCashShiftSession);
}

export function serializeCashMovement(
  movement: CashMovement,
): CashMovementResponse {
  return {
    ...movement,
    amount_nio: toFiniteNumber(movement.amount_nio),
    amount_usd: toFiniteNumber(movement.amount_usd),
  };
}

export function serializeCashMovements(
  movements: CashMovement[],
): CashMovementResponse[] {
  return movements.map(serializeCashMovement);
}
