import { Test, TestingModule } from '@nestjs/testing';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { SyncBatchController } from './sync-batch.controller';
import { SyncCreditNoteAuthGuard } from '../guards/sync-credit-note-auth.guard';
import { InvoicesService } from '../services/invoices.service';

describe('SyncBatchController', () => {
  let controller: SyncBatchController;
  const invoicesService = {
    syncBatch: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SyncBatchController],
      providers: [
        { provide: InvoicesService, useValue: invoicesService },
        { provide: AuthGuard, useValue: { canActivate: jest.fn() } },
        { provide: SyncCreditNoteAuthGuard, useValue: { canActivate: jest.fn() } },
      ],
    }).compile();

    controller = module.get<SyncBatchController>(SyncBatchController);
    jest.clearAllMocks();
  });

  it('delegates envelope to service', async () => {
    invoicesService.syncBatch.mockResolvedValue({
      received: 1,
      processed: 1,
      duplicates: 0,
    });

    const response = await controller.syncBatch('tenant-1', {
      records: [
        {
          idempotencyKey: 'k1',
          sourceDeviceId: 'd1',
          sourceSequence: 1,
          documentType: 'SALE',
          invoice: {
            id: 'inv-1',
            number: '001',
            createdAt: new Date().toISOString(),
            userId: 'u1',
            subtotal: 10,
            totalTax: 1.5,
            total: 11.5,
            paymentStatus: 'PAID',
            items: [],
            payments: [],
          },
        },
      ],
    });

    expect(invoicesService.syncBatch).toHaveBeenCalledWith(
      'tenant-1',
      expect.any(Array),
    );
    expect(response).toEqual({
      status: 'success',
      received: 1,
      processed: 1,
      duplicates: 0,
    });
  });

  it('returns the deterministic per-record envelope for mixed outcomes without throwing a whole-batch error', async () => {
    invoicesService.syncBatch.mockResolvedValue({
      received: 3,
      processed: 1,
      duplicates: 0,
      results: [
        {
          idempotencyKey: 'ok-1',
          terminalId: 'd1',
          flowType: 'inventory',
          sourceSequence: 1,
          status: 'ACCEPTED',
          retryable: false,
          code: 'APPLIED',
        },
        {
          idempotencyKey: 'future-3',
          terminalId: 'd1',
          flowType: 'inventory',
          sourceSequence: 3,
          status: 'STAGED_FUTURE',
          retryable: true,
          code: 'WAITING_FOR_SEQUENCE_2',
        },
        {
          idempotencyKey: 'bad-2',
          terminalId: 'd1',
          flowType: 'inventory',
          sourceSequence: 2,
          status: 'REJECTED',
          retryable: true,
          code: 'BUSINESS_RULE_VALIDATION',
        },
      ],
    });

    await expect(
      controller.syncBatch('tenant-1', { records: [] }),
    ).resolves.toEqual({
      status: 'success',
      received: 3,
      processed: 1,
      duplicates: 0,
      results: [
        expect.objectContaining({ status: 'ACCEPTED', code: 'APPLIED' }),
        expect.objectContaining({
          status: 'STAGED_FUTURE',
          retryable: true,
        }),
        expect.objectContaining({ status: 'REJECTED', retryable: true }),
      ],
    });
  });
});
