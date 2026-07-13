import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { calculateSyncPayloadHash, InvoicesService } from './invoices.service';
import { Invoice } from '../entities/invoice.entity';
import { InvoiceItem } from '../entities/invoice-item.entity';
import { Payment } from '../entities/payment.entity';
import { SyncInvoiceDto } from '../dto/sync-invoice.dto';
import { SyncBatchRecordDto } from '../dto/sync-batch.dto';
import {
  InventoryMovement,
  MovementType,
} from '../../inventory/entities/inventory-movement.entity';
import { InventorySyncReceipt } from '../../inventory/entities/inventory-sync-receipt.entity';
import { InventorySyncOutbox } from '../../inventory/entities/inventory-sync-outbox.entity';
import { RecipeService } from '../../inventory/recipe.service';
import { BomExplosionService } from '../../inventory/bom-explosion.service';
import { DataSource } from 'typeorm';
import {
  Insumo,
  NEGATIVE_STOCK_POLICY,
} from '../../inventory/entities/insumo.entity';
import { User, UserRole } from '../../identity/entities/user.entity';

describe('InvoicesService', () => {
  let service: InvoicesService;
  let invoiceRepo: { upsert: jest.Mock; find?: jest.Mock; findOne: jest.Mock };
  let itemRepo: { upsert: jest.Mock; find: jest.Mock };
  let paymentRepo: { upsert: jest.Mock; find?: jest.Mock };
  let userRepo: { findOne: jest.Mock };
  let movementRepo: {
    create: jest.Mock;
    save: jest.Mock;
    manager: { findOne: jest.Mock; save: jest.Mock };
  };
  let receiptRepo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let outboxRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
  };
  let recipeService: { findActiveVersion: jest.Mock; getSnapshot: jest.Mock };
  let bomExplosionService: { explode: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let txManager: {
    query: jest.Mock<Promise<unknown>, unknown[]>;
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
    find: jest.Mock<Promise<unknown[]>, unknown[]>;
  };

  beforeEach(async () => {
    invoiceRepo = {
      upsert: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
    };
    itemRepo = { upsert: jest.fn(), find: jest.fn().mockResolvedValue([]) };
    paymentRepo = { upsert: jest.fn(), find: jest.fn().mockResolvedValue([]) };
    userRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'manager-1',
        tenant_id: 'tenant-1',
        role: UserRole.MANAGER,
        is_active: true,
      }),
    };
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
    outboxRepo = {
      findOne: jest.fn(),
      create: jest.fn((x: unknown) => x),
      save: jest.fn(),
      delete: jest.fn(),
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
      query: jest.fn<Promise<unknown>, unknown[]>().mockResolvedValue([]),
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
        if (target === User) return userRepo;
        if (target === InventorySyncReceipt) return receiptRepo;
        if (target === InventorySyncOutbox) return outboxRepo;
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
      find: jest.fn<Promise<unknown[]>, unknown[]>().mockResolvedValue([]),
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
          provide: getRepositoryToken(User),
          useValue: userRepo,
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
          provide: getRepositoryToken(InventorySyncOutbox),
          useValue: outboxRepo,
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
    const creditNoteInvoice: SyncInvoiceDto = {
      id: 'credit-invoice-1',
      number: 'NC-001',
      createdAt: '2026-07-10T18:00:00.000Z',
      userId: 'user-1',
      subtotal: -50,
      totalTax: -7.5,
      total: -57.5,
      paymentStatus: 'REFUNDED',
      type: 'creditNote',
      originInvoiceId: 'sale-invoice-1',
      refundReasonCode: 'DAMAGED_RETURN',
      refundReasonPolicy: 'WASTE_NO_RESTOCK',
      authorizedByUserId: 'manager-1',
      authorizedByRole: 'manager',
      items: [
        {
          id: 'credit-item-1',
          productId: 'prod-1',
          productName: 'Burger',
          quantity: -1,
          unitPrice: 50,
          originalTaxRate: 0.15,
          appliedTaxRate: 0.15,
          taxAmount: -7.5,
          total: -57.5,
          discount: 0,
          originInvoiceItemId: 'sale-item-1',
        },
      ],
      payments: [],
    };

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

    it('treats an identical duplicate credit-note invoice as idempotent without issuing an UPDATE upsert', async () => {
      invoiceRepo.findOne.mockResolvedValueOnce({
        ...creditNoteInvoice,
        tenant_id: 'tenant-1',
        created_at: new Date(creditNoteInvoice.createdAt),
        items: creditNoteInvoice.items.map((item) => ({
          ...item,
          invoiceId: creditNoteInvoice.id,
          tenant_id: 'tenant-1',
        })),
        payments: [],
      });

      await service.syncInvoices(
        'tenant-1',
        [creditNoteInvoice],
        txManager as never,
        {
          allowCreditNotes: true,
        },
      );

      expect(invoiceRepo.findOne).toHaveBeenCalledWith({
        where: { id: creditNoteInvoice.id, tenant_id: 'tenant-1' },
        relations: ['items', 'payments'],
      });
      expect(invoiceRepo.upsert).not.toHaveBeenCalled();
      expect(itemRepo.upsert).not.toHaveBeenCalled();
      expect(paymentRepo.upsert).not.toHaveBeenCalled();
    });

    it('rejects a changed duplicate credit-note invoice before DB upsert can hit append-only triggers', async () => {
      invoiceRepo.findOne.mockResolvedValueOnce({
        ...creditNoteInvoice,
        total: -57.5,
        tenant_id: 'tenant-1',
        created_at: new Date(creditNoteInvoice.createdAt),
        items: creditNoteInvoice.items.map((item) => ({
          ...item,
          invoiceId: creditNoteInvoice.id,
          tenant_id: 'tenant-1',
        })),
        payments: [],
      });

      await expect(
        service.syncInvoices(
          'tenant-1',
          [{ ...creditNoteInvoice, total: -58.5 }],
          txManager as never,
          { allowCreditNotes: true },
        ),
      ).rejects.toThrow('conflicts with an existing credit-note invoice');

      expect(invoiceRepo.upsert).not.toHaveBeenCalled();
      expect(itemRepo.upsert).not.toHaveBeenCalled();
      expect(paymentRepo.upsert).not.toHaveBeenCalled();
    });

    it('disallows credit-note invoices on the direct sales sync boundary', async () => {
      await expect(
        service.syncInvoices('tenant-1', [creditNoteInvoice]),
      ).rejects.toThrow(
        'Credit-note invoices must use the batch CREDIT_NOTE sync boundary',
      );

      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(invoiceRepo.findOne).not.toHaveBeenCalled();
      expect(invoiceRepo.upsert).not.toHaveBeenCalled();
      expect(itemRepo.upsert).not.toHaveBeenCalled();
    });

    it('rejects a credit-note origin invoice that is itself another credit note before persistence', async () => {
      invoiceRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 'sale-invoice-1',
        tenant_id: 'tenant-1',
        type: 'creditNote',
      });

      await expect(
        service.syncInvoices(
          'tenant-1',
          [creditNoteInvoice],
          txManager as never,
          {
            allowCreditNotes: true,
          },
        ),
      ).rejects.toThrow(
        'credit-note origin invoice must be a regular sale invoice',
      );

      expect(invoiceRepo.upsert).not.toHaveBeenCalled();
      expect(itemRepo.upsert).not.toHaveBeenCalled();
    });

    it('rejects a credit-note origin invoice that is canceled before persistence', async () => {
      invoiceRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 'sale-invoice-1',
        tenant_id: 'tenant-1',
        type: 'regular',
        isCanceled: true,
      });

      await expect(
        service.syncInvoices(
          'tenant-1',
          [creditNoteInvoice],
          txManager as never,
          { allowCreditNotes: true },
        ),
      ).rejects.toThrow(
        'credit-note origin invoice must be a regular sale invoice and must not be canceled',
      );

      expect(invoiceRepo.upsert).not.toHaveBeenCalled();
      expect(itemRepo.upsert).not.toHaveBeenCalled();
    });

    it('rejects a credit-note origin invoice whose type is not regular before persistence', async () => {
      invoiceRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 'sale-invoice-1',
        tenant_id: 'tenant-1',
        type: 'proforma',
        isCanceled: false,
      });

      await expect(
        service.syncInvoices(
          'tenant-1',
          [creditNoteInvoice],
          txManager as never,
          { allowCreditNotes: true },
        ),
      ).rejects.toThrow(
        'credit-note origin invoice must be a regular sale invoice and must not be canceled',
      );

      expect(invoiceRepo.upsert).not.toHaveBeenCalled();
      expect(itemRepo.upsert).not.toHaveBeenCalled();
    });

    it('rejects credit-note lines whose origin item is missing from the tenant-bound origin invoice', async () => {
      invoiceRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 'sale-invoice-1',
        tenant_id: 'tenant-1',
        type: 'regular',
      });
      itemRepo.find.mockResolvedValueOnce([]);

      await expect(
        service.syncInvoices(
          'tenant-1',
          [creditNoteInvoice],
          txManager as never,
          {
            allowCreditNotes: true,
          },
        ),
      ).rejects.toThrow('credit-note origin invoice item was not found');

      expect(itemRepo.find).toHaveBeenCalled();
      expect(invoiceRepo.upsert).not.toHaveBeenCalled();
      expect(itemRepo.upsert).not.toHaveBeenCalled();
    });

    it('rejects duplicate origin invoice item references within one credit note', async () => {
      const duplicateOriginInvoice: SyncInvoiceDto = {
        ...creditNoteInvoice,
        items: [
          creditNoteInvoice.items[0],
          {
            ...creditNoteInvoice.items[0],
            id: 'credit-item-2',
            quantity: -1,
            total: -57.5,
            originInvoiceItemId: 'sale-item-1',
          },
        ],
      };

      invoiceRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 'sale-invoice-1',
        tenant_id: 'tenant-1',
        type: 'regular',
      });

      await expect(
        service.syncInvoices(
          'tenant-1',
          [duplicateOriginInvoice],
          txManager as never,
          { allowCreditNotes: true },
        ),
      ).rejects.toThrow('duplicate credit-note origin invoice item');

      expect(itemRepo.find).not.toHaveBeenCalled();
      expect(invoiceRepo.upsert).not.toHaveBeenCalled();
      expect(itemRepo.upsert).not.toHaveBeenCalled();
    });

    it('rejects credit-note lines whose origin item belongs to a different invoice', async () => {
      invoiceRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 'sale-invoice-1',
        tenant_id: 'tenant-1',
        type: 'regular',
      });
      itemRepo.find.mockResolvedValueOnce([
        {
          id: 'sale-item-1',
          tenant_id: 'tenant-1',
          invoiceId: 'sale-invoice-2',
        },
      ]);

      await expect(
        service.syncInvoices(
          'tenant-1',
          [creditNoteInvoice],
          txManager as never,
          {
            allowCreditNotes: true,
          },
        ),
      ).rejects.toThrow('must belong to the credit-note origin invoice');

      expect(invoiceRepo.upsert).not.toHaveBeenCalled();
      expect(itemRepo.upsert).not.toHaveBeenCalled();
    });

    it('rejects CREDIT_NOTE sync without immutable manager or owner authorization metadata', async () => {
      await expect(
        service.syncInvoices(
          'tenant-1',
          [
            {
              ...creditNoteInvoice,
              authorizedByUserId: undefined,
              authorizedByRole: undefined,
            },
          ],
          txManager as never,
          { allowCreditNotes: true },
        ),
      ).rejects.toThrow(
        'credit-note requires manager or owner authorization metadata',
      );

      expect(invoiceRepo.findOne).not.toHaveBeenCalled();
      expect(invoiceRepo.upsert).not.toHaveBeenCalled();
      expect(itemRepo.upsert).not.toHaveBeenCalled();
    });

    it('rejects CREDIT_NOTE sync when the authorizing actor is not an active same-tenant manager or owner', async () => {
      userRepo.findOne.mockResolvedValueOnce(null);

      await expect(
        service.syncInvoices(
          'tenant-1',
          [creditNoteInvoice],
          txManager as never,
          { allowCreditNotes: true },
        ),
      ).rejects.toThrow(
        'credit-note authorizing actor must be an active same-tenant manager or owner',
      );

      expect(userRepo.findOne).toHaveBeenCalledWith({
        where: {
          id: 'manager-1',
          tenant_id: 'tenant-1',
          is_active: true,
        },
      });
      expect(invoiceRepo.findOne).not.toHaveBeenCalled();
      expect(invoiceRepo.upsert).not.toHaveBeenCalled();
      expect(itemRepo.upsert).not.toHaveBeenCalled();
    });

    it('rejects CREDIT_NOTE sync when POS-supplied role metadata does not match the backend actor role', async () => {
      userRepo.findOne.mockResolvedValueOnce({
        id: 'manager-1',
        tenant_id: 'tenant-1',
        role: UserRole.CASHIER,
        is_active: true,
      });

      await expect(
        service.syncInvoices(
          'tenant-1',
          [creditNoteInvoice],
          txManager as never,
          { allowCreditNotes: true },
        ),
      ).rejects.toThrow(
        'credit-note authorization metadata does not match backend actor role',
      );

      expect(invoiceRepo.findOne).not.toHaveBeenCalled();
      expect(invoiceRepo.upsert).not.toHaveBeenCalled();
      expect(itemRepo.upsert).not.toHaveBeenCalled();
    });

    it('rejects CREDIT_NOTE sync when reason code is blank or missing', async () => {
      await expect(
        service.syncInvoices(
          'tenant-1',
          [{ ...creditNoteInvoice, refundReasonCode: '   ' }],
          txManager as never,
          { allowCreditNotes: true },
        ),
      ).rejects.toThrow('credit-note requires a nonblank refund reason code');

      expect(invoiceRepo.findOne).not.toHaveBeenCalled();
      expect(invoiceRepo.upsert).not.toHaveBeenCalled();
      expect(itemRepo.upsert).not.toHaveBeenCalled();
    });

    it('persists CREDIT_NOTE authorization metadata and nonblank reason code', async () => {
      userRepo.findOne.mockResolvedValueOnce({
        id: 'manager-1',
        tenant_id: 'tenant-1',
        role: UserRole.MANAGER,
        is_active: true,
      });
      invoiceRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 'sale-invoice-1',
        tenant_id: 'tenant-1',
        type: 'regular',
        isCanceled: false,
      });
      itemRepo.find
        .mockResolvedValueOnce([
          {
            id: 'sale-item-1',
            tenant_id: 'tenant-1',
            invoiceId: 'sale-invoice-1',
            quantity: 2,
          },
        ])
        .mockResolvedValueOnce([]);

      await service.syncInvoices(
        'tenant-1',
        [creditNoteInvoice],
        txManager as never,
        { allowCreditNotes: true },
      );

      expect(invoiceRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'credit-invoice-1',
          refundReasonCode: 'DAMAGED_RETURN',
          authorizedByUserId: 'manager-1',
          authorizedByRole: 'manager',
        }),
        ['id'],
      );
    });

    it('rejects FINANCIAL_ONLY credit-note quantities above the origin item quantity before persistence', async () => {
      invoiceRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 'sale-invoice-1',
        tenant_id: 'tenant-1',
        type: 'regular',
        isCanceled: false,
      });
      itemRepo.find.mockResolvedValueOnce([
        {
          id: 'sale-item-1',
          tenant_id: 'tenant-1',
          invoiceId: 'sale-invoice-1',
          quantity: 1,
        },
      ]);

      await expect(
        service.syncInvoices(
          'tenant-1',
          [
            {
              ...creditNoteInvoice,
              refundReasonPolicy: 'FINANCIAL_ONLY',
              items: [{ ...creditNoteInvoice.items[0], quantity: -2 }],
            },
          ],
          txManager as never,
          { allowCreditNotes: true },
        ),
      ).rejects.toThrow(
        'credit-note refund quantity exceeds the origin item quantity',
      );

      expect(invoiceRepo.upsert).not.toHaveBeenCalled();
      expect(itemRepo.upsert).not.toHaveBeenCalled();
    });

    it('rejects cumulative credit-note quantity above the origin item quantity for no-stock policies', async () => {
      invoiceRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 'sale-invoice-1',
        tenant_id: 'tenant-1',
        type: 'regular',
        isCanceled: false,
      });
      itemRepo.find
        .mockResolvedValueOnce([
          {
            id: 'sale-item-1',
            tenant_id: 'tenant-1',
            invoiceId: 'sale-invoice-1',
            quantity: 2,
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'existing-credit-item-1',
            tenant_id: 'tenant-1',
            invoiceId: 'existing-credit-note-1',
            originInvoiceItemId: 'sale-item-1',
            quantity: -1.5,
          },
        ]);

      await expect(
        service.syncInvoices(
          'tenant-1',
          [
            {
              ...creditNoteInvoice,
              refundReasonPolicy: 'WASTE_NO_RESTOCK',
              items: [{ ...creditNoteInvoice.items[0], quantity: -1 }],
            },
          ],
          txManager as never,
          { allowCreditNotes: true },
        ),
      ).rejects.toThrow(
        'credit-note cumulative refund quantity exceeds the origin item quantity',
      );

      expect(invoiceRepo.upsert).not.toHaveBeenCalled();
      expect(itemRepo.upsert).not.toHaveBeenCalled();
    });

    it('binds app.tenant_id before direct sales sync persistence touches RLS-protected tables', async () => {
      const dto: SyncInvoiceDto = {
        id: 'direct-rls-invoice',
        number: 'RLS-001',
        createdAt: new Date().toISOString(),
        userId: 'user-1',
        subtotal: 10,
        totalTax: 1.5,
        total: 11.5,
        paymentStatus: 'PAID',
        items: [],
        payments: [],
      };

      await service.syncInvoices('tenant-rls', [dto]);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(txManager.query).toHaveBeenCalledWith(
        "SELECT set_config('app.tenant_id', $1, true)",
        ['tenant-rls'],
      );
      expect(txManager.query.mock.invocationCallOrder[0]).toBeLessThan(
        invoiceRepo.upsert.mock.invocationCallOrder[0],
      );
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
      refundReasonCode: 'DAMAGED_RETURN',
      authorizedByUserId: 'manager-1',
      authorizedByRole: 'manager',
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
        expect.objectContaining({
          type: MovementType.SALE,
          unitCostNio: 2,
          averageCostAfterNio: 2,
        }),
      );
    });

    it('keeps historical SALE snapshots frozen when later ledger inserts use a different cost context', async () => {
      receiptRepo.findOne.mockResolvedValue(null);
      recipeService.findActiveVersion.mockResolvedValue(null);
      txManager
        .createQueryBuilder()
        .getOne.mockResolvedValueOnce({
          stock: 10,
          averageCost: 2,
          id: 'ins-1',
          tenant_id: 'tenant-1',
          negativeStockPolicy: NEGATIVE_STOCK_POLICY.RESTRICT,
        })
        .mockResolvedValueOnce({
          stock: 8,
          averageCost: 4.25,
          id: 'ins-1',
          tenant_id: 'tenant-1',
          negativeStockPolicy: NEGATIVE_STOCK_POLICY.RESTRICT,
        });

      await service.syncBatch('tenant-1', [
        {
          idempotencyKey: 'sale-freeze-1',
          sourceDeviceId: 'd1',
          sourceSequence: 1,
          documentType: 'SALE',
          invoice: baseInvoice,
        },
        {
          idempotencyKey: 'purchase-after-sale-1',
          sourceDeviceId: 'd1',
          sourceSequence: 2,
          documentType: 'PURCHASE',
          movements: [{ insumoId: 'ins-1', quantity: 5, unitCostNio: 7.5 }],
        },
      ]);

      const movementCalls = movementRepo.create.mock.calls as Array<
        [Record<string, unknown>]
      >;
      const firstMovement = movementCalls[0][0];
      const secondMovement = movementCalls[1][0];

      expect(firstMovement).toEqual(
        expect.objectContaining({
          type: MovementType.SALE,
          unitCostNio: 2,
          averageCostAfterNio: 2,
        }),
      );
      expect(secondMovement).toEqual(
        expect.objectContaining({
          type: MovementType.PURCHASE,
          unitCostNio: 7.5,
          averageCostAfterNio: 5.5,
        }),
      );
      expect(txManager.save).toHaveBeenCalledWith(
        Insumo,
        expect.objectContaining({
          id: 'ins-1',
          stock: 13,
          existenciaActual: 13,
          averageCost: 5.5,
        }),
      );
    });

    it('skips duplicate records by idempotencyKey/sourceSequence', async () => {
      const duplicateSaleRecord: SyncBatchRecordDto = {
        idempotencyKey: 'dup',
        sourceDeviceId: 'd1',
        sourceSequence: 1,
        documentType: 'SALE',
        invoice: baseInvoice,
      };
      receiptRepo.findOne
        .mockResolvedValueOnce({
          id: 'r-existing',
          payload_hash: calculateSyncPayloadHash(duplicateSaleRecord),
        })
        .mockResolvedValueOnce(null);

      const result = await service.syncBatch('tenant-1', [duplicateSaleRecord]);

      expect(result).toEqual({ received: 1, processed: 0, duplicates: 1 });
      expect(invoiceRepo.upsert).not.toHaveBeenCalled();
    });

    it('returns DUPLICATE without reapplying inventory when idempotency key and payload hash match', async () => {
      const duplicateRecord: SyncBatchRecordDto = {
        idempotencyKey: 'dup-hash',
        sourceDeviceId: 'd1',
        sourceSequence: 1,
        flowType: 'inventory',
        documentType: 'PURCHASE',
        movements: [{ insumoId: 'ins-1', quantity: 2, unitCostNio: 4 }],
      };
      receiptRepo.findOne
        .mockResolvedValueOnce({
          id: 'r-existing',
          idempotency_key: 'dup-hash',
          payload_hash: calculateSyncPayloadHash(duplicateRecord),
          result_status: 'ACCEPTED',
          result_code: 'APPLIED',
          source_device_id: 'd1',
          source_sequence: '1',
          flow_type: 'inventory',
        })
        .mockResolvedValueOnce(null);

      const result = await service.syncBatch('tenant-1', [duplicateRecord]);

      expect(result.results).toEqual([
        expect.objectContaining({
          idempotencyKey: 'dup-hash',
          status: 'DUPLICATE',
          retryable: false,
          code: 'DUPLICATE_REPLAY',
        }),
      ]);
      expect(dataSource.transaction).toHaveBeenCalled();
      expect(movementRepo.create).not.toHaveBeenCalled();
    });

    it('returns IDEMPOTENCY_MISMATCH when the same key is reused with a different payload hash', async () => {
      receiptRepo.findOne
        .mockResolvedValueOnce({
          id: 'r-existing',
          idempotency_key: 'same-key',
          payload_hash: 'different-hash',
          result_status: 'ACCEPTED',
          source_device_id: 'd1',
          source_sequence: '1',
          flow_type: 'inventory',
        })
        .mockResolvedValueOnce(null);

      const result = await service.syncBatch('tenant-1', [
        {
          idempotencyKey: 'same-key',
          sourceDeviceId: 'd1',
          sourceSequence: 1,
          flowType: 'inventory',
          documentType: 'PURCHASE',
          movements: [{ insumoId: 'ins-1', quantity: 2, unitCostNio: 4 }],
        },
      ]);

      expect(result.results).toEqual([
        expect.objectContaining({
          idempotencyKey: 'same-key',
          status: 'IDEMPOTENCY_MISMATCH',
          retryable: false,
          code: 'CRITICAL_PAYLOAD_MISMATCH',
        }),
      ]);
      expect(dataSource.transaction).toHaveBeenCalled();
    });

    it('returns IDEMPOTENCY_MISMATCH when a staged future key is retried with a different payload hash', async () => {
      const stagedRecord: SyncBatchRecordDto = {
        idempotencyKey: 'future-same-key',
        sourceDeviceId: 'd1',
        sourceSequence: 3,
        flowType: 'inventory',
        documentType: 'PURCHASE',
        movements: [{ insumoId: 'ins-1', quantity: 2, unitCostNio: 4 }],
      };
      receiptRepo.findOne.mockResolvedValue(null);
      outboxRepo.findOne.mockImplementation(
        ({ where }: { where: Record<string, unknown> }) => {
          if (where.idempotency_key === 'future-same-key') {
            return Promise.resolve({
              id: 'staged-future-same-key',
              idempotency_key: 'future-same-key',
              payload_hash: 'different-staged-payload-hash',
              source_device_id: 'd1',
              source_sequence: '3',
              flow_type: 'inventory',
              status: 'STAGED_FUTURE',
            });
          }
          return Promise.resolve(null);
        },
      );

      const result = await service.syncBatch('tenant-1', [stagedRecord]);

      expect(result.results).toEqual([
        expect.objectContaining({
          idempotencyKey: 'future-same-key',
          status: 'IDEMPOTENCY_MISMATCH',
          retryable: false,
          code: 'CRITICAL_STAGED_PAYLOAD_MISMATCH',
        }),
      ]);
      expect(outboxRepo.save).not.toHaveBeenCalled();
      expect(dataSource.transaction).toHaveBeenCalled();
    });

    it('returns a per-record mismatch instead of throwing when another staged future has the same stream sequence', async () => {
      const conflictingFuture: SyncBatchRecordDto = {
        idempotencyKey: 'future-conflict-key',
        sourceDeviceId: 'd1',
        sourceSequence: 4,
        flowType: 'inventory',
        documentType: 'PURCHASE',
        movements: [{ insumoId: 'ins-2', quantity: 1, unitCostNio: 6 }],
      };
      receiptRepo.findOne.mockResolvedValue(null);
      outboxRepo.findOne.mockImplementation(
        ({ where }: { where: Record<string, unknown> }) => {
          if (where.source_sequence === '4') {
            return Promise.resolve({
              id: 'staged-sequence-4',
              idempotency_key: 'different-key',
              payload_hash: 'different-staged-hash',
              source_device_id: 'd1',
              source_sequence: '4',
              flow_type: 'inventory',
              status: 'STAGED_FUTURE',
            });
          }
          return Promise.resolve(null);
        },
      );

      await expect(
        service.syncBatch('tenant-1', [conflictingFuture]),
      ).resolves.toMatchObject({
        received: 1,
        results: [
          expect.objectContaining({
            idempotencyKey: 'future-conflict-key',
            status: 'IDEMPOTENCY_MISMATCH',
            retryable: false,
            code: 'CRITICAL_STAGED_SEQUENCE_PAYLOAD_MISMATCH',
          }),
        ],
      });
      expect(outboxRepo.save).not.toHaveBeenCalled();
    });

    it('returns STAGED_FUTURE and persists the payload hash on the first out-of-order request', async () => {
      const futureRecord: SyncBatchRecordDto = {
        idempotencyKey: 'future-first-stage',
        sourceDeviceId: 'd1',
        sourceSequence: 5,
        flowType: 'inventory',
        documentType: 'PURCHASE',
        movements: [{ insumoId: 'ins-1', quantity: 3, unitCostNio: 7 }],
      };
      receiptRepo.findOne.mockResolvedValue(null);
      outboxRepo.findOne.mockResolvedValue(null);

      const result = await service.syncBatch('tenant-1', [futureRecord]);

      expect(result.results).toEqual([
        expect.objectContaining({
          idempotencyKey: 'future-first-stage',
          status: 'STAGED_FUTURE',
          retryable: true,
          code: 'WAITING_FOR_SEQUENCE_1',
        }),
      ]);
      expect(outboxRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotency_key: 'future-first-stage',
          source_sequence: '5',
          payload_hash: calculateSyncPayloadHash(futureRecord),
          payload: futureRecord,
          status: 'STAGED_FUTURE',
        }),
      );
      expect(outboxRepo.save).toHaveBeenCalledTimes(1);
    });

    it('returns deterministic STAGED_FUTURE when a concurrent retry hits the staged unique index', async () => {
      const retriedFuture: SyncBatchRecordDto = {
        idempotencyKey: 'future-race',
        sourceDeviceId: 'd1',
        sourceSequence: 6,
        flowType: 'inventory',
        documentType: 'PURCHASE',
        movements: [{ insumoId: 'ins-1', quantity: 1, unitCostNio: 2 }],
      };
      const payloadHash = calculateSyncPayloadHash(retriedFuture);
      receiptRepo.findOne.mockResolvedValue(null);
      outboxRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'staged-race',
          idempotency_key: 'future-race',
          payload_hash: payloadHash,
          source_device_id: 'd1',
          source_sequence: '6',
          flow_type: 'inventory',
          status: 'STAGED_FUTURE',
        });
      outboxRepo.save.mockRejectedValueOnce({ code: '23505' });

      const result = await service.syncBatch('tenant-1', [retriedFuture]);

      expect(result.results).toEqual([
        expect.objectContaining({
          idempotencyKey: 'future-race',
          status: 'STAGED_FUTURE',
          retryable: true,
          code: 'WAITING_FOR_SEQUENCE_1',
        }),
      ]);
    });

    it('blocks later same-stream records when the expected sequence fails business validation', async () => {
      receiptRepo.findOne.mockResolvedValue(null);
      outboxRepo.findOne.mockResolvedValue(null);
      recipeService.findActiveVersion.mockResolvedValue(null);
      txManager.createQueryBuilder().getOne.mockResolvedValue({
        id: 'prod-1',
        stock: 0,
        averageCost: 3.25,
        negativeStockPolicy: NEGATIVE_STOCK_POLICY.RESTRICT,
        tenant_id: 'tenant-1',
      });

      const result = await service.syncBatch('tenant-1', [
        {
          idempotencyKey: 'bad-1',
          sourceDeviceId: 'd1',
          sourceSequence: 1,
          flowType: 'inventory',
          documentType: 'SALE',
          invoice: {
            ...baseInvoice,
            items: [{ ...baseInvoice.items[0], quantity: 1.5 }],
          },
        },
        {
          idempotencyKey: 'blocked-2',
          sourceDeviceId: 'd1',
          sourceSequence: 2,
          flowType: 'inventory',
          documentType: 'PURCHASE',
          movements: [{ insumoId: 'ins-1', quantity: 2, unitCostNio: 4 }],
        },
      ]);

      expect(result.results).toEqual([
        expect.objectContaining({
          idempotencyKey: 'bad-1',
          status: 'REJECTED',
          retryable: true,
          code: 'BUSINESS_RULE_VALIDATION',
        }),
        expect.objectContaining({
          idempotencyKey: 'blocked-2',
          status: 'BLOCKED_BY_PRIOR_FAILURE',
          retryable: true,
          code: 'WAITING_FOR_SEQUENCE_1',
        }),
      ]);
      expect(outboxRepo.save).not.toHaveBeenCalled();
    });

    it('stages future sequence records and drains them once the missing sequence is accepted', async () => {
      receiptRepo.findOne.mockResolvedValue(null);
      outboxRepo.findOne.mockResolvedValueOnce({
        id: 'staged-2',
        tenant_id: 'tenant-1',
        idempotency_key: 'future-2',
        source_device_id: 'd1',
        source_sequence: '2',
        flow_type: 'inventory',
        document_type: 'PURCHASE',
        payload_hash:
          '3f726f8dff7fc64d72d90115f896d73c360d7050570b1fbd54d7ac54b7a7161a',
        payload: {
          idempotencyKey: 'future-2',
          sourceDeviceId: 'd1',
          sourceSequence: 2,
          flowType: 'inventory',
          documentType: 'PURCHASE',
          movements: [{ insumoId: 'ins-1', quantity: 2, unitCostNio: 4 }],
        },
      });
      txManager.createQueryBuilder().getOne.mockResolvedValue({
        id: 'ins-1',
        stock: 10,
        averageCost: 2,
        negativeStockPolicy: NEGATIVE_STOCK_POLICY.RESTRICT,
        tenant_id: 'tenant-1',
      });

      const result = await service.syncBatch('tenant-1', [
        {
          idempotencyKey: 'gap-1',
          sourceDeviceId: 'd1',
          sourceSequence: 1,
          flowType: 'inventory',
          documentType: 'PURCHASE',
          movements: [{ insumoId: 'ins-1', quantity: 1, unitCostNio: 3 }],
        },
      ]);

      expect(result.results).toEqual([
        expect.objectContaining({
          idempotencyKey: 'gap-1',
          status: 'ACCEPTED',
        }),
        expect.objectContaining({
          idempotencyKey: 'future-2',
          status: 'ACCEPTED',
        }),
      ]);
      expect(outboxRepo.delete).toHaveBeenCalledWith({ id: 'staged-2' });
      expect(dataSource.transaction).toHaveBeenCalled();
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

    it('rejects positive inbound deltas without unitCostNio before any inventory side effects', async () => {
      receiptRepo.findOne.mockResolvedValue(null);
      const lockedInsumo = {
        id: 'ins-raw',
        stock: 20,
        averageCost: 3.5,
        negativeStockPolicy: NEGATIVE_STOCK_POLICY.RESTRICT,
        tenant_id: 'tenant-1',
      };
      txManager.createQueryBuilder().getOne.mockResolvedValue(lockedInsumo);

      await expect(
        service.syncBatch('tenant-1', [
          {
            idempotencyKey: 'missing-unit-cost-1',
            sourceDeviceId: 'd-edge',
            sourceSequence: 5,
            documentType: 'PURCHASE',
            movements: [{ insumoId: 'ins-raw', quantity: 5 }],
          },
        ]),
      ).rejects.toThrow(
        'Inbound synced inventory deltas must include unitCostNio to freeze a valid cost snapshot',
      );

      expect(lockedInsumo).toMatchObject({
        stock: 20,
        averageCost: 3.5,
      });
      expect(lockedInsumo).not.toHaveProperty('existenciaActual');
      expect(movementRepo.create).not.toHaveBeenCalled();
      expect(txManager.save).not.toHaveBeenCalled();
      expect(receiptRepo.save).not.toHaveBeenCalled();
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

    it('binds app.tenant_id inside the batch transaction before invoice and inventory writes', async () => {
      receiptRepo.findOne.mockResolvedValue(null);
      recipeService.findActiveVersion.mockResolvedValue(null);
      txManager.createQueryBuilder().getOne.mockResolvedValue({
        id: 'prod-1',
        stock: 10,
        averageCost: 2,
        negativeStockPolicy: NEGATIVE_STOCK_POLICY.RESTRICT,
        tenant_id: 'tenant-rls',
      });
      txManager.createQueryBuilder.mockClear();

      await service.syncBatch('tenant-rls', [
        {
          idempotencyKey: 'batch-rls-1',
          sourceDeviceId: 'd1',
          sourceSequence: 1,
          flowType: 'sales',
          documentType: 'SALE',
          invoice: baseInvoice,
        },
      ]);

      expect(txManager.query).toHaveBeenCalledWith(
        "SELECT set_config('app.tenant_id', $1, true)",
        ['tenant-rls'],
      );
      expect(txManager.query.mock.invocationCallOrder[0]).toBeLessThan(
        invoiceRepo.upsert.mock.invocationCallOrder[0],
      );
      expect(txManager.query.mock.invocationCallOrder[0]).toBeLessThan(
        txManager.createQueryBuilder.mock.invocationCallOrder[0],
      );
    });

    it('rejects creditNote invoice type on non-CREDIT_NOTE batch records before persistence', async () => {
      const creditNoteOnSaleRecord: SyncBatchRecordDto = {
        idempotencyKey: 'sale-credit-note-mismatch',
        sourceDeviceId: 'd1',
        sourceSequence: 1,
        flowType: 'sales',
        documentType: 'SALE',
        invoice: {
          ...baseInvoice,
          type: 'creditNote',
          originInvoiceId: 'origin-sale-1',
          refundReasonPolicy: 'FINANCIAL_ONLY',
          items: [
            {
              ...baseInvoice.items[0],
              originInvoiceItemId: 'origin-sale-item-1',
            },
          ],
        },
      };

      const result = await service.syncBatch('tenant-1', [
        creditNoteOnSaleRecord,
      ]);

      expect(result.results).toEqual([
        expect.objectContaining({
          status: 'REJECTED',
          retryable: false,
          code: 'CREDIT_NOTE_DOCUMENT_TYPE_MISMATCH',
        }),
      ]);
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(invoiceRepo.upsert).not.toHaveBeenCalled();
    });

    it('normalizes credit-note provenance fields to null on non-CREDIT_NOTE batch invoice records', async () => {
      receiptRepo.findOne.mockResolvedValue(null);
      recipeService.findActiveVersion.mockResolvedValue(null);
      txManager.createQueryBuilder().getOne.mockResolvedValue({
        id: 'prod-1',
        stock: 10,
        averageCost: 2,
        negativeStockPolicy: NEGATIVE_STOCK_POLICY.RESTRICT,
        tenant_id: 'tenant-1',
      });

      const result = await service.syncBatch('tenant-1', [
        {
          idempotencyKey: 'sale-spoofed-credit-provenance',
          sourceDeviceId: 'd1',
          sourceSequence: 1,
          flowType: 'sales',
          documentType: 'SALE',
          invoice: {
            ...baseInvoice,
            originInvoiceId: 'spoofed-origin-invoice',
            refundReasonCode: 'SPOOFED_REFUND_REASON',
            refundReasonPolicy: 'FINANCIAL_ONLY',
            items: [
              {
                ...baseInvoice.items[0],
                originInvoiceItemId: 'spoofed-origin-item',
              },
            ],
          },
        },
      ]);

      expect(result.results).toEqual([
        expect.objectContaining({
          status: 'ACCEPTED',
          code: 'APPLIED',
        }),
      ]);
      expect(invoiceRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'inv-1',
          originInvoiceId: null,
          refundReasonCode: null,
          refundReasonPolicy: null,
        }),
        ['id'],
      );
      expect(itemRepo.upsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'item-1',
            originInvoiceItemId: null,
          }),
        ]),
        ['id'],
      );
    });

    it('normalizes credit-note provenance fields to null on direct non-credit invoice sync', async () => {
      const directInvoice: SyncInvoiceDto = {
        ...baseInvoice,
        originInvoiceId: 'spoofed-direct-origin',
        refundReasonCode: 'SPOOFED_DIRECT_REASON',
        refundReasonPolicy: 'WASTE_NO_RESTOCK',
        items: [
          {
            ...baseInvoice.items[0],
            originInvoiceItemId: 'spoofed-direct-origin-item',
          },
        ],
      };

      await service.syncInvoices('tenant-1', [directInvoice]);

      expect(invoiceRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'inv-1',
          originInvoiceId: null,
          refundReasonCode: null,
          refundReasonPolicy: null,
        }),
        ['id'],
      );
      expect(itemRepo.upsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'item-1',
            originInvoiceItemId: null,
          }),
        ]),
        ['id'],
      );
    });

    it('rejects no-flowType CREDIT_NOTE records before legacy persistence when invoice type is not creditNote', async () => {
      const result = await service.syncBatch('tenant-1', [
        {
          idempotencyKey: 'legacy-credit-note-mismatch',
          sourceDeviceId: 'legacy-terminal',
          sourceSequence: 1,
          documentType: 'CREDIT_NOTE',
          invoice: baseInvoice,
        },
      ]);

      expect(result).toMatchObject({
        received: 1,
        processed: 0,
        duplicates: 0,
        results: [
          expect.objectContaining({
            idempotencyKey: 'legacy-credit-note-mismatch',
            status: 'REJECTED',
            retryable: false,
            code: 'CREDIT_NOTE_FLOW_TYPE_REQUIRED',
          }),
        ],
      });
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(invoiceRepo.upsert).not.toHaveBeenCalled();
    });

    it('rejects no-flowType CREDIT_NOTE records before legacy persistence even when invoice type is creditNote', async () => {
      const result = await service.syncBatch('tenant-1', [
        {
          idempotencyKey: 'legacy-credit-note-explicit',
          sourceDeviceId: 'legacy-terminal',
          sourceSequence: 1,
          documentType: 'CREDIT_NOTE',
          invoice: {
            ...baseInvoice,
            type: 'creditNote',
            originInvoiceId: 'sale-origin-1',
            refundReasonPolicy: 'FINANCIAL_ONLY',
            items: [
              {
                ...baseInvoice.items[0],
                originInvoiceItemId: 'sale-item-1',
              },
            ],
          },
        },
      ]);

      expect(result.results).toEqual([
        expect.objectContaining({
          idempotencyKey: 'legacy-credit-note-explicit',
          status: 'REJECTED',
          retryable: false,
          code: 'CREDIT_NOTE_FLOW_TYPE_REQUIRED',
        }),
      ]);
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(invoiceRepo.upsert).not.toHaveBeenCalled();
    });

    it('rejects no-flowType CREDIT_NOTE records in mixed batches before defaulting them to inventory flow', async () => {
      receiptRepo.findOne.mockResolvedValue(null);

      const result = await service.syncBatch('tenant-1', [
        {
          idempotencyKey: 'mixed-sale-with-flow',
          sourceDeviceId: 'mixed-terminal',
          sourceSequence: 1,
          flowType: 'sales',
          documentType: 'SALE',
          invoice: baseInvoice,
        },
        {
          idempotencyKey: 'mixed-credit-note-without-flow',
          sourceDeviceId: 'mixed-terminal',
          sourceSequence: 2,
          documentType: 'CREDIT_NOTE',
          invoice: {
            ...baseInvoice,
            id: 'mixed-credit-note-invoice',
            type: 'creditNote',
            originInvoiceId: 'sale-origin-1',
            refundReasonPolicy: 'FINANCIAL_ONLY',
            items: [
              {
                ...baseInvoice.items[0],
                id: 'mixed-credit-note-item',
                originInvoiceItemId: 'sale-item-1',
              },
            ],
          },
        },
      ]);

      expect(result.results).toEqual([
        expect.objectContaining({
          idempotencyKey: 'mixed-sale-with-flow',
          status: 'ACCEPTED',
          code: 'APPLIED',
        }),
        expect.objectContaining({
          idempotencyKey: 'mixed-credit-note-without-flow',
          status: 'REJECTED',
          retryable: false,
          code: 'CREDIT_NOTE_FLOW_TYPE_REQUIRED',
          flowType: 'inventory',
        }),
      ]);
      expect(invoiceRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'inv-1' }),
        ['id'],
      );
      expect(invoiceRepo.upsert).not.toHaveBeenCalledWith(
        expect.objectContaining({ id: 'mixed-credit-note-invoice' }),
        ['id'],
      );
    });

    it('rejects CREDIT_NOTE records without an invoice before accepting a receipt', async () => {
      receiptRepo.findOne.mockResolvedValue(null);

      const result = await service.syncBatch('tenant-1', [
        {
          idempotencyKey: 'credit-note-missing-invoice',
          sourceDeviceId: 'd1',
          sourceSequence: 1,
          flowType: 'sales',
          documentType: 'CREDIT_NOTE',
        },
      ]);

      expect(result.results).toEqual([
        expect.objectContaining({
          idempotencyKey: 'credit-note-missing-invoice',
          status: 'REJECTED',
          retryable: false,
          code: 'CREDIT_NOTE_INVOICE_REQUIRED',
        }),
      ]);
      expect(receiptRepo.save).not.toHaveBeenCalled();
      expect(invoiceRepo.upsert).not.toHaveBeenCalled();
      expect(movementRepo.create).not.toHaveBeenCalled();
    });

    it('rejects CREDIT_NOTE stock movement deltas non-retryably without creating Kardex', async () => {
      const result = await service.syncBatch('tenant-1', [
        {
          idempotencyKey: 'credit-note-stock-delta',
          sourceDeviceId: 'd1',
          sourceSequence: 1,
          flowType: 'inventory',
          documentType: 'CREDIT_NOTE',
          invoice: {
            ...baseInvoice,
            type: 'creditNote',
            originInvoiceId: 'sale-origin-1',
            refundReasonPolicy: 'FINANCIAL_ONLY',
            items: [
              {
                ...baseInvoice.items[0],
                originInvoiceItemId: 'sale-item-1',
              },
            ],
          },
          movements: [{ insumoId: 'ins-1', quantity: 1, unitCostNio: 2 }],
        },
      ]);

      expect(result.results).toEqual([
        expect.objectContaining({
          status: 'REJECTED',
          retryable: false,
          code: 'CREDIT_NOTE_STOCK_REPLAY_UNSUPPORTED',
        }),
      ]);
      expect(movementRepo.create).not.toHaveBeenCalled();
      expect(txManager.save).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ sourceDocumentType: 'CREDIT_NOTE' }),
      );
    });

    it('rejects CREDIT_NOTE restock when origin sale Kardex snapshots are missing', async () => {
      invoiceRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 'sale-origin-1',
        tenant_id: 'tenant-1',
        type: 'regular',
      });
      itemRepo.find.mockResolvedValue([
        {
          id: 'sale-item-1',
          tenant_id: 'tenant-1',
          invoiceId: 'sale-origin-1',
          quantity: 2,
        },
      ]);
      receiptRepo.findOne.mockResolvedValue(null);
      txManager.find.mockResolvedValueOnce([]);

      const result = await service.syncBatch('tenant-1', [
        {
          idempotencyKey: 'credit-note-restock-policy',
          sourceDeviceId: 'd1',
          sourceSequence: 1,
          flowType: 'sales',
          documentType: 'CREDIT_NOTE',
          invoice: {
            ...baseInvoice,
            type: 'creditNote',
            originInvoiceId: 'sale-origin-1',
            refundReasonPolicy: 'RESTOCK_ORIGINAL_BOM',
            items: [
              {
                ...baseInvoice.items[0],
                originInvoiceItemId: 'sale-item-1',
              },
            ],
          },
        },
      ]);

      expect(result.results).toEqual([
        expect.objectContaining({
          status: 'REJECTED',
          retryable: false,
          code: 'CREDIT_NOTE_ORIGIN_MOVEMENT_MISSING',
        }),
      ]);
      expect(movementRepo.create).not.toHaveBeenCalled();
    });

    it('appends CREDIT_NOTE Kardex compensation from origin sale movement snapshots for restock policy', async () => {
      invoiceRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 'sale-origin-1',
        tenant_id: 'tenant-1',
        type: 'regular',
      });
      itemRepo.find.mockResolvedValue([
        {
          id: 'sale-item-1',
          tenant_id: 'tenant-1',
          invoiceId: 'sale-origin-1',
          quantity: 2,
        },
      ]);
      receiptRepo.findOne.mockResolvedValue(null);
      txManager.find.mockResolvedValueOnce([
        {
          id: '3001',
          tenant_id: 'tenant-1',
          insumoId: 'ins-bun',
          type: MovementType.SALE,
          quantity: -4,
          unitCostNio: 3.5,
          averageCostAfterNio: 3.5,
          originInvoiceItemId: 'sale-item-1',
          idempotencyKey: 'sale-key:sale-item-1:ins-bun',
          sourceDocumentId: 'invoice:sale-origin-1',
          sourceDocumentType: MovementType.SALE,
        },
      ]);
      txManager.createQueryBuilder().getOne.mockResolvedValueOnce({
        id: 'ins-bun',
        stock: 6,
        averageCost: 9.25,
        negativeStockPolicy: NEGATIVE_STOCK_POLICY.RESTRICT,
        tenant_id: 'tenant-1',
      });

      const result = await service.syncBatch('tenant-1', [
        {
          idempotencyKey: 'credit-note-restock-accepted',
          sourceDeviceId: 'd1',
          sourceSequence: 1,
          flowType: 'sales',
          documentType: 'CREDIT_NOTE',
          invoice: {
            ...baseInvoice,
            id: 'credit-note-1',
            type: 'creditNote',
            originInvoiceId: 'sale-origin-1',
            refundReasonPolicy: 'RESTOCK_ORIGINAL_BOM',
            items: [
              {
                ...baseInvoice.items[0],
                id: 'credit-note-item-1',
                quantity: -1,
                originInvoiceItemId: 'sale-item-1',
              },
            ],
          },
        },
      ]);

      expect(result.results).toEqual([
        expect.objectContaining({ status: 'ACCEPTED', code: 'APPLIED' }),
      ]);
      const originMovementFindCall = txManager.find.mock.calls.find(
        ([entity]) => entity === InventoryMovement,
      ) as [
        typeof InventoryMovement,
        {
          where: { sourceDocumentId: string; sourceDocumentType: MovementType };
        },
      ];
      expect(originMovementFindCall[1].where).toMatchObject({
        sourceDocumentId: 'invoice:sale-origin-1',
        sourceDocumentType: MovementType.SALE,
      });
      expect(movementRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MovementType.CREDIT_NOTE_RESTOCK,
          quantity: 2,
          previousStock: 6,
          newStock: 8,
          unitCostNio: 3.5,
          averageCostAfterNio: 9.25,
          originMovementId: '3001',
          compensationForKardexId: '3001',
          originInvoiceItemId: 'sale-item-1',
          refundReasonPolicy: 'RESTOCK_ORIGINAL_BOM',
          sourceDocumentType: 'CREDIT_NOTE',
          sourceDocumentId: 'credit-note-1',
        }),
      );
      expect(txManager.save).toHaveBeenCalledWith(
        Insumo,
        expect.objectContaining({
          id: 'ins-bun',
          stock: 8,
          existenciaActual: 8,
        }),
      );
    });

    it('does not bind CREDIT_NOTE restock to an origin movement only because the client-controlled sale idempotency key mentions the origin item id', async () => {
      invoiceRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 'sale-origin-1',
        tenant_id: 'tenant-1',
        type: 'regular',
      });
      itemRepo.find.mockResolvedValue([
        {
          id: 'sale-item-1',
          tenant_id: 'tenant-1',
          invoiceId: 'sale-origin-1',
          quantity: 2,
        },
      ]);
      receiptRepo.findOne.mockResolvedValue(null);
      txManager.find.mockResolvedValueOnce([
        {
          id: '3002',
          tenant_id: 'tenant-1',
          insumoId: 'ins-bun',
          type: MovementType.SALE,
          quantity: -4,
          unitCostNio: 3.5,
          averageCostAfterNio: 3.5,
          idempotencyKey:
            'client-prefix:sale-item-1:spoofed:sale-item-2:ins-bun',
          sourceDocumentId: 'invoice:sale-origin-1',
          sourceDocumentType: MovementType.SALE,
        },
      ]);

      const result = await service.syncBatch('tenant-1', [
        {
          idempotencyKey: 'credit-note-restock-spoofed-binding',
          sourceDeviceId: 'd1',
          sourceSequence: 1,
          flowType: 'sales',
          documentType: 'CREDIT_NOTE',
          invoice: {
            ...baseInvoice,
            id: 'credit-note-spoofed-binding',
            type: 'creditNote',
            originInvoiceId: 'sale-origin-1',
            refundReasonPolicy: 'RESTOCK_ORIGINAL_BOM',
            items: [
              {
                ...baseInvoice.items[0],
                id: 'credit-note-spoofed-binding-item',
                quantity: -1,
                originInvoiceItemId: 'sale-item-1',
              },
            ],
          },
        },
      ]);

      expect(result.results).toEqual([
        expect.objectContaining({
          status: 'REJECTED',
          retryable: false,
          code: 'CREDIT_NOTE_ORIGIN_MOVEMENT_MISSING',
        }),
      ]);
      expect(movementRepo.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ originMovementId: '3002' }),
      );
    });

    it('rejects originless SALE movements even when the idempotency key ends with the requested origin item and insumo ids', async () => {
      invoiceRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 'sale-origin-1',
        tenant_id: 'tenant-1',
        type: 'regular',
      });
      itemRepo.find.mockResolvedValue([
        {
          id: 'sale-item-1',
          tenant_id: 'tenant-1',
          invoiceId: 'sale-origin-1',
          quantity: 2,
        },
      ]);
      receiptRepo.findOne.mockResolvedValue(null);
      txManager.find.mockResolvedValueOnce([
        {
          id: '3003',
          tenant_id: 'tenant-1',
          insumoId: 'ins-bun',
          type: MovementType.SALE,
          quantity: -4,
          unitCostNio: 3.5,
          averageCostAfterNio: 3.5,
          originInvoiceItemId: null,
          idempotencyKey: 'client-controlled:sale-item-1:ins-bun',
          sourceDocumentId: 'invoice:sale-origin-1',
          sourceDocumentType: MovementType.SALE,
        },
      ]);

      const result = await service.syncBatch('tenant-1', [
        {
          idempotencyKey: 'credit-note-originless-sale-spoofed-suffix',
          sourceDeviceId: 'd1',
          sourceSequence: 1,
          flowType: 'sales',
          documentType: 'CREDIT_NOTE',
          invoice: {
            ...baseInvoice,
            id: 'credit-note-originless-sale-spoofed-suffix',
            type: 'creditNote',
            originInvoiceId: 'sale-origin-1',
            refundReasonPolicy: 'RESTOCK_ORIGINAL_BOM',
            items: [
              {
                ...baseInvoice.items[0],
                id: 'credit-note-originless-sale-spoofed-suffix-item',
                quantity: -1,
                originInvoiceItemId: 'sale-item-1',
              },
            ],
          },
        },
      ]);

      expect(result.results).toEqual([
        expect.objectContaining({
          status: 'REJECTED',
          retryable: false,
          code: 'CREDIT_NOTE_ORIGIN_MOVEMENT_MISSING',
        }),
      ]);
      expect(movementRepo.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ originMovementId: '3003' }),
      );
    });

    it('rejects CREDIT_NOTE restock when the refund quantity is zero', async () => {
      invoiceRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 'sale-origin-1',
        tenant_id: 'tenant-1',
        type: 'regular',
      });
      itemRepo.find.mockResolvedValue([
        {
          id: 'sale-item-1',
          tenant_id: 'tenant-1',
          invoiceId: 'sale-origin-1',
          quantity: 2,
        },
      ]);
      receiptRepo.findOne.mockResolvedValue(null);

      const result = await service.syncBatch('tenant-1', [
        {
          idempotencyKey: 'credit-note-zero-restock',
          sourceDeviceId: 'd1',
          sourceSequence: 1,
          flowType: 'sales',
          documentType: 'CREDIT_NOTE',
          invoice: {
            ...baseInvoice,
            id: 'credit-note-zero',
            type: 'creditNote',
            originInvoiceId: 'sale-origin-1',
            refundReasonPolicy: 'RESTOCK_ORIGINAL_BOM',
            items: [
              {
                ...baseInvoice.items[0],
                id: 'credit-note-zero-item',
                quantity: 0,
                originInvoiceItemId: 'sale-item-1',
              },
            ],
          },
        },
      ]);

      expect(result.results).toEqual([
        expect.objectContaining({
          status: 'REJECTED',
          retryable: false,
          code: 'CREDIT_NOTE_REFUND_QUANTITY_INVALID',
        }),
      ]);
      expect(movementRepo.create).not.toHaveBeenCalled();
      expect(receiptRepo.save).not.toHaveBeenCalled();
    });

    it('rejects CREDIT_NOTE restock when the refund quantity exceeds the origin item quantity', async () => {
      invoiceRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 'sale-origin-1',
        tenant_id: 'tenant-1',
        type: 'regular',
      });
      itemRepo.find.mockResolvedValue([
        {
          id: 'sale-item-1',
          tenant_id: 'tenant-1',
          invoiceId: 'sale-origin-1',
          quantity: 2,
        },
      ]);
      receiptRepo.findOne.mockResolvedValue(null);

      const result = await service.syncBatch('tenant-1', [
        {
          idempotencyKey: 'credit-note-over-restock',
          sourceDeviceId: 'd1',
          sourceSequence: 1,
          flowType: 'sales',
          documentType: 'CREDIT_NOTE',
          invoice: {
            ...baseInvoice,
            id: 'credit-note-over',
            type: 'creditNote',
            originInvoiceId: 'sale-origin-1',
            refundReasonPolicy: 'RESTOCK_ORIGINAL_BOM',
            items: [
              {
                ...baseInvoice.items[0],
                id: 'credit-note-over-item',
                quantity: -3,
                originInvoiceItemId: 'sale-item-1',
              },
            ],
          },
        },
      ]);

      expect(result.results).toEqual([
        expect.objectContaining({
          status: 'REJECTED',
          retryable: false,
          code: 'CREDIT_NOTE_REFUND_QUANTITY_INVALID',
        }),
      ]);
      expect(movementRepo.create).not.toHaveBeenCalled();
      expect(receiptRepo.save).not.toHaveBeenCalled();
    });

    it('rejects cumulative CREDIT_NOTE restock that would exceed the origin movement quantity', async () => {
      invoiceRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 'sale-origin-1',
        tenant_id: 'tenant-1',
        type: 'regular',
      });
      itemRepo.find.mockResolvedValue([
        {
          id: 'sale-item-1',
          tenant_id: 'tenant-1',
          invoiceId: 'sale-origin-1',
          quantity: 2,
        },
      ]);
      receiptRepo.findOne.mockResolvedValue(null);
      txManager.find
        .mockResolvedValueOnce([
          {
            id: '3001',
            tenant_id: 'tenant-1',
            insumoId: 'ins-bun',
            type: MovementType.SALE,
            quantity: -4,
            unitCostNio: 3.5,
            originInvoiceItemId: 'sale-item-1',
            idempotencyKey: 'sale-key:sale-item-1:ins-bun',
            sourceDocumentId: 'invoice:sale-origin-1',
            sourceDocumentType: MovementType.SALE,
          },
        ])
        .mockResolvedValueOnce([
          {
            id: '3100',
            tenant_id: 'tenant-1',
            type: MovementType.CREDIT_NOTE_RESTOCK,
            quantity: 3,
            sourceDocumentId: 'credit-note-prior',
            sourceDocumentType: 'CREDIT_NOTE',
            originMovementId: '3001',
            originInvoiceItemId: 'sale-item-1',
          },
        ]);

      const result = await service.syncBatch('tenant-1', [
        {
          idempotencyKey: 'credit-note-cumulative-over-restock',
          sourceDeviceId: 'd1',
          sourceSequence: 1,
          flowType: 'sales',
          documentType: 'CREDIT_NOTE',
          invoice: {
            ...baseInvoice,
            id: 'credit-note-cumulative-over',
            type: 'creditNote',
            originInvoiceId: 'sale-origin-1',
            refundReasonPolicy: 'RESTOCK_ORIGINAL_BOM',
            items: [
              {
                ...baseInvoice.items[0],
                id: 'credit-note-cumulative-over-item',
                quantity: -1,
                originInvoiceItemId: 'sale-item-1',
              },
            ],
          },
        },
      ]);

      expect(result.results).toEqual([
        expect.objectContaining({
          status: 'REJECTED',
          retryable: false,
          code: 'CREDIT_NOTE_RESTOCK_QUANTITY_EXCEEDED',
        }),
      ]);
      expect(movementRepo.create).not.toHaveBeenCalled();
      expect(receiptRepo.save).not.toHaveBeenCalled();
    });

    it('does not append duplicate compensation for the same credit note and origin movement with a new accepted sequence', async () => {
      invoiceRepo.findOne.mockResolvedValueOnce({
        id: 'credit-note-duplicate',
        number: baseInvoice.number,
        created_at: new Date(baseInvoice.createdAt),
        userId: baseInvoice.userId,
        subtotal: baseInvoice.subtotal,
        totalTax: baseInvoice.totalTax,
        total: baseInvoice.total,
        isCanceled: false,
        voidReason: null,
        paymentStatus: baseInvoice.paymentStatus,
        customerId: null,
        globalTaxOverride: false,
        type: 'creditNote',
        relatedInvoiceId: null,
        originInvoiceId: 'sale-origin-1',
        refundReasonCode: 'DAMAGED_RETURN',
        refundReasonPolicy: 'RESTOCK_ORIGINAL_BOM',
        authorizedByUserId: 'manager-1',
        authorizedByRole: 'manager',
        tenant_id: 'tenant-1',
        items: [
          {
            ...baseInvoice.items[0],
            id: 'credit-note-duplicate-item',
            invoiceId: 'credit-note-duplicate',
            quantity: -1,
            tenant_id: 'tenant-1',
            originInvoiceItemId: 'sale-item-1',
          },
        ],
        payments: [],
      });
      receiptRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ source_sequence: '1' });
      itemRepo.find.mockResolvedValue([
        {
          id: 'sale-item-1',
          tenant_id: 'tenant-1',
          invoiceId: 'sale-origin-1',
          quantity: 2,
        },
      ]);
      txManager.find
        .mockResolvedValueOnce([
          {
            id: '3001',
            tenant_id: 'tenant-1',
            insumoId: 'ins-bun',
            type: MovementType.SALE,
            quantity: -4,
            unitCostNio: 3.5,
            originInvoiceItemId: 'sale-item-1',
            idempotencyKey: 'sale-key:sale-item-1:ins-bun',
            sourceDocumentId: 'invoice:sale-origin-1',
            sourceDocumentType: MovementType.SALE,
          },
        ])
        .mockResolvedValueOnce([
          {
            id: '3100',
            tenant_id: 'tenant-1',
            type: MovementType.CREDIT_NOTE_RESTOCK,
            quantity: 2,
            sourceDocumentId: 'credit-note-duplicate',
            sourceDocumentType: 'CREDIT_NOTE',
            originMovementId: '3001',
            originInvoiceItemId: 'sale-item-1',
          },
        ]);

      const result = await service.syncBatch('tenant-1', [
        {
          idempotencyKey: 'credit-note-duplicate-new-key',
          sourceDeviceId: 'd1',
          sourceSequence: 2,
          flowType: 'sales',
          documentType: 'CREDIT_NOTE',
          invoice: {
            ...baseInvoice,
            id: 'credit-note-duplicate',
            type: 'creditNote',
            originInvoiceId: 'sale-origin-1',
            refundReasonPolicy: 'RESTOCK_ORIGINAL_BOM',
            items: [
              {
                ...baseInvoice.items[0],
                id: 'credit-note-duplicate-item',
                quantity: -1,
                originInvoiceItemId: 'sale-item-1',
              },
            ],
          },
        },
      ]);

      expect(result.results).toEqual([
        expect.objectContaining({ status: 'ACCEPTED', code: 'APPLIED' }),
      ]);
      expect(movementRepo.create).not.toHaveBeenCalled();
      expect(txManager.save).not.toHaveBeenCalledWith(
        Insumo,
        expect.objectContaining({ id: 'ins-bun' }),
      );
    });

    it('rejects a changed duplicate credit-note replay with a new key before restock compensation', async () => {
      invoiceRepo.findOne.mockResolvedValueOnce({
        id: 'credit-note-changed-duplicate',
        number: baseInvoice.number,
        created_at: new Date(baseInvoice.createdAt),
        userId: baseInvoice.userId,
        subtotal: baseInvoice.subtotal,
        totalTax: baseInvoice.totalTax,
        total: baseInvoice.total,
        isCanceled: false,
        voidReason: null,
        paymentStatus: baseInvoice.paymentStatus,
        customerId: null,
        globalTaxOverride: false,
        type: 'creditNote',
        relatedInvoiceId: null,
        originInvoiceId: 'sale-origin-1',
        refundReasonCode: null,
        refundReasonPolicy: 'RESTOCK_ORIGINAL_BOM',
        tenant_id: 'tenant-1',
        items: [
          {
            ...baseInvoice.items[0],
            id: 'credit-note-changed-duplicate-item',
            invoiceId: 'credit-note-changed-duplicate',
            quantity: -1,
            tenant_id: 'tenant-1',
            originInvoiceItemId: 'sale-item-1',
          },
        ],
        payments: [],
      });
      receiptRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ source_sequence: '1' });

      const result = await service.syncBatch('tenant-1', [
        {
          idempotencyKey: 'credit-note-changed-duplicate-new-key',
          sourceDeviceId: 'd1',
          sourceSequence: 2,
          flowType: 'sales',
          documentType: 'CREDIT_NOTE',
          invoice: {
            ...baseInvoice,
            id: 'credit-note-changed-duplicate',
            total: 12.5,
            type: 'creditNote',
            originInvoiceId: 'sale-origin-1',
            refundReasonPolicy: 'RESTOCK_ORIGINAL_BOM',
            items: [
              {
                ...baseInvoice.items[0],
                id: 'credit-note-changed-duplicate-item',
                quantity: -1,
                originInvoiceItemId: 'sale-item-1',
              },
            ],
          },
        },
      ]);

      expect(result.results).toEqual([
        expect.objectContaining({
          status: 'REJECTED',
          retryable: false,
          code: 'CREDIT_NOTE_PAYLOAD_MISMATCH',
        }),
      ]);
      expect(movementRepo.create).not.toHaveBeenCalled();
      expect(receiptRepo.save).not.toHaveBeenCalled();
    });

    it('rejects CREDIT_NOTE payloads that reuse an existing regular invoice id before upsert', async () => {
      invoiceRepo.findOne.mockResolvedValueOnce({
        id: 'regular-invoice-id',
        tenant_id: 'tenant-1',
        type: 'regular',
      });
      receiptRepo.findOne.mockResolvedValue(null);

      const result = await service.syncBatch('tenant-1', [
        {
          idempotencyKey: 'credit-note-reuses-regular-id',
          sourceDeviceId: 'd1',
          sourceSequence: 1,
          flowType: 'sales',
          documentType: 'CREDIT_NOTE',
          invoice: {
            ...baseInvoice,
            id: 'regular-invoice-id',
            type: 'creditNote',
            originInvoiceId: 'sale-origin-1',
            refundReasonPolicy: 'FINANCIAL_ONLY',
            items: [
              {
                ...baseInvoice.items[0],
                id: 'credit-note-reuses-regular-item',
                originInvoiceItemId: 'sale-item-1',
              },
            ],
          },
        },
      ]);

      expect(result.results).toEqual([
        expect.objectContaining({
          status: 'REJECTED',
          retryable: false,
          code: 'CREDIT_NOTE_INVOICE_ID_COLLISION',
        }),
      ]);
      expect(invoiceRepo.upsert).not.toHaveBeenCalled();
      expect(itemRepo.upsert).not.toHaveBeenCalled();
      expect(receiptRepo.save).not.toHaveBeenCalled();
    });

    it('rejects a CREDIT_NOTE with a missing origin invoice as non-retryable without receipt acceptance', async () => {
      invoiceRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      receiptRepo.findOne.mockResolvedValue(null);

      const result = await service.syncBatch('tenant-1', [
        {
          idempotencyKey: 'credit-note-orphan-origin',
          sourceDeviceId: 'd1',
          sourceSequence: 1,
          flowType: 'sales',
          documentType: 'CREDIT_NOTE',
          invoice: {
            ...baseInvoice,
            type: 'creditNote',
            originInvoiceId: 'missing-sale-origin',
            refundReasonPolicy: 'FINANCIAL_ONLY',
            items: [
              {
                ...baseInvoice.items[0],
                originInvoiceItemId: 'missing-sale-item',
              },
            ],
          },
        },
      ]);

      expect(result.results).toEqual([
        expect.objectContaining({
          status: 'REJECTED',
          retryable: false,
          code: 'CREDIT_NOTE_ORIGIN_MISSING',
        }),
      ]);
      expect(invoiceRepo.upsert).not.toHaveBeenCalled();
      expect(receiptRepo.save).not.toHaveBeenCalled();
    });

    const seedFinancialOnlyCreditNoteOrigin = () => {
      invoiceRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 'sale-origin-1',
        tenant_id: 'tenant-1',
        type: 'regular',
        isCanceled: false,
      });
      itemRepo.find.mockResolvedValueOnce([
        {
          id: 'sale-item-1',
          tenant_id: 'tenant-1',
          invoiceId: 'sale-origin-1',
          quantity: 2,
        },
      ]);
      receiptRepo.findOne.mockResolvedValue(null);
    };

    const buildFinancialOnlyCreditNoteRecord = (
      overrides: Partial<SyncBatchRecordDto> = {},
      invoiceOverrides: Partial<SyncInvoiceDto> = {},
    ): SyncBatchRecordDto => ({
      idempotencyKey: 'credit-note-financial-only',
      sourceDeviceId: 'd1',
      sourceSequence: 1,
      flowType: 'sales',
      documentType: 'CREDIT_NOTE',
      invoice: {
        ...baseInvoice,
        id: 'credit-note-financial-only-invoice',
        type: 'creditNote',
        originInvoiceId: 'sale-origin-1',
        refundReasonPolicy: 'FINANCIAL_ONLY',
        items: [
          {
            ...baseInvoice.items[0],
            id: 'credit-note-financial-only-item',
            quantity: -1,
            originInvoiceItemId: 'sale-item-1',
          },
        ],
        ...invoiceOverrides,
      },
      ...overrides,
    });

    it('accepts and persists a financial-only CREDIT_NOTE authorized by an active same-tenant owner', async () => {
      userRepo.findOne.mockResolvedValueOnce({
        id: 'owner-1',
        tenant_id: 'tenant-1',
        role: UserRole.OWNER,
        is_active: true,
      });
      seedFinancialOnlyCreditNoteOrigin();

      const result = await service.syncBatch('tenant-1', [
        buildFinancialOnlyCreditNoteRecord(
          { idempotencyKey: 'credit-note-owner-authorized' },
          {
            authorizedByUserId: 'owner-1',
            authorizedByRole: 'owner',
          },
        ),
      ]);

      expect(result.results).toEqual([
        expect.objectContaining({
          status: 'ACCEPTED',
          retryable: false,
          code: 'APPLIED',
        }),
      ]);
      expect(invoiceRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'credit-note-financial-only-invoice',
          authorizedByUserId: 'owner-1',
          authorizedByRole: 'owner',
        }),
        ['id'],
      );
      expect(txManager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: 'tenant-1',
          idempotency_key: 'credit-note-owner-authorized',
          result_status: 'ACCEPTED',
          result_code: 'APPLIED',
        }),
      );
      expect(movementRepo.create).not.toHaveBeenCalled();
    });

    it('accepts financial-only CREDIT_NOTE records with deterministic flowType when no inventory movements are requested', async () => {
      seedFinancialOnlyCreditNoteOrigin();

      const result = await service.syncBatch('tenant-1', [
        buildFinancialOnlyCreditNoteRecord(),
      ]);

      expect(result.results).toEqual([
        expect.objectContaining({
          status: 'ACCEPTED',
          retryable: false,
          code: 'APPLIED',
        }),
      ]);
      expect(invoiceRepo.upsert).toHaveBeenCalled();
      expect(movementRepo.create).not.toHaveBeenCalled();
    });

    it('reads invoices through a tenant-bound transaction under FORCE RLS', async () => {
      const txInvoiceRepo = {
        find: jest.fn().mockResolvedValue([{ id: 'inv-tenant' }]),
      };
      txManager.getRepository.mockImplementation((target: unknown) => {
        if (target === Invoice) return txInvoiceRepo;
        return undefined;
      });

      await expect(service.findAll('tenant-rls')).resolves.toEqual([
        { id: 'inv-tenant' },
      ]);

      expect(txManager.query).toHaveBeenCalledWith(
        "SELECT set_config('app.tenant_id', $1, true)",
        ['tenant-rls'],
      );
      expect(txInvoiceRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenant_id: 'tenant-rls' } }),
      );
      expect(invoiceRepo.find).not.toHaveBeenCalled();
    });

    it('reads a single invoice through a tenant-bound transaction under FORCE RLS', async () => {
      const txInvoiceRepo = {
        findOne: jest.fn().mockResolvedValue({ id: 'inv-tenant' }),
      };
      txManager.getRepository.mockImplementation((target: unknown) => {
        if (target === Invoice) return txInvoiceRepo;
        return undefined;
      });

      await expect(
        service.findOne('tenant-rls', 'inv-tenant'),
      ).resolves.toEqual({
        id: 'inv-tenant',
      });

      expect(txManager.query).toHaveBeenCalledWith(
        "SELECT set_config('app.tenant_id', $1, true)",
        ['tenant-rls'],
      );
      expect(txInvoiceRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inv-tenant', tenant_id: 'tenant-rls' },
        }),
      );
      expect(invoiceRepo.findOne).not.toHaveBeenCalled();
    });

    it('performs duplicate receipt checks through a tenant-bound transaction before reading RLS-protected receipts', async () => {
      const txReceiptRepo = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn((x: unknown) => x),
        save: jest.fn(),
      };
      txManager.getRepository.mockImplementation((target: unknown) => {
        if (target === InventorySyncReceipt) return txReceiptRepo;
        if (target === InventorySyncOutbox) return outboxRepo;
        if (target === Invoice) return invoiceRepo;
        if (target === InvoiceItem) return itemRepo;
        if (target === Payment) return paymentRepo;
        return undefined;
      });
      recipeService.findActiveVersion.mockResolvedValue(null);
      txManager.createQueryBuilder().getOne.mockResolvedValue({
        id: 'prod-1',
        stock: 10,
        averageCost: 2,
        negativeStockPolicy: NEGATIVE_STOCK_POLICY.RESTRICT,
        tenant_id: 'tenant-rls',
      });

      await service.syncBatch('tenant-rls', [
        {
          idempotencyKey: 'tenant-bound-receipt-check',
          sourceDeviceId: 'd1',
          sourceSequence: 1,
          flowType: 'sales',
          documentType: 'SALE',
          invoice: baseInvoice,
        },
      ]);

      expect(txManager.query).toHaveBeenCalledWith(
        "SELECT set_config('app.tenant_id', $1, true)",
        ['tenant-rls'],
      );
      expect(txReceiptRepo.findOne).toHaveBeenCalled();
      expect(receiptRepo.findOne).not.toHaveBeenCalled();
      expect(txManager.query.mock.invocationCallOrder[0]).toBeLessThan(
        txReceiptRepo.findOne.mock.invocationCallOrder[0],
      );
    });

    it('stages future records through a tenant-bound transaction before writing RLS-protected outbox rows', async () => {
      const txReceiptRepo = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn((x: unknown) => x),
        save: jest.fn(),
      };
      const txOutboxRepo = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn((x: unknown) => x),
        save: jest.fn(),
        delete: jest.fn(),
      };
      txManager.getRepository.mockImplementation((target: unknown) => {
        if (target === InventorySyncReceipt) return txReceiptRepo;
        if (target === InventorySyncOutbox) return txOutboxRepo;
        return undefined;
      });

      const result = await service.syncBatch('tenant-rls', [
        {
          idempotencyKey: 'future-tenant-bound-outbox',
          sourceDeviceId: 'd1',
          sourceSequence: 3,
          flowType: 'inventory',
          documentType: 'PURCHASE',
          movements: [{ insumoId: 'ins-1', quantity: 1, unitCostNio: 5 }],
        },
      ]);

      expect(result.results).toEqual([
        expect.objectContaining({
          idempotencyKey: 'future-tenant-bound-outbox',
          status: 'STAGED_FUTURE',
          retryable: true,
        }),
      ]);
      expect(txOutboxRepo.save).toHaveBeenCalledTimes(1);
      expect(outboxRepo.save).not.toHaveBeenCalled();
      expect(txManager.query.mock.invocationCallOrder[0]).toBeLessThan(
        txOutboxRepo.findOne.mock.invocationCallOrder[0],
      );
      expect(txManager.query.mock.invocationCallOrder[0]).toBeLessThan(
        txOutboxRepo.save.mock.invocationCallOrder[0],
      );
    });

    it('returns non-retryable CREDIT_NOTE_PAYLOAD_MISMATCH for changed duplicate credit-note payloads at batch level', async () => {
      invoiceRepo.findOne.mockResolvedValueOnce({
        id: 'cn-batch-dup',
        number: 'NC-BATCH-001',
        created_at: new Date('2026-07-10T18:00:00.000Z'),
        userId: 'u-1',
        subtotal: -10,
        totalTax: -1.5,
        total: -11.5,
        isCanceled: false,
        voidReason: null,
        paymentStatus: 'REFUNDED',
        customerId: null,
        globalTaxOverride: false,
        type: 'creditNote',
        relatedInvoiceId: null,
        originInvoiceId: 'sale-origin-1',
        refundReasonCode: 'DAMAGED_RETURN',
        refundReasonPolicy: 'WASTE_NO_RESTOCK',
        items: [
          {
            id: 'cn-batch-item-1',
            productId: 'prod-1',
            productName: 'P1',
            quantity: -1,
            unitPrice: 10,
            originalTaxRate: 0.15,
            appliedTaxRate: 0.15,
            taxAmount: -1.5,
            total: -11.5,
            discount: 0,
            variantId: null,
            notes: null,
            recipeVersionId: null,
            originInvoiceItemId: 'sale-item-1',
          },
        ],
        payments: [],
      });

      const result = await service.syncBatch('tenant-1', [
        {
          idempotencyKey: 'changed-credit-note-payload',
          sourceDeviceId: 'd1',
          sourceSequence: 1,
          flowType: 'sales',
          documentType: 'CREDIT_NOTE',
          invoice: {
            ...baseInvoice,
            id: 'cn-batch-dup',
            number: 'NC-BATCH-001',
            createdAt: '2026-07-10T18:00:00.000Z',
            subtotal: -10,
            totalTax: -1.5,
            total: -12.5,
            paymentStatus: 'REFUNDED',
            type: 'creditNote',
            originInvoiceId: 'sale-origin-1',
            refundReasonCode: 'DAMAGED_RETURN',
            refundReasonPolicy: 'WASTE_NO_RESTOCK',
            items: [
              {
                ...baseInvoice.items[0],
                id: 'cn-batch-item-1',
                quantity: -1,
                unitPrice: 10,
                taxAmount: -1.5,
                total: -12.5,
                originInvoiceItemId: 'sale-item-1',
              },
            ],
          },
        },
      ]);

      expect(result.results).toEqual([
        expect.objectContaining({
          status: 'REJECTED',
          retryable: false,
          code: 'CREDIT_NOTE_PAYLOAD_MISMATCH',
        }),
      ]);
      expect(invoiceRepo.upsert).not.toHaveBeenCalled();
    });

    describe.each<{
      name: string;
      actor: Partial<User> | null;
      invoiceOverrides?: Partial<SyncInvoiceDto>;
    }>([
      {
        name: 'missing actor',
        actor: null,
      },
      {
        name: 'wrong tenant actor',
        actor: {
          id: 'manager-1',
          tenant_id: 'tenant-2',
          role: UserRole.MANAGER,
          is_active: true,
        },
      },
      {
        name: 'inactive actor',
        actor: {
          id: 'manager-1',
          tenant_id: 'tenant-1',
          role: UserRole.MANAGER,
          is_active: false,
        },
      },
      {
        name: 'non-manager/non-owner actor',
        actor: {
          id: 'manager-1',
          tenant_id: 'tenant-1',
          role: UserRole.CASHIER,
          is_active: true,
        },
      },
      {
        name: 'mismatched role metadata',
        actor: {
          id: 'manager-1',
          tenant_id: 'tenant-1',
          role: UserRole.MANAGER,
          is_active: true,
        },
        invoiceOverrides: { authorizedByRole: 'owner' },
      },
    ])(
      'CREDIT_NOTE authorization rejection for $name',
      ({ actor, invoiceOverrides }) => {
        it('returns non-retryable authorization failure and leaves no persistence', async () => {
          userRepo.findOne.mockResolvedValueOnce(actor);
          seedFinancialOnlyCreditNoteOrigin();

          const result = await service.syncBatch('tenant-1', [
            buildFinancialOnlyCreditNoteRecord(
              { idempotencyKey: 'forged-credit-note-auth' },
              invoiceOverrides,
            ),
          ]);

          expect(result.results).toEqual([
            expect.objectContaining({
              status: 'REJECTED',
              retryable: false,
              code: 'CREDIT_NOTE_AUTHORIZATION_INVALID',
            }),
          ]);
          expect(invoiceRepo.upsert).not.toHaveBeenCalled();
          expect(itemRepo.upsert).not.toHaveBeenCalled();
          expect(receiptRepo.save).not.toHaveBeenCalled();
        });
      },
    );

    it('returns IDEMPOTENCY_MISMATCH for legacy idempotency-key duplicates with a different payload hash', async () => {
      const legacyRecord: SyncBatchRecordDto = {
        idempotencyKey: 'legacy-same-key',
        sourceDeviceId: 'legacy-terminal',
        sourceSequence: 1,
        documentType: 'PURCHASE',
        movements: [{ insumoId: 'ins-1', quantity: 2, unitCostNio: 4 }],
      };
      receiptRepo.findOne.mockResolvedValueOnce({
        id: 'legacy-existing-key',
        idempotency_key: legacyRecord.idempotencyKey,
        source_device_id: legacyRecord.sourceDeviceId,
        source_sequence: String(legacyRecord.sourceSequence),
        payload_hash: 'different-legacy-payload-hash',
        result_status: 'ACCEPTED',
      });

      const result = await service.syncBatch('tenant-1', [legacyRecord]);

      expect(result.results).toEqual([
        expect.objectContaining({
          idempotencyKey: 'legacy-same-key',
          status: 'IDEMPOTENCY_MISMATCH',
          retryable: false,
          code: 'CRITICAL_PAYLOAD_MISMATCH',
        }),
      ]);
      expect(result).toMatchObject({
        received: 1,
        processed: 0,
        duplicates: 0,
      });
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(movementRepo.create).not.toHaveBeenCalled();
    });

    it('returns IDEMPOTENCY_MISMATCH for legacy source-sequence duplicates with a different payload hash', async () => {
      const legacyRecord: SyncBatchRecordDto = {
        idempotencyKey: 'legacy-new-key-same-sequence',
        sourceDeviceId: 'legacy-terminal',
        sourceSequence: 7,
        documentType: 'PURCHASE',
        movements: [{ insumoId: 'ins-1', quantity: 1, unitCostNio: 5 }],
      };
      receiptRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 'legacy-existing-sequence',
        idempotency_key: 'legacy-old-key',
        source_device_id: legacyRecord.sourceDeviceId,
        source_sequence: String(legacyRecord.sourceSequence),
        payload_hash: 'different-legacy-sequence-payload-hash',
        result_status: 'ACCEPTED',
      });

      const result = await service.syncBatch('tenant-1', [legacyRecord]);

      expect(result.results).toEqual([
        expect.objectContaining({
          idempotencyKey: 'legacy-new-key-same-sequence',
          status: 'IDEMPOTENCY_MISMATCH',
          retryable: false,
          code: 'CRITICAL_SEQUENCE_PAYLOAD_MISMATCH',
        }),
      ]);
      expect(result).toMatchObject({
        received: 1,
        processed: 0,
        duplicates: 0,
      });
      expect(dataSource.transaction).toHaveBeenCalledTimes(2);
      expect(movementRepo.create).not.toHaveBeenCalled();
    });
  });
});
