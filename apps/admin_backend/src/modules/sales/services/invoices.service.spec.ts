import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { InvoicesService } from './invoices.service';
import { Invoice } from '../entities/invoice.entity';
import { InvoiceItem } from '../entities/invoice-item.entity';
import { Payment } from '../entities/payment.entity';
import { SyncInvoiceDto } from '../dto/sync-invoice.dto';

describe('InvoicesService', () => {
  let service: InvoicesService;
  let invoiceRepo: any;
  let itemRepo: any;
  let paymentRepo: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoicesService,
        {
          provide: getRepositoryToken(Invoice),
          useValue: {
            upsert: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(InvoiceItem),
          useValue: {
            upsert: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Payment),
          useValue: {
            upsert: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<InvoicesService>(InvoicesService);
    invoiceRepo = module.get(getRepositoryToken(Invoice));
    itemRepo = module.get(getRepositoryToken(InvoiceItem));
    paymentRepo = module.get(getRepositoryToken(Payment));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('syncInvoices', () => {
    it('should reconcile child entities for existing invoices using upsert', async () => {
      const tenantId = 'tenant-1';
      const dto: SyncInvoiceDto = {
        id: 'inv-1',
        number: '001',
        createdAt: new Date().toISOString(),
        userId: 'user-1',
        subtotal: 100,
        totalTax: 15,
        total: 115,
        paymentStatus: 'PAID',
        items: [
          {
            id: 'item-1',
            productId: 'prod-1',
            productName: 'Product 1',
            quantity: 1,
            unitPrice: 100,
            originalTaxRate: 0.15,
            appliedTaxRate: 0.15,
            taxAmount: 15,
            total: 115,
            discount: 0,
          },
        ],
        payments: [
          {
            id: 'pay-1',
            method: 'CASH',
            amount: 115,
            currency: 'NIO',
            exchangeRate: 1,
          },
        ],
      };

      await service.syncInvoices(tenantId, [dto]);

      expect(invoiceRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'inv-1' }),
        ['id'],
      );
      expect(itemRepo.upsert).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ id: 'item-1' })]),
        ['id'],
      );
      expect(paymentRepo.upsert).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ id: 'pay-1' })]),
        ['id'],
      );
    });
  });
});
