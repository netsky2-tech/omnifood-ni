import { CashShiftSyncIngestionService } from './cash-shift-sync-ingestion.service';
import type {
  CashMovementSyncItemDto,
  CashShiftSessionSyncItemDto,
} from '../dto/cash-shift-sync.dto';

interface RepoStub {
  findOne: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
}

function repoStub(): RepoStub {
  return {
    findOne: jest.fn().mockResolvedValue(null),
    insert: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
  };
}

function posSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'shift-001',
    terminalId: 'term-1',
    cashierId: 'user-1',
    openedAt: '2026-01-01T12:00:00.000Z',
    status: 'OPEN',
    initialFloatNio: 5000,
    initialFloatUsd: 0,
    expectedCashNio: 5000,
    expectedCashUsd: 0,
    ...overrides,
  } as CashShiftSessionSyncItemDto;
}

function posMovement(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cmv-001',
    shiftId: 'shift-001',
    terminalId: 'term-1',
    type: 'CASH_IN',
    amountNio: 1000,
    amountUsd: 0,
    reason: 'Fondo de cambio',
    timestamp: '2026-01-01T12:05:00.000Z',
    ...overrides,
  } as CashMovementSyncItemDto;
}

describe('CashShiftSyncIngestionService', () => {
  it('persists a pushed session and its movement scoped to the caller tenant', async () => {
    const shifts = repoStub();
    const movements = repoStub();
    const service = new CashShiftSyncIngestionService(
      shifts as never,
      movements as never,
    );

    const result = await service.ingestCashShiftBatch('tenant-1', {
      sessions: [
        posSession({
          closedAt: '2026-01-01T20:00:00.000Z',
          status: 'CLOSED',
          finalCountedNio: 5200,
          differenceNio: 200,
          zReportSequence: 7,
        }),
      ],
      movements: [posMovement()],
    });

    expect(result.received).toBe(2);
    expect(result.processed).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.results.map((item) => item.status)).toEqual([
      'ACCEPTED',
      'ACCEPTED',
    ]);
    expect(shifts.insert).toHaveBeenCalledTimes(1);
    const sessionValues = shifts.insert.mock.calls[0][0];
    expect(sessionValues).toMatchObject({
      id: 'shift-001',
      tenant_id: 'tenant-1',
      terminal_id: 'term-1',
      cashier_id: 'user-1',
      status: 'CLOSED',
      final_counted_nio: 5200,
      difference_nio: 200,
      z_report_sequence: 7,
    });
    expect(sessionValues.opened_at).toEqual(
      new Date('2026-01-01T12:00:00.000Z'),
    );
    expect(movements.insert).toHaveBeenCalledTimes(1);
    expect(movements.insert.mock.calls[0][0]).toMatchObject({
      id: 'cmv-001',
      tenant_id: 'tenant-1',
      shift_id: 'shift-001',
      type: 'CASH_IN',
      amount_nio: 1000,
      timestamp: new Date('2026-01-01T12:05:00.000Z'),
    });
  });

  it('accepts an idempotent replay: an already-known session is updated in place and a known movement is not re-inserted', async () => {
    const shifts = repoStub();
    shifts.findOne.mockResolvedValue({
      id: 'shift-001',
      tenant_id: 'tenant-1',
      status: 'OPEN',
    });
    const movements = repoStub();
    movements.findOne.mockResolvedValue({
      id: 'cmv-001',
      tenant_id: 'tenant-1',
    });
    const service = new CashShiftSyncIngestionService(
      shifts as never,
      movements as never,
    );

    const first = await service.ingestCashShiftBatch('tenant-1', {
      sessions: [posSession()],
      movements: [posMovement()],
    });
    // The terminal retries the same batch after a lost response.
    const second = await service.ingestCashShiftBatch('tenant-1', {
      sessions: [
        posSession({
          status: 'CLOSED',
          closedAt: '2026-01-01T20:00:00.000Z',
          finalCountedNio: 5100,
        }),
      ],
      movements: [posMovement()],
    });

    expect(first.failed).toBe(0);
    expect(second.failed).toBe(0);
    expect(second.results.every((item) => item.status === 'ACCEPTED')).toBe(
      true,
    );
    // Session is upserted (OPEN -> CLOSED reaches the cloud), never duplicated.
    expect(shifts.insert).not.toHaveBeenCalled();
    expect(shifts.update).toHaveBeenCalledTimes(2);
    expect(shifts.update.mock.calls[1][0]).toEqual({
      id: 'shift-001',
      tenant_id: 'tenant-1',
    });
    expect(shifts.update.mock.calls[1][1]).toMatchObject({
      status: 'CLOSED',
      final_counted_nio: 5100,
    });
    // Movements are immutable: a replay inserts nothing new.
    expect(movements.insert).not.toHaveBeenCalled();
  });

  it('scopes every write to the caller tenant and refuses a cross-tenant id collision per record', async () => {
    const shifts = repoStub();
    // The id was already recorded by a different tenant: the caller may not
    // touch that row.
    shifts.findOne.mockImplementation(({ where }) =>
      Promise.resolve(
        where.id === 'shift-001'
          ? { id: 'shift-001', tenant_id: 'tenant-OTHER' }
          : null,
      ),
    );
    const movements = repoStub();
    const service = new CashShiftSyncIngestionService(
      shifts as never,
      movements as never,
    );

    const result = await service.ingestCashShiftBatch('tenant-1', {
      sessions: [posSession(), posSession({ id: 'shift-002' })],
      movements: [posMovement()],
    });

    expect(result.received).toBe(3);
    expect(result.processed).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.results[0]).toMatchObject({
      idempotencyKey: 'shift-001',
      status: 'FAILED',
      code: 'TENANT_IDENTITY_CONFLICT',
    });
    expect(result.results[1].status).toBe('ACCEPTED');
    // The caller never overwrites the other tenant's row and every
    // tenant-bound write carries only the caller tenant.
    expect(shifts.update).not.toHaveBeenCalled();
    expect(shifts.insert).toHaveBeenCalledTimes(1);
    expect(shifts.insert.mock.calls[0][0].tenant_id).toBe('tenant-1');
    expect(movements.insert.mock.calls[0][0].tenant_id).toBe('tenant-1');
  });

  it('isolates a per-record persistence failure and keeps the rest of the batch alive', async () => {
    const shifts = repoStub();
    const movements = repoStub();
    movements.insert
      .mockRejectedValueOnce(new Error('invalid input value for enum type'))
      .mockResolvedValueOnce({});
    const service = new CashShiftSyncIngestionService(
      shifts as never,
      movements as never,
    );

    const result = await service.ingestCashShiftBatch('tenant-1', {
      sessions: [posSession()],
      movements: [posMovement(), posMovement({ id: 'cmv-002' })],
    });

    expect(result.received).toBe(3);
    expect(result.processed).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.results[0]).toMatchObject({
      idempotencyKey: 'shift-001',
      status: 'ACCEPTED',
    });
    expect(result.results[1]).toMatchObject({
      idempotencyKey: 'cmv-001',
      status: 'FAILED',
      code: 'PERSISTENCE_ERROR',
    });
    expect(result.results[2]).toMatchObject({
      idempotencyKey: 'cmv-002',
      status: 'ACCEPTED',
    });
  });

  it('fails an unrecognized session status per record and keeps the rest of the batch alive', async () => {
    const shifts = repoStub();
    const movements = repoStub();
    const service = new CashShiftSyncIngestionService(
      shifts as never,
      movements as never,
    );

    const result = await service.ingestCashShiftBatch('tenant-1', {
      sessions: [
        posSession({ id: 'shift-bad', status: 'SUSPENDED' }),
        posSession({ id: 'shift-good', status: 'CLOSED' }),
      ],
      movements: [posMovement()],
    });

    expect(result.received).toBe(3);
    expect(result.processed).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.results[0]).toMatchObject({
      idempotencyKey: 'shift-bad',
      status: 'FAILED',
      code: 'INVALID_STATUS',
    });
    // Valid OPEN/CLOSED records are unaffected by the bad neighbor.
    expect(result.results[1]).toMatchObject({
      idempotencyKey: 'shift-good',
      status: 'ACCEPTED',
    });
    expect(result.results[2]).toMatchObject({
      idempotencyKey: 'cmv-001',
      status: 'ACCEPTED',
    });
    // The rejected record never touches the cloud table; only the valid
    // session is inserted.
    expect(shifts.insert).toHaveBeenCalledTimes(1);
    expect(shifts.insert.mock.calls[0][0].id).toBe('shift-good');
  });
});
