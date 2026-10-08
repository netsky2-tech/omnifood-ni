import { Test, TestingModule } from '@nestjs/testing';
import { CustomerSyncController } from './customer-sync.controller';
import { CustomerSyncIngestionService } from '../services/customer-sync-ingestion.service';
import { UnauthorizedException } from '@nestjs/common';
import { SyncTransportGuard } from '../../identity/guards/sync-transport.guard';

describe('CustomerSyncController', () => {
  let controller: CustomerSyncController;
  let ingestionService: { ingestCustomerBatch: jest.Mock };

  beforeEach(async () => {
    ingestionService = {
      ingestCustomerBatch: jest.fn().mockResolvedValue({
        results: [{ id: 'cust-1', status: 'ACCEPTED' }],
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CustomerSyncController],
      providers: [
        {
          provide: CustomerSyncIngestionService,
          useValue: ingestionService,
        },
      ],
    })
      .overrideGuard(SyncTransportGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CustomerSyncController>(CustomerSyncController);
  });

  it('delegates valid batch to ingestion service with trimmed tenantId', async () => {
    const dto = {
      customers: [
        {
          id: 'cust-1',
          name: 'Cliente Prueba',
        },
      ],
    };

    const response = await controller.syncCustomers(' tenant-123 ', dto);

    expect(ingestionService.ingestCustomerBatch).toHaveBeenCalledWith(
      'tenant-123',
      dto,
    );
    expect(response).toEqual({
      results: [{ id: 'cust-1', status: 'ACCEPTED' }],
    });
  });

  it('throws UnauthorizedException when tenantId is missing or empty', async () => {
    await expect(
      controller.syncCustomers('', { customers: [] }),
    ).rejects.toThrow(UnauthorizedException);

    await expect(
      controller.syncCustomers(undefined, { customers: [] }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
