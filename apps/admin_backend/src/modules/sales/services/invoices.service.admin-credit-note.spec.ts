import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { InvoicesService } from './invoices.service';
import { Invoice } from '../entities/invoice.entity';
import { InvoiceItem } from '../entities/invoice-item.entity';
import { Payment } from '../entities/payment.entity';
import { InventoryMovement } from '../../inventory/entities/inventory-movement.entity';
import { InventorySyncReceipt } from '../../inventory/entities/inventory-sync-receipt.entity';
import { InventorySyncOutbox } from '../../inventory/entities/inventory-sync-outbox.entity';
import { RecipeService } from '../../inventory/recipe.service';
import { BomExplosionService } from '../../inventory/bom-explosion.service';
import { User, UserRole } from '../../identity/entities/user.entity';
import {
  SystemParametersConfig,
  SystemParametersConfigActiveView,
} from '../../inventory/entities/system-parameters-config.entity';
import {
  CreateAdminCreditNoteDto,
  CreateAdminCreditNoteItemDto,
} from '../dto/admin-credit-note.dto';

/**
 * B1c-2 slice A (D-14, #553 part 2): server-side credit-note issuance.
 * Service-level behaviours: sequential number allocation from the
 * configured series, fail-closed named errors with zero rows written, the
 * origin/quantity/actor rejections, and the B0.4 unique-constraint
 * backstop.
 */
describe('InvoicesService.createAdminCreditNote', () => {
  let service: InvoicesService;
  let invoiceRepo: {
    insert: jest.Mock;
    findOne: jest.Mock;
    upsert: jest.Mock;
    create: jest.Mock;
  };
  let itemRepo: { insert: jest.Mock; find: jest.Mock; upsert: jest.Mock };
  let paymentRepo: { upsert: jest.Mock };
  let userRepo: { findOne: jest.Mock };
  let seriesParamRepo: { insert: jest.Mock; create: jest.Mock };
  let seriesViewRepo: { findOne: jest.Mock };
  let receiptRepo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let outboxRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
  };
  let movementRepo: { create: jest.Mock; save: jest.Mock };
  let recipeService: { findActiveVersion: jest.Mock; getSnapshot: jest.Mock };
  let bomExplosionService: { explode: jest.Mock };
  let txManager: {
    query: jest.Mock;
    save: jest.Mock;
    getRepository: jest.Mock;
    findOne: jest.Mock;
    find: jest.Mock;
  };
  let dataSource: { transaction: jest.Mock };

  const originInvoice = {
    id: 'origin-1',
    tenant_id: 'tenant-1',
    number: '001-001-01-00000010',
    type: 'regular',
    isCanceled: false,
    customerId: 'cust-1',
    bcnOfficialRate: 36.6241,
    commercialRate: 36.5,
  };

  const originItem = {
    id: 'origin-item-1',
    tenant_id: 'tenant-1',
    invoiceId: 'origin-1',
    productId: 'prod-1',
    productName: 'Café Espresso',
    quantity: 2,
    unitPrice: 50,
    originalTaxRate: 0.15,
    appliedTaxRate: 0.15,
    taxAmount: 15,
    total: 115,
  };

  const seriesRow = (nextNumber: number) => ({
    tenant_id: 'tenant-1',
    paramKey: 'CREDIT_NOTE_SERIES',
    paramValue: { prefix: 'NC-', nextNumber, endNumber: 60 },
    version: 7,
  });

  const dto = (): CreateAdminCreditNoteDto => ({
    originInvoiceId: 'origin-1',
    refundReasonCode: 'ERROR_DE_CAPTURA',
    refundReasonPolicy: 'FINANCIAL_ONLY',
    items: [
      { originInvoiceItemId: 'origin-item-1', quantity: 1 },
    ] as CreateAdminCreditNoteItemDto[],
    notes: 'Corrección administrativa',
  });

  const authorizer = { userId: 'owner-1', role: UserRole.OWNER };

  beforeEach(async () => {
    invoiceRepo = {
      insert: jest.fn().mockResolvedValue({ identifiers: [{ id: 'cn-1' }] }),
      findOne: jest.fn().mockResolvedValue(originInvoice),
      upsert: jest.fn(),
      create: jest.fn((x: unknown) => x),
    };
    itemRepo = {
      insert: jest.fn().mockResolvedValue({ identifiers: [] }),
      find: jest.fn().mockResolvedValue([originItem]),
      upsert: jest.fn(),
    };
    paymentRepo = { upsert: jest.fn() };
    userRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'owner-1',
        tenant_id: 'tenant-1',
        role: UserRole.OWNER,
        is_active: true,
      }),
    };
    seriesParamRepo = {
      insert: jest.fn().mockResolvedValue({ identifiers: [] }),
      create: jest.fn((x: unknown) => x),
    };
    seriesViewRepo = {
      findOne: jest.fn().mockResolvedValue(seriesRow(40)),
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
    movementRepo = {
      create: jest.fn((x: unknown) => x),
      save: jest.fn(),
    };
    recipeService = {
      findActiveVersion: jest.fn(),
      getSnapshot: jest.fn(),
    };
    bomExplosionService = { explode: jest.fn() };

    txManager = {
      query: jest.fn().mockResolvedValue([]),
      save: jest.fn(),
      getRepository: jest.fn((target: unknown) => {
        if (target === Invoice) return invoiceRepo;
        if (target === InvoiceItem) return itemRepo;
        if (target === Payment) return paymentRepo;
        if (target === User) return userRepo;
        if (target === SystemParametersConfig) return seriesParamRepo;
        if (target === SystemParametersConfigActiveView) return seriesViewRepo;
        return undefined;
      }),
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    };
    dataSource = {
      transaction: jest.fn(
        async (_iso: unknown, cb: (m: unknown) => Promise<unknown>) =>
          cb(txManager),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoicesService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(Invoice), useValue: invoiceRepo },
        { provide: getRepositoryToken(InvoiceItem), useValue: itemRepo },
        { provide: getRepositoryToken(Payment), useValue: paymentRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
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
        { provide: RecipeService, useValue: recipeService },
        { provide: BomExplosionService, useValue: bomExplosionService },
        // The series machinery runs through the transaction manager's
        // getRepository dispatch, but the service also declares these
        // entities are registered app-wide; no direct injection needed.
        { provide: getRepositoryToken(SystemParametersConfig), useValue: {} },
        {
          provide: getRepositoryToken(SystemParametersConfigActiveView),
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<InvoicesService>(InvoicesService);
  });

  it('allocates sequential numbers from the configured series across two calls', async () => {
    let currentSeries = seriesRow(40);
    seriesViewRepo.findOne.mockImplementation(async () => currentSeries);
    seriesParamRepo.insert.mockImplementation(
      async (row: { paramValue: Record<string, unknown> }) => {
        currentSeries = {
          ...currentSeries,
          paramValue: { ...currentSeries.paramValue, ...row.paramValue },
        };
        return { identifiers: [] };
      },
    );

    const first = await service.createAdminCreditNote(
      'tenant-1',
      dto(),
      authorizer,
    );
    const second = await service.createAdminCreditNote(
      'tenant-1',
      dto(),
      authorizer,
    );

    expect(first.number).toBe('NC-40');
    expect(second.number).toBe('NC-41');
    expect(first.id).toBe('cn-1');
    expect(first.originInvoiceNumber).toBe('001-001-01-00000010');
    // The supersession row carries the advanced counter.
    expect(seriesParamRepo.insert).toHaveBeenCalledTimes(2);
    const firstInsert = seriesParamRepo.insert.mock.calls[0][0];
    const secondInsert = seriesParamRepo.insert.mock.calls[1][0];
    expect(firstInsert.paramValue).toMatchObject({
      prefix: 'NC-',
      nextNumber: 41,
      endNumber: 60,
    });
    expect(secondInsert.paramValue).toMatchObject({ nextNumber: 42 });
    // The document is INSERT-only and carries the principal-derived authorizer.
    const insertedInvoice = invoiceRepo.insert.mock.calls[0][0];
    expect(insertedInvoice.type).toBe('creditNote');
    expect(insertedInvoice.authorizedByUserId).toBe('owner-1');
    expect(insertedInvoice.authorizedByRole).toBe('owner');
    expect(insertedInvoice.originInvoiceId).toBe('origin-1');
    // Refund item mirrors the origin item with the credit-note sign.
    const insertedItems = itemRepo.insert.mock.calls[0][0];
    expect(insertedItems[0].quantity).toBe(-1);
    expect(insertedItems[0].originInvoiceItemId).toBe('origin-item-1');
  });

  it('rejects with FISCAL_CREDIT_NOTE_SERIES_UNCONFIGURED and writes zero rows when no series exists', async () => {
    seriesViewRepo.findOne.mockResolvedValue(null);

    await expect(
      service.createAdminCreditNote('tenant-1', dto(), authorizer),
    ).rejects.toThrow(/FISCAL_CREDIT_NOTE_SERIES_UNCONFIGURED/);

    expect(seriesParamRepo.insert).not.toHaveBeenCalled();
    expect(invoiceRepo.insert).not.toHaveBeenCalled();
    expect(itemRepo.insert).not.toHaveBeenCalled();
  });

  it('rejects with FISCAL_CREDIT_NOTE_SERIES_EXHAUSTED when nextNumber passed endNumber', async () => {
    seriesViewRepo.findOne.mockResolvedValue(seriesRow(61));

    await expect(
      service.createAdminCreditNote('tenant-1', dto(), authorizer),
    ).rejects.toThrow(/FISCAL_CREDIT_NOTE_SERIES_EXHAUSTED/);

    expect(seriesParamRepo.insert).not.toHaveBeenCalled();
    expect(invoiceRepo.insert).not.toHaveBeenCalled();
  });

  it('rejects with FISCAL_CREDIT_NOTE_SERIES_INVALID on malformed jsonb', async () => {
    seriesViewRepo.findOne.mockResolvedValue({
      tenant_id: 'tenant-1',
      paramKey: 'CREDIT_NOTE_SERIES',
      paramValue: { nextNumber: 'not-a-number' },
      version: 3,
    });

    await expect(
      service.createAdminCreditNote('tenant-1', dto(), authorizer),
    ).rejects.toThrow(/FISCAL_CREDIT_NOTE_SERIES_INVALID/);

    expect(seriesParamRepo.insert).not.toHaveBeenCalled();
    expect(invoiceRepo.insert).not.toHaveBeenCalled();
  });

  it('rejects a canceled origin invoice before any write', async () => {
    invoiceRepo.findOne.mockResolvedValue({
      ...originInvoice,
      isCanceled: true,
    });

    await expect(
      service.createAdminCreditNote('tenant-1', dto(), authorizer),
    ).rejects.toThrow(BadRequestException);

    expect(invoiceRepo.insert).not.toHaveBeenCalled();
  });

  it('rejects an origin invoice that is not a regular sale', async () => {
    invoiceRepo.findOne.mockResolvedValue({
      ...originInvoice,
      type: 'creditNote',
    });

    await expect(
      service.createAdminCreditNote('tenant-1', dto(), authorizer),
    ).rejects.toThrow(BadRequestException);

    expect(invoiceRepo.insert).not.toHaveBeenCalled();
  });

  it('rejects refund quantities above the origin item limit', async () => {
    const overLimit = dto();
    overLimit.items = [{ originInvoiceItemId: 'origin-item-1', quantity: 3 }];

    await expect(
      service.createAdminCreditNote('tenant-1', overLimit, authorizer),
    ).rejects.toThrow(/refund quantity exceeds the origin item quantity/);

    expect(invoiceRepo.insert).not.toHaveBeenCalled();
  });

  it('rejects an inactive or cross-role authorizing actor', async () => {
    userRepo.findOne.mockResolvedValue({
      id: 'owner-1',
      tenant_id: 'tenant-1',
      role: UserRole.CASHIER,
      is_active: true,
    });

    await expect(
      service.createAdminCreditNote('tenant-1', dto(), authorizer),
    ).rejects.toThrow(BadRequestException);

    expect(invoiceRepo.insert).not.toHaveBeenCalled();
  });

  it('surfaces a named conflict when the B0.4 unique constraint fires anyway', async () => {
    invoiceRepo.insert.mockRejectedValue(
      Object.assign(new Error('duplicate key'), { code: '23505' }),
    );

    await expect(
      service.createAdminCreditNote('tenant-1', dto(), authorizer),
    ).rejects.toThrow(ConflictException);
  });

  it('requires an active same-tenant authorizer that matches the principal role', async () => {
    userRepo.findOne.mockResolvedValue(null);

    await expect(
      service.createAdminCreditNote('tenant-1', dto(), authorizer),
    ).rejects.toThrow(/authorizing actor/);

    expect(invoiceRepo.insert).not.toHaveBeenCalled();
  });
});
