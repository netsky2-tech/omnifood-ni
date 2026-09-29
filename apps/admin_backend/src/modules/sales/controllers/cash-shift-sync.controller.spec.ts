import { UnauthorizedException } from '@nestjs/common';
import { CashShiftSyncController } from './cash-shift-sync.controller';
import { CashShiftSyncBatchDto } from '../dto/cash-shift-sync.dto';

function ingestionServiceStub() {
  const ingestCashShiftBatch = jest.fn().mockResolvedValue({
    received: 2,
    processed: 2,
    failed: 0,
    results: [],
  });
  return { ingestCashShiftBatch };
}

function batchDto(): CashShiftSyncBatchDto {
  return {
    sessions: [
      {
        id: 'shift-001',
        terminalId: 'term-1',
        cashierId: 'user-1',
        openedAt: '2026-01-01T12:00:00.000Z',
        status: 'OPEN',
      },
    ],
    movements: [
      {
        id: 'cmv-001',
        shiftId: 'shift-001',
        terminalId: 'term-1',
        type: 'CASH_IN',
        reason: 'Fondo de cambio',
        timestamp: '2026-01-01T12:05:00.000Z',
      },
    ],
  };
}

describe('CashShiftSyncController (device transport)', () => {
  it('delegates the batch to the ingestion service with the tenant from the transport guard', async () => {
    const ingestion = ingestionServiceStub();
    const controller = new CashShiftSyncController(ingestion as never);

    await controller.syncCashShifts('tenant-1', batchDto());

    expect(ingestion.ingestCashShiftBatch).toHaveBeenCalledTimes(1);
    expect(ingestion.ingestCashShiftBatch).toHaveBeenCalledWith('tenant-1', {
      sessions: batchDto().sessions,
      movements: batchDto().movements,
    });
  });

  it('fails closed when the device principal carries no tenant context', async () => {
    const ingestion = ingestionServiceStub();
    const controller = new CashShiftSyncController(ingestion as never);

    await expect(
      controller.syncCashShifts(undefined, batchDto()),
    ).rejects.toThrow(UnauthorizedException);
    expect(ingestion.ingestCashShiftBatch).not.toHaveBeenCalled();
  });

  it('propagates ingestion failures to the transport layer', async () => {
    const ingestion = ingestionServiceStub();
    ingestion.ingestCashShiftBatch.mockRejectedValue(
      new Error('cash shift store unavailable'),
    );
    const controller = new CashShiftSyncController(ingestion as never);

    await expect(
      controller.syncCashShifts('tenant-1', batchDto()),
    ).rejects.toThrow('cash shift store unavailable');
  });
});
