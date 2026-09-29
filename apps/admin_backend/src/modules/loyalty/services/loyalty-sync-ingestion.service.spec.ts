import { ConflictException } from '@nestjs/common';
import { LoyaltySyncIngestionService } from './loyalty-sync-ingestion.service';
import type { AppendLoyaltyTxDto } from './loyalty-ledger.service';

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

describe('LoyaltySyncIngestionService', () => {
  it('maps a POS point transaction onto the ledger contract with tenant scoping', async () => {
    const ledger = ledgerRecord();
    const service = new LoyaltySyncIngestionService(ledger as never);

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
    const service = new LoyaltySyncIngestionService(ledger as never);

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
    const service = new LoyaltySyncIngestionService(ledger as never);

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
    const service = new LoyaltySyncIngestionService(ledger as never);

    await service.ingestPointTransactions('tenant-9', [
      posRecord({ origin: undefined }),
      posRecord({ origin: 'POS', idempotencyKey: 'k3' }),
    ]);

    expect(ledger.calls.every((call) => call.dto.tenantId === 'tenant-9')).toBe(
      true,
    );
    expect(ledger.calls[0].dto.origin).toBe('POS');
  });
});
