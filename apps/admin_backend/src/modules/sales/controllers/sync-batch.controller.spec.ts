import { Test, TestingModule } from '@nestjs/testing';
import { SyncBatchController } from './sync-batch.controller';
import { InvoicesService } from '../services/invoices.service';

describe('SyncBatchController', () => {
  let controller: SyncBatchController;
  const invoicesService = {
    syncBatch: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SyncBatchController],
      providers: [{ provide: InvoicesService, useValue: invoicesService }],
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
});
