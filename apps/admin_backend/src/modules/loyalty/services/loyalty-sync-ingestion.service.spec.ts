import { ConflictException } from '@nestjs/common';
import { LoyaltySyncIngestionService } from './loyalty-sync-ingestion.service';
import type { AppendLoyaltyTxDto } from './loyalty-ledger.service';
import type { LoyaltyProgramResolution } from './loyalty-sync-ingestion.service';

interface RecordedCall {
  dto: AppendLoyaltyTxDto;
}

function ledgerRecord(returnValue: unknown = { id: 'tx-1' }) {
  const calls: RecordedCall[] = [];
  const appendTransaction = jest.fn().mockImplementation(async (dto) => {
    calls.push({ dto });
    if (typeof returnValue === 'function') return returnValue(dto);
    return returnValue;
  });
  return { appendTransaction, calls };
}

function posRecord(overrides: Record<string, unknown> = {}) {
  return {
    idempotencyKey: 'loyalty:earn:tenant-1:ticket-001:legacy',
    customerId: '0b8f6c1e-1111-4222-8333-444455556666',
    transactionType: 'earn',
    units: 12,
    ticketId: 'ticket-001',
    terminalId: 'term-1',
    branchId: 'branch-1',
    occurredAt: '2026-01-01T12:00:00.000Z',
    ...overrides,
  };
}

function buildService(
  ledger: unknown,
  resolution: LoyaltyProgramResolution = { programId: null, outcome: 'none' },
) {
  // Round-2 D-1: the constructor now takes the DataSource for the tenant-bound
  // program resolution; the unit tests stub the resolution directly.
  const service = new LoyaltySyncIngestionService(ledger as never, {} as never);
  jest.spyOn(service, 'resolveLoyaltyProgramId').mockResolvedValue(resolution);
  return service;
}

describe('LoyaltySyncIngestionService', () => {
  it('maps a POS point transaction onto the ledger contract with tenant scoping', async () => {
    const ledger = ledgerRecord();
    const service = buildService(ledger);

    const result = await service.ingestPointTransactions('tenant-1', [
      posRecord(),
    ]);

    expect(result.received).toBe(1);
    expect(result.processed).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.results[0]).toMatchObject({
      idempotencyKey: 'loyalty:earn:tenant-1:ticket-001:legacy',
      status: 'ACCEPTED',
    });
    expect(ledger.calls).toHaveLength(1);
    expect(ledger.calls[0].dto).toMatchObject({
      tenantId: 'tenant-1',
      customerId: '0b8f6c1e-1111-4222-8333-444455556666',
      loyaltyProgramId: undefined,
      transactionType: 'earn',
      units: 12,
      ticketId: 'ticket-001',
      terminalId: 'term-1',
      branchId: 'branch-1',
      idempotencyKey: 'loyalty:earn:tenant-1:ticket-001:legacy',
      origin: 'POS',
      occurredAt: new Date('2026-01-01T12:00:00.000Z'),
    });
  });

  it('accepts an idempotent replay (duplicate idempotency key) without failing the batch', async () => {
    const existing = { id: 'existing-tx-1', units: 12 };
    const ledger = ledgerRecord(existing);
    const service = buildService(ledger);

    const record = posRecord();
    const first = await service.ingestPointTransactions('tenant-1', [record]);
    const second = await service.ingestPointTransactions('tenant-1', [record]);

    expect(first.failed).toBe(0);
    expect(second.failed).toBe(0);
    expect(second.results[0].status).toBe('ACCEPTED');
  });

  it('marks an idempotency integrity conflict as a per-record failure and keeps the batch alive', async () => {
    const ledger = ledgerRecord();
    ledger.appendTransaction.mockRejectedValueOnce(
      new ConflictException(
        "Integrity conflict: idempotency key 'k1' already used with different payload",
      ),
    );
    const service = buildService(ledger);

    const result = await service.ingestPointTransactions('tenant-1', [
      posRecord({ idempotencyKey: 'k1' }),
      posRecord({ idempotencyKey: 'k2' }),
    ]);

    expect(result.received).toBe(2);
    expect(result.processed).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.results[0]).toMatchObject({
      idempotencyKey: 'k1',
      status: 'FAILED',
      code: 'IDEMPOTENCY_CONFLICT',
    });
    expect(result.results[1].status).toBe('ACCEPTED');
  });

  it('scopes every record to the caller tenant and defaults origin to POS', async () => {
    const ledger = ledgerRecord();
    const service = buildService(ledger);

    await service.ingestPointTransactions('tenant-9', [
      posRecord({ origin: undefined }),
      posRecord({ origin: 'POS', idempotencyKey: 'k3' }),
    ]);

    expect(ledger.calls.every((call) => call.dto.tenantId === 'tenant-9')).toBe(
      true,
    );
    expect(ledger.calls[0].dto.origin).toBe('POS');
  });

  // Round-2 D-1: the POS pushes redeem/earn rows without a program; the
  // projection used to freeze at its last cloud-written value because every
  // such row took the program-less H2 path.
  describe('program resolution for program-less POS records (round-2 D-1)', () => {
    it('joins the record to the resolved program so the ledger maintains the projection', async () => {
      const ledger = ledgerRecord();
      const service = buildService(ledger, {
        programId: '399fcd4a-af1d-469a-b105-031f6dceb8d7',
        outcome: 'resolved',
      });

      const result = await service.ingestPointTransactions('tenant-1', [
        posRecord(),
      ]);

      expect(result.processed).toBe(1);
      expect(result.failed).toBe(0);
      expect(ledger.calls[0].dto.loyaltyProgramId).toBe(
        '399fcd4a-af1d-469a-b105-031f6dceb8d7',
      );
    });

    it('an explicit program on the record wins over the resolution', async () => {
      const ledger = ledgerRecord();
      const service = buildService(ledger, {
        programId: 'resolved-anyway',
        outcome: 'resolved',
      });

      await service.ingestPointTransactions('tenant-1', [
        posRecord({ loyaltyProgramId: 'program-from-pos' }),
      ]);

      expect(ledger.calls[0].dto.loyaltyProgramId).toBe('program-from-pos');
    });

    it('zero ACTIVE programs keeps the legacy H2 path (program-less, accepted)', async () => {
      const ledger = ledgerRecord();
      const service = buildService(ledger, {
        programId: null,
        outcome: 'none',
      });

      const result = await service.ingestPointTransactions('tenant-1', [
        posRecord(),
      ]);

      expect(result.processed).toBe(1);
      expect(result.failed).toBe(0);
      expect(ledger.calls[0].dto.loyaltyProgramId).toBeUndefined();
    });

    it('an ambiguous tenant FAILS the record instead of deepening the drift', async () => {
      const ledger = ledgerRecord();
      const service = buildService(ledger, {
        programId: null,
        outcome: 'ambiguous',
      });

      const result = await service.ingestPointTransactions('tenant-1', [
        posRecord(),
      ]);

      expect(result.processed).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.results[0]).toMatchObject({
        status: 'FAILED',
        code: 'PROGRAM_UNRESOLVED',
      });
      expect(ledger.calls).toHaveLength(0);
    });
  });
});
