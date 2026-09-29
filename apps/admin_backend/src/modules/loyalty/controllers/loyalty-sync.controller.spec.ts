import { UnauthorizedException } from '@nestjs/common';
import { LoyaltySyncController } from './loyalty-sync.controller';
import { LoyaltyPointTransactionSyncBatchDto } from '../dto/point-transaction-sync.dto';

function ingestServiceRecord() {
  const ingestPointTransactions = jest.fn().mockResolvedValue({
    received: 1,
    processed: 1,
    failed: 0,
    results: [],
  });
  return { ingestPointTransactions };
}

function batchDto(): LoyaltyPointTransactionSyncBatchDto {
  return {
    transactions: [
      {
        idempotencyKey: 'loyalty:earn:tenant-1:ticket-001:legacy',
        customerId: '0b8f6c1e-1111-4222-8333-444455556666',
        transactionType: 'earn',
        units: 12,
      },
    ],
  };
}

describe('LoyaltySyncController (device transport)', () => {
  it('delegates the batch to the ingestion service with the tenant from the transport guard', async () => {
    const ingestion = ingestServiceRecord();
    const controller = new LoyaltySyncController(ingestion as never);

    await controller.syncPointTransactions('tenant-1', batchDto());

    expect(ingestion.ingestPointTransactions).toHaveBeenCalledTimes(1);
    expect(ingestion.ingestPointTransactions).toHaveBeenCalledWith(
      'tenant-1',
      batchDto().transactions,
    );
  });

  it('fails closed when the device principal carries no tenant context', async () => {
    const ingestion = ingestServiceRecord();
    const controller = new LoyaltySyncController(ingestion as never);

    await expect(
      controller.syncPointTransactions(undefined, batchDto()),
    ).rejects.toThrow(UnauthorizedException);
    expect(ingestion.ingestPointTransactions).not.toHaveBeenCalled();
  });

  it('propagates ingestion failures to the transport layer', async () => {
    const ingestion = ingestServiceRecord();
    ingestion.ingestPointTransactions.mockRejectedValue(
      new Error('ledger unavailable'),
    );
    const controller = new LoyaltySyncController(ingestion as never);

    await expect(
      controller.syncPointTransactions('tenant-1', batchDto()),
    ).rejects.toThrow('ledger unavailable');
  });
});
