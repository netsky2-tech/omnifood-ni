import {
  CashShiftSession,
  CashShiftStatus,
} from '../entities/cash-shift.entity';
import {
  CashMovement,
  CashMovementType,
} from '../entities/cash-movement.entity';
import {
  serializeCashMovement,
  serializeCashShiftSession,
} from './cash-shift-response';

/**
 * Postgres `numeric` columns reach Node as strings: node-postgres parses
 * `numeric` to text and TypeORM's Postgres driver has no decimal hydration
 * case. `CashShiftSession` and `CashMovement` declare their money columns as
 * `number`, and `/sales/shifts` returns the entities raw, so the wire
 * payload lies. The panel currently happens to wrap `difference_nio` in
 * `Number(...)`, which masks the latent defect; these cases pin the boundary
 * that restores the declared type without mutating the entities. Nullable
 * decimal columns (final counts and differences) must keep `null` as `null`:
 * NULL means "the shift is still open / never counted", so coercing it to 0
 * would fabricate a fact the row never carried.
 */
describe('serializeCashShiftSession', () => {
  const makeShift = (over: Record<string, unknown> = {}) =>
    ({
      id: 'shift-1',
      tenant_id: 'tenant-A',
      terminal_id: 'term-main',
      cashier_id: 'user-cajero',
      cashier_name: 'Juan Pérez',
      opened_at: new Date('2026-01-01T08:00:00.000Z'),
      closed_at: null,
      status: CashShiftStatus.OPEN,
      initial_float_nio: '1000.0000',
      initial_float_usd: '50.0000',
      final_counted_nio: null,
      final_counted_usd: null,
      expected_cash_nio: '1150.5000',
      expected_cash_usd: '57.5000',
      difference_nio: null,
      difference_usd: null,
      z_report_sequence: null,
      card_vouchers_pending: null,
      card_vouchers_reconciled: null,
      card_vouchers_overridden: null,
      supervisor_id: null,
      notes: null,
      ...over,
    }) as unknown as CashShiftSession;

  const makeMovement = (over: Record<string, unknown> = {}) =>
    ({
      id: 'mov-1',
      tenant_id: 'tenant-A',
      shift_id: 'shift-1',
      terminal_id: 'term-main',
      type: CashMovementType.PETTY_CASH,
      amount_nio: '150.0000',
      amount_usd: '0.0000',
      reason: 'Compra de bolsas',
      authorized_by_user_id: null,
      timestamp: new Date('2026-01-01T09:00:00.000Z'),
      ...over,
    }) as unknown as CashMovement;

  it('coerces driver strings into JSON numbers', () => {
    const result = serializeCashShiftSession(makeShift());

    expect(result.initial_float_nio).toBe(1000);
    expect(result.initial_float_usd).toBe(50);
    expect(result.expected_cash_nio).toBe(1150.5);
    expect(result.expected_cash_usd).toBe(57.5);
    expect(typeof result.initial_float_nio).toBe('number');
    expect(typeof result.expected_cash_nio).toBe('number');
    expect(typeof result.expected_cash_usd).toBe('number');
  });

  it('coerces driver strings into JSON numbers on movements', () => {
    const result = serializeCashMovement(makeMovement());

    expect(result.amount_nio).toBe(150);
    expect(result.amount_usd).toBe(0);
    expect(typeof result.amount_nio).toBe('number');
    expect(typeof result.amount_usd).toBe('number');
  });

  it('"0.00" becomes 0 and a genuine numeric 0 stays 0', () => {
    const result = serializeCashShiftSession(
      makeShift({
        initial_float_nio: '0.0000',
        initial_float_usd: '0.0000',
        expected_cash_nio: 0,
      }),
    );
    const movement = serializeCashMovement(
      makeMovement({ amount_nio: '0.0000', amount_usd: 0 }),
    );

    expect(result.initial_float_nio).toBe(0);
    expect(result.initial_float_usd).toBe(0);
    expect(result.expected_cash_nio).toBe(0);
    expect(movement.amount_nio).toBe(0);
    expect(movement.amount_usd).toBe(0);
    expect(typeof result.initial_float_nio).toBe('number');
    expect(typeof movement.amount_nio).toBe('number');
  });

  it('preserves decimal precision instead of truncating it', () => {
    const result = serializeCashShiftSession(
      makeShift({ expected_cash_nio: '1234.5678' }),
    );

    expect(result.expected_cash_nio).toBe(1234.5678);
  });

  it('leaves already-numeric values untouched', () => {
    const result = serializeCashShiftSession(
      makeShift({
        initial_float_nio: 1000,
        expected_cash_nio: 1150.5,
        expected_cash_usd: 57.5,
      }),
    );

    expect(result.initial_float_nio).toBe(1000);
    expect(result.expected_cash_nio).toBe(1150.5);
    expect(result.expected_cash_usd).toBe(57.5);
  });

  it('keeps null as null on nullable decimal columns instead of fabricating 0', () => {
    const result = serializeCashShiftSession(makeShift());

    // Open shift: never counted, no difference exists yet.
    expect(result.final_counted_nio).toBeNull();
    expect(result.final_counted_usd).toBeNull();
    expect(result.difference_nio).toBeNull();
    expect(result.difference_usd).toBeNull();
  });

  it('coerces a closed shift\'s final counts and differences into numbers', () => {
    const result = serializeCashShiftSession(
      makeShift({
        status: CashShiftStatus.CLOSED,
        closed_at: new Date('2026-01-01T17:00:00.000Z'),
        final_counted_nio: '1150.0000',
        final_counted_usd: '57.2500',
        difference_nio: '-0.5000',
        difference_usd: '-0.2500',
        z_report_sequence: 7,
      }),
    );

    expect(result.final_counted_nio).toBe(1150);
    expect(result.final_counted_usd).toBe(57.25);
    expect(result.difference_nio).toBe(-0.5);
    expect(result.difference_usd).toBe(-0.25);
    expect(typeof result.difference_nio).toBe('number');
    expect(typeof result.final_counted_nio).toBe('number');
    // int columns are real numbers from the driver; they pass through.
    expect(result.z_report_sequence).toBe(7);
  });

  it('keeps every non-numeric field byte-identical', () => {
    const shift = makeShift();
    const result = serializeCashShiftSession(shift);

    expect(result.id).toBe(shift.id);
    expect(result.tenant_id).toBe(shift.tenant_id);
    expect(result.terminal_id).toBe('term-main');
    expect(result.cashier_name).toBe('Juan Pérez');
    expect(result.status).toBe(CashShiftStatus.OPEN);
    expect(result.opened_at).toBe(shift.opened_at);
    expect(result.closed_at).toBeNull();
    expect(result.notes).toBeNull();

    const movement = serializeCashMovement(makeMovement());
    expect(movement.type).toBe(CashMovementType.PETTY_CASH);
    expect(movement.reason).toBe('Compra de bolsas');
    expect(movement.shift_id).toBe('shift-1');
    expect(movement.timestamp).toEqual(new Date('2026-01-01T09:00:00.000Z'));
  });

  it('does not mutate the entities it serializes', () => {
    const shift = makeShift();
    const movement = makeMovement();
    serializeCashShiftSession(shift);
    serializeCashMovement(movement);

    expect(shift.expected_cash_nio).toBe('1150.5000');
    expect(shift.difference_nio).toBeNull();
    expect(movement.amount_nio).toBe('150.0000');
  });
});
