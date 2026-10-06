import { DataSource } from 'typeorm';
import { PaymentReconciliationSyncIngestionService } from './payment-reconciliation-sync-ingestion.service';
import { Payment } from '../entities/payment.entity';
import type { PaymentReconciliationSyncItemDto } from '../dto/payment-reconciliation-sync.dto';

interface RepoStub {
  findOne: jest.Mock;
  update: jest.Mock;
}

function repoStub(): RepoStub {
  return {
    findOne: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue({}),
  };
}

function makeDataSource(payments: unknown): {
  dataSource: DataSource;
  manager: { query: jest.Mock; getRepository: unknown }; // typed loosely
} {
  const manager = {
    query: jest.fn().mockResolvedValue(undefined),
    getRepository: (entity: unknown) => {
      if (entity === Payment) return payments;
      return undefined;
    },
  };
  const dataSource = {
    transaction: jest.fn(async (cb: (m: unknown) => Promise<unknown>) =>
      cb(manager),
    ),
  } as unknown as DataSource;
  return { dataSource, manager: manager as never };
}

function reconciliation(overrides: Record<string, unknown> = {}) {
  return {
    paymentId: 'pay-001',
    invoiceId: 'inv-001',
    reconciliationStatus: 'CONCILIADO',
    reconciledAt: '2026-01-01T12:30:00.000Z',
    reconciledByUserId: 'user-1',
    voucherCode: 'VCH-123456',
    batchNumber: 'B-001',
    last4: '1234',
    ...overrides,
  } as PaymentReconciliationSyncItemDto;
}

function knownPayment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pay-001',
    invoiceId: 'inv-001',
    method: 'card',
    amount: 1500,
    currency: 'NIO',
    amountNio: 1500,
    changeGiven: 0,
    voucherCode: null,
    reconciliationStatus: 'PENDIENTE',
    batchNumber: null,
    reconciledAt: null,
    reconciledByUserId: null,
    ...overrides,
  };
}

/** The exact reconciliation columns this slice is allowed to write. */
const RECONCILIATION_KEYS = [
  'voucherCode',
  'reconciliationStatus',
  'reconciledAt',
  'reconciledByUserId',
  'batchNumber',
];

describe('PaymentReconciliationSyncIngestionService', () => {
  it('applies a reconciliation to an existing payment, updating only the reconciliation columns', async () => {
    const payments = repoStub();
    payments.findOne.mockResolvedValue(knownPayment());
    const service = new PaymentReconciliationSyncIngestionService(
      makeDataSource(payments).dataSource,
      payments as never,
    );

    const result = await service.ingestReconciliationBatch('tenant-1', {
      reconciliations: [reconciliation()],
    });

    expect(result.received).toBe(1);
    expect(result.processed).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.results[0]).toMatchObject({
      paymentId: 'pay-001',
      status: 'ACCEPTED',
    });
    expect(payments.update).toHaveBeenCalledTimes(1);
    expect(payments.update).toHaveBeenCalledWith(
      { id: 'pay-001' },
      {
        voucherCode: 'VCH-123456',
        reconciliationStatus: 'CONCILIADO',
        reconciledAt: new Date('2026-01-01T12:30:00.000Z'),
        reconciledByUserId: 'user-1',
        batchNumber: 'B-001',
      },
    );
    // Amounts and method are fiscal-snapshot data owned by the sale sync;
    // the reconciliation upsert never touches them.
    const written = payments.update.mock.calls[0][1];
    expect(Object.keys(written).sort()).toEqual(RECONCILIATION_KEYS.sort());
    expect(written).not.toHaveProperty('amount');
    expect(written).not.toHaveProperty('amountNio');
    expect(written).not.toHaveProperty('method');
    expect(written).not.toHaveProperty('currency');
    expect(written).not.toHaveProperty('exchangeRate');
    expect(written).not.toHaveProperty('changeGiven');
  });

  it('is idempotent: a repeated identical batch applies the same values and reports the same outcomes without duplicating rows', async () => {
    const payments = repoStub();
    payments.findOne.mockResolvedValue(knownPayment());
    const service = new PaymentReconciliationSyncIngestionService(
      makeDataSource(payments).dataSource,
      payments as never,
    );
    const batch = { reconciliations: [reconciliation()] };

    const first = await service.ingestReconciliationBatch('tenant-1', batch);
    // The terminal retries the same batch after a lost response.
    const second = await service.ingestReconciliationBatch('tenant-1', batch);

    expect(first.failed).toBe(0);
    expect(second.failed).toBe(0);
    expect(first.results).toEqual(second.results);
    // Upsert by payment id: the existing row is updated in place, never
    // re-inserted, so a replay cannot duplicate rows.
    expect(payments.update).toHaveBeenCalledTimes(2);
    expect(payments.update.mock.calls[0]).toEqual(payments.update.mock.calls[1]);
    // The timestamp is derived from the same payload value both times: no
    // second application shifts reconciled_at.
    expect(payments.update.mock.calls[1][1].reconciledAt).toEqual(
      new Date('2026-01-01T12:30:00.000Z'),
    );
  });

  it('reports an unknown payment id as an explicit per-record failure and writes nothing', async () => {
    const payments = repoStub();
    payments.findOne.mockResolvedValue(null);
    const service = new PaymentReconciliationSyncIngestionService(
      makeDataSource(payments).dataSource,
      payments as never,
    );

    const result = await service.ingestReconciliationBatch('tenant-1', {
      reconciliations: [reconciliation()],
    });

    expect(result.received).toBe(1);
    expect(result.processed).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.results[0]).toMatchObject({
      paymentId: 'pay-001',
      status: 'FAILED',
      code: 'UNKNOWN_PAYMENT',
    });
    // A reconciliation arriving before its sale is never a silent success
    // and never creates a row.
    expect(payments.update).not.toHaveBeenCalled();
  });

  it("fails a record whose invoiceId does not match the payment's invoice and writes nothing", async () => {
    const payments = repoStub();
    payments.findOne.mockResolvedValue(knownPayment({ invoiceId: 'inv-001' }));
    const service = new PaymentReconciliationSyncIngestionService(
      makeDataSource(payments).dataSource,
      payments as never,
    );

    const result = await service.ingestReconciliationBatch('tenant-1', {
      reconciliations: [reconciliation({ invoiceId: 'inv-OTHER' })],
    });

    expect(result.failed).toBe(1);
    expect(result.results[0]).toMatchObject({
      paymentId: 'pay-001',
      status: 'FAILED',
      code: 'INVOICE_MISMATCH',
    });
    expect(payments.update).not.toHaveBeenCalled();
  });

  it('fails a reconciliationStatus outside the allowed domain per record and writes nothing', async () => {
    const payments = repoStub();
    payments.findOne.mockResolvedValue(knownPayment());
    const service = new PaymentReconciliationSyncIngestionService(
      makeDataSource(payments).dataSource,
      payments as never,
    );

    const result = await service.ingestReconciliationBatch('tenant-1', {
      reconciliations: [
        reconciliation({ paymentId: 'pay-bad', reconciliationStatus: 'OK' }),
      ],
    });

    expect(result.failed).toBe(1);
    expect(result.results[0]).toMatchObject({
      paymentId: 'pay-bad',
      status: 'FAILED',
      code: 'INVALID_STATUS',
    });
    expect(payments.update).not.toHaveBeenCalled();
  });

  it('isolates one bad record and still applies the rest of the batch', async () => {
    const payments = repoStub();
    payments.findOne.mockImplementation(({ where }) =>
      Promise.resolve(
        where.id === 'pay-002'
          ? knownPayment({ id: 'pay-002', invoiceId: 'inv-002' })
          : where.id === 'pay-003'
            ? knownPayment({ id: 'pay-003', invoiceId: 'inv-003' })
            : knownPayment({ id: 'pay-001', invoiceId: 'inv-001' }),
      ),
    );
    const service = new PaymentReconciliationSyncIngestionService(
      makeDataSource(payments).dataSource,
      payments as never,
    );

    const result = await service.ingestReconciliationBatch('tenant-1', {
      reconciliations: [
        reconciliation({
          paymentId: 'pay-001',
          invoiceId: 'inv-001',
          voucherCode: 'VCH-A',
        }),
        // Bad neighbor: status outside the domain.
        reconciliation({
          paymentId: 'pay-002',
          invoiceId: 'inv-002',
          reconciliationStatus: 'REVISADO',
        }),
        reconciliation({
          paymentId: 'pay-003',
          invoiceId: 'inv-003',
          voucherCode: 'VCH-C',
          reconciliationStatus: 'MANUAL_OVERRIDE',
        }),
      ],
    });

    expect(result.received).toBe(3);
    expect(result.processed).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.results[0]).toMatchObject({
      paymentId: 'pay-001',
      status: 'ACCEPTED',
    });
    expect(result.results[1]).toMatchObject({
      paymentId: 'pay-002',
      status: 'FAILED',
      code: 'INVALID_STATUS',
    });
    expect(result.results[2]).toMatchObject({
      paymentId: 'pay-003',
      status: 'ACCEPTED',
    });
    // Only the two valid records touch the cloud table.
    expect(payments.update).toHaveBeenCalledTimes(2);
    expect(payments.update.mock.calls[0][0]).toEqual({ id: 'pay-001' });
    expect(payments.update.mock.calls[1][0]).toEqual({ id: 'pay-003' });
  });

  it('scopes ingestion to the caller tenant: a payment owned by another tenant is invisible, so the record fails instead of updating', async () => {
    const payments = repoStub();
    // Under the tenant-bound transaction (RLS context), a row persisted by
    // tenant-OTHER is not visible to tenant-1's queries: findOne sees null.
    payments.findOne.mockImplementation(({ where }) =>
      Promise.resolve(
        where.id === 'pay-foreign'
          ? null
          : knownPayment({ id: where.id, invoiceId: 'inv-own' }),
      ),
    );
    const service = new PaymentReconciliationSyncIngestionService(
      makeDataSource(payments).dataSource,
      payments as never,
    );

    const result = await service.ingestReconciliationBatch('tenant-1', {
      reconciliations: [
        reconciliation({ paymentId: 'pay-foreign', invoiceId: 'inv-foreign' }),
        reconciliation({ paymentId: 'pay-own', invoiceId: 'inv-own' }),
      ],
    });

    expect(result.results[0]).toMatchObject({
      paymentId: 'pay-foreign',
      status: 'FAILED',
      code: 'UNKNOWN_PAYMENT',
    });
    expect(result.results[1]).toMatchObject({
      paymentId: 'pay-own',
      status: 'ACCEPTED',
    });
    // The other tenant's row is never updated and every transaction binds
    // exactly the caller tenant.
    expect(payments.update).toHaveBeenCalledTimes(1);
    expect(payments.update).toHaveBeenCalledWith(
      { id: 'pay-own' },
      expect.objectContaining({ reconciledByUserId: 'user-1' }),
    );
  });

  it('binds the transaction-local tenant context to the caller tenant', async () => {
    const payments = repoStub();
    payments.findOne.mockResolvedValue(knownPayment());
    const { dataSource, manager } = makeDataSource(payments);
    const service = new PaymentReconciliationSyncIngestionService(
      dataSource,
      payments as never,
    );

    await service.ingestReconciliationBatch('tenant-1', {
      reconciliations: [reconciliation()],
    });

    // The tenant context is bound exactly once per transaction, to the
    // caller tenant, via transaction-local set_config.
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(manager.query).toHaveBeenCalledWith(
      "SELECT set_config('app.tenant_id', $1, true)",
      ['tenant-1'],
    );
  });
});
