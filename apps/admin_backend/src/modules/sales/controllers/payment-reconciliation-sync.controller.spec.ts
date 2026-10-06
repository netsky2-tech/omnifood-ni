import { UnauthorizedException } from '@nestjs/common';
import { PaymentReconciliationSyncController } from './payment-reconciliation-sync.controller';
import { PaymentReconciliationSyncBatchDto } from '../dto/payment-reconciliation-sync.dto';

function ingestionServiceStub() {
  const ingestReconciliationBatch = jest.fn().mockResolvedValue({
    received: 1,
    processed: 1,
    failed: 0,
    results: [],
  });
  return { ingestReconciliationBatch };
}

function batchDto(): PaymentReconciliationSyncBatchDto {
  return {
    reconciliations: [
      {
        paymentId: 'pay-001',
        invoiceId: 'inv-001',
        reconciliationStatus: 'CONCILIADO',
        reconciledAt: '2026-01-01T12:30:00.000Z',
        reconciledByUserId: 'user-1',
        voucherCode: 'VCH-123456',
        batchNumber: 'B-001',
        last4: '1234',
      },
    ],
  };
}

describe('PaymentReconciliationSyncController (device transport)', () => {
  it('delegates the batch to the ingestion service with the tenant from the transport guard', async () => {
    const ingestion = ingestionServiceStub();
    const controller = new PaymentReconciliationSyncController(
      ingestion as never,
    );

    await controller.syncPaymentReconciliations('tenant-1', batchDto());

    expect(ingestion.ingestReconciliationBatch).toHaveBeenCalledTimes(1);
    expect(ingestion.ingestReconciliationBatch).toHaveBeenCalledWith(
      'tenant-1',
      { reconciliations: batchDto().reconciliations },
    );
  });

  it('fails closed when the device principal carries no tenant context', async () => {
    const ingestion = ingestionServiceStub();
    const controller = new PaymentReconciliationSyncController(
      ingestion as never,
    );

    await expect(
      controller.syncPaymentReconciliations(undefined, batchDto()),
    ).rejects.toThrow(UnauthorizedException);
    expect(ingestion.ingestReconciliationBatch).not.toHaveBeenCalled();
  });

  it('propagates ingestion failures to the transport layer', async () => {
    const ingestion = ingestionServiceStub();
    ingestion.ingestReconciliationBatch.mockRejectedValue(
      new Error('payment reconciliation store unavailable'),
    );
    const controller = new PaymentReconciliationSyncController(
      ingestion as never,
    );

    await expect(
      controller.syncPaymentReconciliations('tenant-1', batchDto()),
    ).rejects.toThrow('payment reconciliation store unavailable');
  });
});
