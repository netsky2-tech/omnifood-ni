import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { InvoicesService } from './invoices.service';
import { Invoice } from '../entities/invoice.entity';
import { InvoiceItem } from '../entities/invoice-item.entity';
import { Payment } from '../entities/payment.entity';
import { SyncInvoiceDto } from '../dto/sync-invoice.dto';
import {
  InventoryMovement,
  MovementType,
} from '../../inventory/entities/inventory-movement.entity';
import { InventorySyncReceipt } from '../../inventory/entities/inventory-sync-receipt.entity';
import { RecipeService } from '../../inventory/recipe.service';
import { BomExplosionService } from '../../inventory/bom-explosion.service';
import { DataSource } from 'typeorm';
import { NEGATIVE_STOCK_POLICY } from '../../inventory/entities/insumo.entity';

describe('InvoicesService', () => {
  let service: InvoicesService;
  let invoiceRepo: { upsert: jest.Mock; find?: jest.Mock };
  let itemRepo: { upsert: jest.Mock; find: jest.Mock };
  let paymentRepo: { upsert: jest.Mock; find?: jest.Mock };
  let movementRepo: {
    create: jest.Mock;
    save: jest.Mock;
    manager: { findOne: jest.Mock; save: jest.Mock };
  };
  let receiptRepo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let recipeService: { findActiveVersion: jest.Mock; getSnapshot: jest.Mock };
  let bomExplosionService: { explode: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let txManager: {
    save: jest.Mock<Promise<unknown>, unknown[]>;
    getRepository: jest.Mock;
    createQueryBuilder: jest.Mock<
      {
        setLock: jest.Mock;
        where: jest.Mock;
        andWhere: jest.Mock;
        getOne: jest.Mock<Promise<unknown>, unknown[]>;
      },
      unknown[]
    >;
    findOne: jest.Mock<Promise<unknown>, unknown[]>;
  };

  beforeEach(async () => {
    invoiceRepo = { upsert: jest.fn(), find: jest.fn().mockResolvedValue([]) };
    itemRepo = { upsert: jest.fn(), find: jest.fn().mockResolvedValue([]) };
    paymentRepo = { upsert: jest.fn(), find: jest.fn().mockResolvedValue([]) };
    movementRepo = {
      create: jest.fn((x: unknown) => x),
      save: jest.fn(),
      manager: { findOne: jest.fn(), save: jest.fn() },
    };
    receiptRepo = {
      findOne: jest.fn(),
      create: jest.fn((x: unknown) => x),
      save: jest.fn(),
    };
    recipeService = {
      findActiveVersion: jest.fn(),
      getSnapshot: jest.fn(),
    };
    bomExplosionService = { explode: jest.fn() };
    const qb = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
    };
    txManager = {
      save: jest.fn<Promise<unknown>, unknown[]>(),
      // By default, return the injected (standalone) repositories so the
      // existing syncBatch tests that assert on `invoiceRepo.upsert` keep
      // working. Individual tests override this to return distinct
      // tx-scoped mocks when they need to prove that persistence is
      // routed through the transaction manager.
      getRepository: jest.fn((target: unknown) => {
        if (target === Invoice) return invoiceRepo;
        if (target === InvoiceItem) return itemRepo;
        if (target === Payment) return paymentRepo;
        return undefined;
      }),
      createQueryBuilder: jest
        .fn<
          {
            setLock: jest.Mock;
            where: jest.Mock;
            andWhere: jest.Mock;
            getOne: jest.Mock<Promise<unknown>, unknown[]>;
          },
          unknown[]
        >()
        .mockReturnValue(qb),
      findOne: jest.fn<Promise<unknown>, unknown[]>(),
    };
    dataSource = {
      transaction: jest
        .fn()
        .mockImplementation(
          async (_iso: unknown, cb: (m: unknown) => Promise<unknown>) =>
            cb(txManager),
        ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoicesService,
        {
          provide: DataSource,
          useValue: dataSource,
        },
        {
          provide: getRepositoryToken(Invoice),
          useValue: invoiceRepo,
        },
        {
          provide: getRepositoryToken(InvoiceItem),
          useValue: itemRepo,
        },
        {
          provide: getRepositoryToken(Payment),
          useValue: paymentRepo,
        },
        {
          provide: getRepositoryToken(InventoryMovement),
          useValue: movementRepo,
        },
        {
          provide: getRepositoryToken(InventorySyncReceipt),
          useValue: receiptRepo,
        },
        {
          provide: RecipeService,
          useValue: recipeService,
        },
        {
          provide: BomExplosionService,
          useValue: bomExplosionService,
        },
      ],
    }).compile();

    service = module.get<InvoicesService>(InvoicesService);
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

    it('persists per-line recipeVersionId in InvoiceItem and does not drop it', async () => {
      const tenantId = 'tenant-1';
      recipeService.getSnapshot.mockResolvedValue({
        recipeVersion: { id: 'rv-burger-v3', product_id: 'prod-burger' },
        components: [],
      });
      const dto: SyncInvoiceDto = {
        id: 'inv-recipe',
        number: '002',
        createdAt: new Date().toISOString(),
        userId: 'user-1',
        subtotal: 200,
        totalTax: 30,
        total: 230,
        paymentStatus: 'PAID',
        items: [
          {
            id: 'item-burger',
            productId: 'prod-burger',
            productName: 'Burger',
            quantity: 2,
            unitPrice: 100,
            originalTaxRate: 0.15,
            appliedTaxRate: 0.15,
            taxAmount: 30,
            total: 230,
            discount: 0,
            recipeVersionId: 'rv-burger-v3',
          },
          {
            id: 'item-salad',
            productId: 'prod-salad',
            productName: 'Salad',
            quantity: 1,
            unitPrice: 50,
            originalTaxRate: 0.15,
            appliedTaxRate: 0.15,
            taxAmount: 7.5,
            total: 57.5,
            discount: 0,
            // No recipeVersionId for non-prepared product — must stay undefined
          },
        ],
        payments: [],
      };

      await service.syncInvoices(tenantId, [dto]);

      expect(recipeService.getSnapshot).toHaveBeenCalledWith(
        'rv-burger-v3',
        'tenant-1',
        'prod-burger',
      );

      // Each line must carry its own recipeVersionId (per-line, not document)
      expect(itemRepo.upsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'item-burger',
            recipeVersionId: 'rv-burger-v3',
          }),
        ]),
        ['id'],
      );
      // The salad line must not inherit the burger's version
      const [[upsertCall]] = itemRepo.upsert.mock.calls as [
        [Array<Record<string, unknown>>, string[]],
      ];
      const saladLine = upsertCall.find((r) => r['id'] === 'item-salad');
      expect(saladLine).toBeDefined();
      expect(saladLine?.['recipeVersionId']).toBeUndefined();
    });

    it('rejects per-line recipeVersionId that belongs to another product before persisting', async () => {
      const tenantId = 'tenant-1';
      recipeService.getSnapshot.mockRejectedValue(
        new Error(
          'Recipe version rv-other does not belong to product prod-burger',
        ),
      );
      const dto: SyncInvoiceDto = {
        id: 'inv-recipe-mismatch',
        number: '003',
        createdAt: new Date().toISOString(),
        userId: 'user-1',
        subtotal: 100,
        totalTax: 15,
        total: 115,
        paymentStatus: 'PAID',
        items: [
          {
            id: 'item-burger',
            productId: 'prod-burger',
            productName: 'Burger',
            quantity: 1,
            unitPrice: 100,
            originalTaxRate: 0.15,
            appliedTaxRate: 0.15,
            taxAmount: 15,
            total: 115,
            discount: 0,
            recipeVersionId: 'rv-other',
          },
        ],
        payments: [],
      };

      await expect(service.syncInvoices(tenantId, [dto])).rejects.toThrow(
        'does not belong to product prod-burger',
      );
      expect(invoiceRepo.upsert).not.toHaveBeenCalled();
      expect(itemRepo.upsert).not.toHaveBeenCalled();
    });

    it('stamps tenant_id on persisted invoice items for tenant isolation', async () => {
      const tenantId = 'tenant-1';
      recipeService.getSnapshot.mockResolvedValue({
        recipeVersion: { id: 'rv-burger-v3', product_id: 'prod-burger' },
        components: [],
      });
      const dto: SyncInvoiceDto = {
        id: 'inv-tenant-stamp',
        number: '010',
        createdAt: new Date().toISOString(),
        userId: 'user-1',
        subtotal: 100,
        totalTax: 15,
        total: 115,
        paymentStatus: 'PAID',
        items: [
          {
            id: 'item-tenant-1',
            productId: 'prod-burger',
            productName: 'Burger',
            quantity: 1,
            unitPrice: 100,
            originalTaxRate: 0.15,
            appliedTaxRate: 0.15,
            taxAmount: 15,
            total: 115,
            discount: 0,
            recipeVersionId: 'rv-burger-v3',
          },
        ],
        payments: [],
      };

      await service.syncInvoices(tenantId, [dto]);

      // Each persisted line must carry the resolved tenant_id so the
      // invoice_items row is bound to the tenant that owns the sale.
      expect(itemRepo.upsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'item-tenant-1',
            invoiceId: 'inv-tenant-stamp',
            tenant_id: tenantId,
            recipeVersionId: 'rv-burger-v3',
          }),
        ]),
        ['id'],
      );
      // The invoice itself is stamped with the tenant_id too.
      expect(invoiceRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'inv-tenant-stamp',
          tenant_id: tenantId,
        }),
        ['id'],
      );
    });

    it('rejects cross-tenant item id collision before persisting any invoice/item', async () => {
      // Tenant-A retransmits an item id that already belongs to tenant-B.
      // The ownership check must reject the sync before any upsert runs,
      // preventing cross-tenant overwrite via the client-controlled id.
      const tenantId = 'tenant-A';
      recipeService.getSnapshot.mockResolvedValue({
        recipeVersion: { id: 'rv-x', product_id: 'prod-burger' },
        components: [],
      });
      itemRepo.find.mockResolvedValueOnce([
        { id: 'item-collide', tenant_id: 'tenant-B' },
      ]);
      const dto: SyncInvoiceDto = {
        id: 'inv-collide',
        number: '011',
        createdAt: new Date().toISOString(),
        userId: 'user-1',
        subtotal: 100,
        totalTax: 15,
        total: 115,
        paymentStatus: 'PAID',
        items: [
          {
            id: 'item-collide',
            productId: 'prod-burger',
            productName: 'Burger',
            quantity: 1,
            unitPrice: 100,
            originalTaxRate: 0.15,
            appliedTaxRate: 0.15,
            taxAmount: 15,
            total: 115,
            discount: 0,
            recipeVersionId: 'rv-x',
          },
        ],
        payments: [],
      };

      await expect(service.syncInvoices(tenantId, [dto])).rejects.toThrow(
        'already belongs to another tenant',
      );

      expect(invoiceRepo.upsert).not.toHaveBeenCalled();
      expect(itemRepo.upsert).not.toHaveBeenCalled();
    });
  });

  describe('syncBatch', () => {
    const baseInvoice: SyncInvoiceDto = {
      id: 'inv-1',
      number: '001',
      createdAt: new Date().toISOString(),
      userId: 'u-1',
      subtotal: 10,
      totalTax: 1.5,
      total: 11.5,
      paymentStatus: 'PAID',
      items: [
        {
          id: 'item-1',
          productId: 'prod-1',
          productName: 'P1',
          quantity: 2,
          unitPrice: 5,
          originalTaxRate: 0.15,
          appliedTaxRate: 0.15,
          taxAmount: 1.5,
          total: 11.5,
          discount: 0,
        },
      ],
      payments: [],
    };

    it('processes batch in sourceSequence order and appends SALE movements', async () => {
      receiptRepo.findOne.mockResolvedValue(null);
      recipeService.findActiveVersion.mockResolvedValue(null);
      txManager.createQueryBuilder().getOne.mockResolvedValue({
        stock: 10,
        averageCost: 2,
        id: 'ins-1',
        tenant_id: 'tenant-1',
      });
      txManager.findOne.mockResolvedValue({ id: '2001' });

      await service.syncBatch('tenant-1', [
        {
          idempotencyKey: 'k2',
          sourceDeviceId: 'd1',
          sourceSequence: 2,
          documentType: 'SALE',
          invoice: { ...baseInvoice, id: 'inv-2' },
        },
        {
          idempotencyKey: 'k1',
          sourceDeviceId: 'd1',
          sourceSequence: 1,
          documentType: 'SALE',
          invoice: baseInvoice,
        },
      ]);

      expect(invoiceRepo.upsert).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ id: 'inv-1' }),
        ['id'],
      );
      expect(invoiceRepo.upsert).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ id: 'inv-2' }),
        ['id'],
      );
      expect(movementRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: MovementType.SALE }),
      );
    });

    it('skips duplicate records by idempotencyKey/sourceSequence', async () => {
      receiptRepo.findOne
        .mockResolvedValueOnce({ id: 'r-existing' })
        .mockResolvedValueOnce(null);

      const result = await service.syncBatch('tenant-1', [
        {
          idempotencyKey: 'dup',
          sourceDeviceId: 'd1',
          sourceSequence: 1,
          documentType: 'SALE',
          invoice: baseInvoice,
        },
      ]);

      expect(result).toEqual({ received: 1, processed: 0, duplicates: 1 });
      expect(invoiceRepo.upsert).not.toHaveBeenCalled();
    });

    it('appends SALE_CANCEL reversal movement without invoice deletion', async () => {
      receiptRepo.findOne.mockResolvedValue(null);
      recipeService.findActiveVersion.mockResolvedValue(null);
      txManager.createQueryBuilder().getOne.mockResolvedValue({
        id: 'ins-1',
        stock: 10,
        averageCost: 2,
        tenant_id: 'tenant-1',
      });
      txManager.findOne.mockResolvedValue({ id: '2001' });

      await service.syncBatch('tenant-1', [
        {
          idempotencyKey: 'cancel-1',
          sourceDeviceId: 'd1',
          sourceSequence: 10,
          documentType: 'SALE_CANCEL',
          invoice: { ...baseInvoice, isCanceled: true },
        },
      ]);

      expect(movementRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MovementType.SALE_CANCEL,
          quantity: 2,
          compensationForKardexId: '2001',
        }),
      );
      expect(invoiceRepo.upsert).toHaveBeenCalled();
    });

    it('explodes FOH product movements into BOM insumo movements when active recipe exists', async () => {
      receiptRepo.findOne.mockResolvedValue(null);
      recipeService.findActiveVersion.mockResolvedValue({ id: 'rv-1' });
      recipeService.getSnapshot.mockResolvedValue({
        recipeVersion: { id: 'rv-1' },
        components: [{ insumo_id: 'ins-1', quantity: 2 }],
      });
      bomExplosionService.explode.mockReturnValue(
        new Map<string, number>([
          ['ins-1', 4],
          ['ins-2', 1.5],
        ]),
      );

      txManager
        .createQueryBuilder()
        .getOne.mockResolvedValueOnce({
          id: 'ins-1',
          stock: 20,
          averageCost: 3,
          tenant_id: 'tenant-1',
        })
        .mockResolvedValueOnce({
          id: 'ins-2',
          stock: 15,
          averageCost: 2,
          tenant_id: 'tenant-1',
        });

      await service.syncBatch('tenant-1', [
        {
          idempotencyKey: 'bom-1',
          sourceDeviceId: 'd1',
          sourceSequence: 3,
          documentType: 'SALE',
          invoice: baseInvoice,
        },
      ]);

      expect(recipeService.findActiveVersion).toHaveBeenCalledWith(
        'tenant-1',
        'prod-1',
      );
      expect(recipeService.getSnapshot).toHaveBeenCalledWith(
        'rv-1',
        'tenant-1',
        'prod-1',
      );
      expect(bomExplosionService.explode).toHaveBeenCalled();
      expect(movementRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ insumoId: 'ins-1', quantity: -4 }),
      );
      expect(movementRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ insumoId: 'ins-2', quantity: -1.5 }),
      );
    });

    it('binds historical recipeVersionId from FOH sync payload when provided', async () => {
      receiptRepo.findOne.mockResolvedValue(null);
      recipeService.getSnapshot.mockResolvedValue({
        recipeVersion: { id: 'rv-historical' },
        components: [{ insumo_id: 'ins-1', quantity: 1 }],
      });
      bomExplosionService.explode.mockReturnValue(
        new Map<string, number>([['ins-1', 2]]),
      );
      txManager.createQueryBuilder().getOne.mockResolvedValue({
        id: 'ins-1',
        stock: 10,
        averageCost: 2,
        negativeStockPolicy: NEGATIVE_STOCK_POLICY.RESTRICT,
        tenant_id: 'tenant-1',
      });

      await service.syncBatch('tenant-1', [
        {
          idempotencyKey: 'history-1',
          sourceDeviceId: 'd1',
          sourceSequence: 5,
          documentType: 'SALE',
          recipeVersionId: 'rv-historical',
          invoice: baseInvoice,
        },
      ]);

      expect(recipeService.findActiveVersion).not.toHaveBeenCalled();
      expect(recipeService.getSnapshot).toHaveBeenCalledWith(
        'rv-historical',
        'tenant-1',
        'prod-1',
      );
    });

    it('prefers per-line recipeVersionId over record-level for BOM explosion', async () => {
      receiptRepo.findOne.mockResolvedValue(null);
      recipeService.getSnapshot.mockResolvedValue({
        recipeVersion: { id: 'rv-line-specific' },
        components: [{ insumo_id: 'ins-1', quantity: 1 }],
      });
      bomExplosionService.explode.mockReturnValue(
        new Map<string, number>([['ins-1', 2]]),
      );
      txManager.createQueryBuilder().getOne.mockResolvedValue({
        id: 'ins-1',
        stock: 10,
        averageCost: 2,
        negativeStockPolicy: NEGATIVE_STOCK_POLICY.RESTRICT,
        tenant_id: 'tenant-1',
      });

      await service.syncBatch('tenant-1', [
        {
          idempotencyKey: 'per-line-1',
          sourceDeviceId: 'd1',
          sourceSequence: 11,
          documentType: 'SALE',
          // Record-level version that must NOT win over the line-level one
          recipeVersionId: 'rv-record-level',
          invoice: {
            ...baseInvoice,
            items: [
              {
                ...baseInvoice.items[0],
                // Per-line version takes precedence
                recipeVersionId: 'rv-line-specific',
              },
            ],
          },
        },
      ]);

      // The line-specific version must be used, not the record-level one
      expect(recipeService.getSnapshot).toHaveBeenCalledWith(
        'rv-line-specific',
        'tenant-1',
        'prod-1',
      );
      expect(recipeService.getSnapshot).not.toHaveBeenCalledWith(
        'rv-record-level',
        'tenant-1',
        'prod-1',
      );
    });

    it('rejects record-level recipeVersionId mismatch before persisting the invoice', async () => {
      receiptRepo.findOne.mockResolvedValue(null);
      recipeService.getSnapshot.mockRejectedValue(
        new Error(
          'Recipe version rv-record-level does not belong to product prod-1',
        ),
      );

      await expect(
        service.syncBatch('tenant-1', [
          {
            idempotencyKey: 'record-mismatch-1',
            sourceDeviceId: 'd1',
            sourceSequence: 12,
            documentType: 'SALE',
            recipeVersionId: 'rv-record-level',
            invoice: baseInvoice,
          },
        ]),
      ).rejects.toThrow('does not belong to product prod-1');

      expect(invoiceRepo.upsert).not.toHaveBeenCalled();
      expect(itemRepo.upsert).not.toHaveBeenCalled();
    });

    it('falls back to active recipe when historical recipeVersionId is absent', async () => {
      receiptRepo.findOne.mockResolvedValue(null);
      recipeService.findActiveVersion.mockResolvedValue({ id: 'rv-active' });
      recipeService.getSnapshot.mockResolvedValue({
        recipeVersion: { id: 'rv-active' },
        components: [{ insumo_id: 'ins-1', quantity: 1 }],
      });
      bomExplosionService.explode.mockReturnValue(
        new Map<string, number>([['ins-1', 2]]),
      );
      txManager.createQueryBuilder().getOne.mockResolvedValue({
        id: 'ins-1',
        stock: 10,
        averageCost: 2,
        negativeStockPolicy: NEGATIVE_STOCK_POLICY.RESTRICT,
        tenant_id: 'tenant-1',
      });

      await service.syncBatch('tenant-1', [
        {
          idempotencyKey: 'fallback-1',
          sourceDeviceId: 'd1',
          sourceSequence: 6,
          documentType: 'SALE',
          invoice: baseInvoice,
        },
      ]);

      expect(recipeService.findActiveVersion).toHaveBeenCalledWith(
        'tenant-1',
        'prod-1',
      );
      expect(recipeService.getSnapshot).toHaveBeenCalledWith(
        'rv-active',
        'tenant-1',
        'prod-1',
      );
    });

    it('allows temporary negative stock when insumo policy permits it', async () => {
      receiptRepo.findOne.mockResolvedValue(null);
      recipeService.findActiveVersion.mockResolvedValue(null);
      txManager.createQueryBuilder().getOne.mockResolvedValue({
        id: 'prod-1',
        stock: 0,
        averageCost: 3.25,
        negativeStockPolicy: NEGATIVE_STOCK_POLICY.ALLOW_TEMPORARY,
        tenant_id: 'tenant-1',
      });

      await service.syncBatch('tenant-1', [
        {
          idempotencyKey: 'neg-allow-1',
          sourceDeviceId: 'd1',
          sourceSequence: 7,
          documentType: 'SALE',
          invoice: {
            ...baseInvoice,
            items: [{ ...baseInvoice.items[0], quantity: 1.5 }],
          },
        },
      ]);

      expect(movementRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MovementType.SALE,
          quantity: -1.5,
          newStock: -1.5,
          unitCostNio: 3.25,
        }),
      );
    });

    it('rejects negative stock when insumo policy is restricted', async () => {
      receiptRepo.findOne.mockResolvedValue(null);
      recipeService.findActiveVersion.mockResolvedValue(null);
      txManager.createQueryBuilder().getOne.mockResolvedValue({
        id: 'prod-1',
        stock: 0,
        averageCost: 3.25,
        negativeStockPolicy: NEGATIVE_STOCK_POLICY.RESTRICT,
        tenant_id: 'tenant-1',
      });

      await expect(
        service.syncBatch('tenant-1', [
          {
            idempotencyKey: 'neg-reject-1',
            sourceDeviceId: 'd1',
            sourceSequence: 8,
            documentType: 'SALE',
            invoice: {
              ...baseInvoice,
              items: [{ ...baseInvoice.items[0], quantity: 1.5 }],
            },
          },
        ]),
      ).rejects.toThrow('Negative stock blocked by policy');
    });

    it('processes Topology A mixed batch with SALE and PURCHASE/SHRINKAGE/PRODUCTION deltas', async () => {
      receiptRepo.findOne.mockResolvedValue(null);
      recipeService.findActiveVersion.mockResolvedValue(null);
      txManager.createQueryBuilder().getOne.mockResolvedValue({
        id: 'ins-raw',
        stock: 20,
        averageCost: 3.5,
        tenant_id: 'tenant-1',
      });

      const result = await service.syncBatch('tenant-1', [
        {
          idempotencyKey: 'mix-1',
          sourceDeviceId: 'd-edge',
          sourceSequence: 1,
          documentType: 'SALE',
          invoice: baseInvoice,
        },
        {
          idempotencyKey: 'mix-2',
          sourceDeviceId: 'd-edge',
          sourceSequence: 2,
          documentType: 'PURCHASE',
          movements: [{ insumoId: 'ins-raw', quantity: 5, unitCostNio: 4.25 }],
        },
        {
          idempotencyKey: 'mix-3',
          sourceDeviceId: 'd-edge',
          sourceSequence: 3,
          documentType: 'SHRINKAGE',
          movements: [{ insumoId: 'ins-raw', quantity: -1, unitCostNio: 4.25 }],
        },
        {
          idempotencyKey: 'mix-4',
          sourceDeviceId: 'd-edge',
          sourceSequence: 4,
          documentType: 'PRODUCTION',
          movements: [{ insumoId: 'ins-fg', quantity: 2, unitCostNio: 6.5 }],
        },
      ]);

      expect(result).toEqual({ received: 4, processed: 4, duplicates: 0 });
      expect(movementRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: MovementType.SALE }),
      );
      expect(movementRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: MovementType.PURCHASE }),
      );
      expect(movementRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: MovementType.SHRINKAGE }),
      );
      expect(movementRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: MovementType.PRODUCTION }),
      );
      expect(txManager.save).toHaveBeenCalled();
    });

    it('skips unresolved insumo movements without corrupt zero valuation', async () => {
      receiptRepo.findOne.mockResolvedValue(null);
      txManager.createQueryBuilder().getOne.mockResolvedValue(null);

      await service.syncBatch('tenant-1', [
        {
          idempotencyKey: 'skip-1',
          sourceDeviceId: 'd-edge',
          sourceSequence: 2,
          documentType: 'PURCHASE',
          movements: [{ insumoId: 'missing-ins', quantity: 3, unitCostNio: 4 }],
        },
      ]);

      expect(movementRepo.create).not.toHaveBeenCalled();
    });

    it('rolls back invoice/items when a later inventory movement fails (tx atomicity)', async () => {
      // Prove that invoice/items/receipt persistence now routes through the
      // SERIALIZABLE transaction manager, so a later inventory failure
      // (here: a negative stock policy rejection) leaves nothing committed.
      receiptRepo.findOne.mockResolvedValue(null);
      // No active recipe → the product itself is treated as the insumo.
      recipeService.findActiveVersion.mockResolvedValue(null);

      // Distinct tx-scoped repos so we can prove the standalone injected
      // repositories are NOT used by syncBatch anymore.
      const txInvoiceRepo = { upsert: jest.fn() };
      const txItemRepo = {
        upsert: jest.fn(),
        find: jest.fn().mockResolvedValue([]),
      };
      const txPaymentRepo = { upsert: jest.fn() };
      txManager.getRepository.mockImplementation((target: unknown) => {
        if (target === Invoice) return txInvoiceRepo;
        if (target === InvoiceItem) return txItemRepo;
        if (target === Payment) return txPaymentRepo;
        return undefined;
      });

      // The insumo (== product here) has restricted negative-stock policy
      // and zero stock, so the SALE movement drives the stock negative and
      // appendInventoryDeltas throws a BadRequestException.
      txManager.createQueryBuilder().getOne.mockResolvedValue({
        id: 'prod-1',
        stock: 0,
        averageCost: 3.25,
        negativeStockPolicy: NEGATIVE_STOCK_POLICY.RESTRICT,
        tenant_id: 'tenant-1',
      });

      await expect(
        service.syncBatch('tenant-1', [
          {
            idempotencyKey: 'rollback-1',
            sourceDeviceId: 'd1',
            sourceSequence: 20,
            documentType: 'SALE',
            invoice: {
              ...baseInvoice,
              items: [{ ...baseInvoice.items[0], quantity: 1.5 }],
            },
          },
        ]),
      ).rejects.toThrow('Negative stock blocked by policy');

      // Invoice + items were routed THROUGH the transaction manager (the
      // tx-scoped repos received the upsert), proving they participate in
      // the same tx that the inventory failure rolls back.
      expect(txInvoiceRepo.upsert).toHaveBeenCalledTimes(1);
      expect(txItemRepo.upsert).toHaveBeenCalledTimes(1);
      // The standalone injected repositories must NOT be used by syncBatch,
      // otherwise those writes would have committed outside the tx.
      expect(invoiceRepo.upsert).not.toHaveBeenCalled();
      expect(itemRepo.upsert).not.toHaveBeenCalled();
      // Nothing inside the tx committed: no insumo, no movement, and no
      // idempotency receipt reached `manager.save`.
      expect(txManager.save).not.toHaveBeenCalled();
      expect(receiptRepo.save).not.toHaveBeenCalled();
    });
  });
});
