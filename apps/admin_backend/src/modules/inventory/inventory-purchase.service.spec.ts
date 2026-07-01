import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import {
  CURRENCY,
  FX_RATE_RESOLVER,
  InventoryPurchaseService,
} from './inventory-purchase.service';
import { Batch } from './entities/batch.entity';
import { Insumo } from './entities/insumo.entity';
import { InventoryMovement } from './entities/inventory-movement.entity';
import { Supplier } from './entities/supplier.entity';
import { PurchaseDocument } from './entities/purchase-document.entity';

describe('InventoryPurchaseService', () => {
  let service: InventoryPurchaseService;
  const resolveBcnRateByDate = jest.fn();
  const transaction = jest.fn();
  const findOne = jest.fn();

  const manager = {
    createQueryBuilder: jest.fn(),
    findOne: jest.fn(),
    query: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  };

  const queryBuilder = {
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  };

  const dataSource = {
    transaction,
    getRepository: jest.fn().mockReturnValue({ findOne }),
  };

  const perishableInsumo: Partial<Insumo> = {
    id: 'ins-1',
    tenant_id: 'tenant-A',
    stock: 10,
    averageCost: 50,
    existenciaActual: 10,
    is_perishable: true,
  };
  const supplier = {
    id: 'sup-1',
    tenant_id: 'tenant-A',
    name: 'Proveedor X',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    manager.createQueryBuilder.mockReturnValue(queryBuilder);
    transaction.mockImplementation(
      (
        _isolation: string,
        handler: (entityManager: typeof manager) => unknown,
      ) => handler(manager),
    );
    findOne.mockResolvedValue(perishableInsumo);
    queryBuilder.getOne.mockResolvedValue({ ...perishableInsumo });
    manager.findOne.mockImplementation((entity: unknown) => {
      if (entity === Supplier) {
        return Promise.resolve(supplier);
      }

      if (entity === PurchaseDocument) {
        return Promise.resolve(null);
      }

      return Promise.resolve(null);
    });
    manager.create.mockImplementation(
      (_entity: unknown, payload: Record<string, unknown>) => payload,
    );
    manager.query.mockResolvedValue(undefined);
    manager.save.mockImplementation(
      (_entity: unknown, payload: Record<string, unknown>) => payload,
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryPurchaseService,
        {
          provide: DataSource,
          useValue: dataSource,
        },
        {
          provide: FX_RATE_RESOLVER,
          useValue: { resolveBcnRateByDate },
        },
      ],
    }).compile();

    service = module.get<InventoryPurchaseService>(InventoryPurchaseService);
  });

  it('uses the explicit USD document rate without resolver fallback', async () => {
    const preview = await service.previewPurchase({
      id: 'preview-doc-1',
      tenantId: 'tenant-A',
      insumoId: 'ins-1',
      supplierId: 'sup-1',
      invoiceNumber: 'INV-PREVIEW-1',
      quantity: 10,
      unitCost: 2,
      currency: CURRENCY.USD,
      invoiceDate: '2026-01-01',
      entryTimestamp: '2026-01-01T08:00:00.000Z',
      bcnRate: 36.5,
    });

    expect(resolveBcnRateByDate).not.toHaveBeenCalled();
    expect(preview.bcnRate).toBe(36.5);
    expect(preview.unitCostNio).toBe(73);
    expect(preview.projectedCppNio).toBe(61.5);
    expect(preview.requiresBatchTracking).toBe(true);
  });

  it('resolves the official USD rate by invoice date when official mode is requested', async () => {
    resolveBcnRateByDate.mockResolvedValue(36.7123);

    const preview = await service.previewPurchase({
      id: 'preview-doc-official-1',
      tenantId: 'tenant-A',
      insumoId: 'ins-1',
      supplierId: 'sup-1',
      invoiceNumber: 'INV-PREVIEW-OFFICIAL-1',
      quantity: 2,
      unitCost: 10,
      currency: CURRENCY.USD,
      invoiceDate: '2026-01-06',
      entryTimestamp: '2026-01-06T08:00:00.000Z',
      fxRateMode: 'official',
    });

    expect(resolveBcnRateByDate).toHaveBeenCalledWith('2026-01-06');
    expect(preview.bcnRate).toBe(36.7123);
    expect(preview.bcnRateSource).toBe('Official BCN rate by invoice date');
    expect(preview.unitCostNio).toBe(367.123);
    expect(preview.projectedCppNio).toBe(102.8538);
  });

  it('keeps NIO purchases in NIO-only CPP input rounded to 4 decimals', async () => {
    queryBuilder.getOne.mockResolvedValue({
      ...perishableInsumo,
      is_perishable: false,
    });
    findOne.mockResolvedValue({
      ...perishableInsumo,
      is_perishable: false,
    });

    const preview = await service.previewPurchase({
      id: 'preview-doc-2',
      tenantId: 'tenant-A',
      insumoId: 'ins-1',
      supplierId: 'sup-1',
      invoiceNumber: 'INV-PREVIEW-2',
      quantity: 1,
      unitCost: 10.123456,
      currency: CURRENCY.NIO,
      invoiceDate: '2026-01-02',
      entryTimestamp: '2026-01-02T08:00:00.000Z',
    });

    expect(resolveBcnRateByDate).not.toHaveBeenCalled();
    expect(preview.bcnRate).toBe(1);
    expect(preview.unitCostNio).toBe(10.1235);
  });

  it('persists a batch for perishable purchases during posting', async () => {
    const result = await service.recordPurchase({
      id: 'purchase-doc-1',
      tenantId: 'tenant-A',
      insumoId: 'ins-1',
      supplierId: 'sup-1',
      invoiceNumber: 'INV-1001',
      quantity: 5,
      unitCost: 2,
      currency: CURRENCY.USD,
      invoiceDate: '2026-01-03',
      entryTimestamp: '2026-01-03T08:15:00.000Z',
      bcnRate: 36.5,
      lotCode: 'LOT-9',
      receivedDate: '2026-01-03',
      expirationDate: '2026-02-03',
    });

    expect(resolveBcnRateByDate).not.toHaveBeenCalled();

    const savedEntities = manager.save.mock.calls.map(
      ([entity]: [unknown, ...unknown[]]) => entity,
    );
    expect(savedEntities.indexOf(PurchaseDocument)).toBeLessThan(
      savedEntities.indexOf(InventoryMovement),
    );
    expect(manager.save).toHaveBeenCalledWith(
      PurchaseDocument,
      expect.objectContaining({
        id: 'purchase-doc-1',
        supplier_id: 'sup-1',
        invoice_number: 'INV-1001',
        invoice_date: new Date('2026-01-03'),
        entry_date: new Date('2026-01-03'),
        entry_timestamp: new Date('2026-01-03T08:15:00.000Z'),
      }),
    );

    expect(manager.save).toHaveBeenCalledWith(
      Batch,
      expect.objectContaining({
        batch_number: 'LOT-9',
        received_date: new Date('2026-01-03'),
        expiration_date: new Date('2026-02-03'),
        remaining_stock: 5,
        cost: 73,
      }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      InventoryMovement,
      expect.objectContaining({
        type: 'PURCHASE',
        sourceDocumentType: 'PURCHASE',
        sourceDocumentId: 'purchase-doc-1',
        unitCostNio: 73,
        averageCostAfterNio: 57.6667,
      }),
    );
    expect(result.purchaseDocument.id).toBe('purchase-doc-1');
  });

  it('persists the resolved official USD rate during purchase posting when official mode is requested', async () => {
    queryBuilder.getOne.mockResolvedValue({
      ...perishableInsumo,
      is_perishable: false,
    });
    resolveBcnRateByDate.mockResolvedValue(36.95);

    await service.recordPurchase({
      id: 'purchase-doc-official-1',
      tenantId: 'tenant-A',
      insumoId: 'ins-1',
      supplierId: 'sup-1',
      invoiceNumber: 'INV-OFFICIAL-1001',
      quantity: 2,
      unitCost: 10,
      currency: CURRENCY.USD,
      invoiceDate: '2026-01-07',
      entryTimestamp: '2026-01-07T08:15:00.000Z',
      fxRateMode: 'official',
    });

    expect(resolveBcnRateByDate).toHaveBeenCalledWith('2026-01-07');
    expect(manager.save).toHaveBeenCalledWith(
      PurchaseDocument,
      expect.objectContaining({
        invoice_number: 'INV-OFFICIAL-1001',
        bcn_rate: 36.95,
        unit_cost_nio: 369.5,
        projected_cpp_nio: 103.25,
      }),
    );
  });

  it('binds the tenant RLS context before reading or saving purchase documents', async () => {
    await service.recordPurchase({
      id: 'purchase-doc-rls-1',
      tenantId: 'tenant-A',
      insumoId: 'ins-1',
      supplierId: 'sup-1',
      invoiceNumber: 'INV-RLS-1',
      quantity: 2,
      unitCost: 10,
      currency: CURRENCY.NIO,
      invoiceDate: '2026-01-03',
      entryTimestamp: '2026-01-03T08:15:00.000Z',
      lotCode: 'LOT-9',
      receivedDate: '2026-01-03',
      expirationDate: '2026-02-03',
    });

    expect(manager.query).toHaveBeenCalledWith(
      "SELECT set_config('app.tenant_id', $1, true)",
      ['tenant-A'],
    );
    expect(manager.query.mock.invocationCallOrder[0]).toBeLessThan(
      manager.findOne.mock.invocationCallOrder[0],
    );
  });

  it('keeps earlier purchase snapshots frozen when a later entry recalculates the current average cost', async () => {
    resolveBcnRateByDate.mockResolvedValue(1);

    const state = {
      stock: 10,
      averageCost: 50,
      existenciaActual: 10,
    };
    const movementSnapshots: Array<Record<string, unknown>> = [];

    queryBuilder.getOne.mockImplementation(() =>
      Promise.resolve({
        ...perishableInsumo,
        ...state,
        is_perishable: false,
      }),
    );
    manager.create.mockImplementation((_entity: unknown, payload: unknown) => {
      const created = payload as Record<string, unknown>;
      if (_entity === InventoryMovement) {
        movementSnapshots.push({ ...created });
      }
      return payload;
    });
    manager.save.mockImplementation((entity: unknown, payload: unknown) => {
      if (entity === Insumo) {
        const updated = payload as Partial<Insumo>;
        state.stock = Number(updated.stock);
        state.averageCost = Number(updated.averageCost);
        state.existenciaActual = Number(updated.existenciaActual);
      }

      return payload;
    });

    await service.recordPurchase({
      id: 'purchase-doc-2',
      tenantId: 'tenant-A',
      insumoId: 'ins-1',
      supplierId: 'sup-1',
      invoiceNumber: 'INV-1002',
      quantity: 2,
      unitCost: 40,
      currency: CURRENCY.NIO,
      invoiceDate: '2026-01-03',
      entryTimestamp: '2026-01-03T09:00:00.000Z',
    });
    await service.recordPurchase({
      id: 'purchase-doc-3',
      tenantId: 'tenant-A',
      insumoId: 'ins-1',
      supplierId: 'sup-1',
      invoiceNumber: 'INV-1003',
      quantity: 4,
      unitCost: 30,
      currency: CURRENCY.NIO,
      invoiceDate: '2026-01-04',
      entryTimestamp: '2026-01-04T09:00:00.000Z',
    });

    expect(movementSnapshots).toEqual([
      expect.objectContaining({
        unitCostNio: 40,
        averageCostAfterNio: 48.3333,
      }),
      expect.objectContaining({
        unitCostNio: 30,
        averageCostAfterNio: 43.75,
      }),
    ]);
  });

  it('rejects perishable purchases without batch metadata', async () => {
    await expect(
      service.recordPurchase({
        id: 'purchase-doc-4',
        tenantId: 'tenant-A',
        insumoId: 'ins-1',
        supplierId: 'sup-1',
        invoiceNumber: 'INV-1004',
        quantity: 5,
        unitCost: 20,
        currency: CURRENCY.NIO,
        invoiceDate: '2026-01-03',
        entryTimestamp: '2026-01-03T10:00:00.000Z',
      }),
    ).rejects.toThrow(
      'Batch-managed purchases require lotCode, receivedDate, and expirationDate',
    );
  });

  it('rejects USD purchases without an explicit bcnRate', async () => {
    await expect(
      service.previewPurchase({
        id: 'preview-doc-3',
        tenantId: 'tenant-A',
        insumoId: 'ins-1',
        supplierId: 'sup-1',
        invoiceNumber: 'INV-PREVIEW-3',
        quantity: 5,
        unitCost: 2,
        currency: CURRENCY.USD,
        invoiceDate: '2026-01-03',
        entryTimestamp: '2026-01-03T08:00:00.000Z',
      }),
    ).rejects.toThrow('USD purchases require an explicit BCN exchange rate');
    expect(resolveBcnRateByDate).not.toHaveBeenCalled();
  });

  it('surfaces the official-rate error when official mode cannot resolve the invoice date', async () => {
    resolveBcnRateByDate.mockRejectedValueOnce(
      new Error('No official BCN FX rate found for invoiceDate 2026-01-08'),
    );

    await expect(
      service.previewPurchase({
        id: 'preview-doc-official-missing-1',
        tenantId: 'tenant-A',
        insumoId: 'ins-1',
        supplierId: 'sup-1',
        invoiceNumber: 'INV-PREVIEW-OFFICIAL-MISSING-1',
        quantity: 1,
        unitCost: 10,
        currency: CURRENCY.USD,
        invoiceDate: '2026-01-08',
        entryTimestamp: '2026-01-08T08:00:00.000Z',
        fxRateMode: 'official',
      }),
    ).rejects.toThrow(
      'No official BCN FX rate found for invoiceDate 2026-01-08',
    );
  });

  it('rejects whitespace-only invoice identifiers at the service boundary', async () => {
    await expect(
      service.recordPurchase({
        id: 'purchase-doc-whitespace-1',
        tenantId: 'tenant-A',
        insumoId: 'ins-1',
        supplierId: 'sup-1',
        invoiceNumber: '   ',
        quantity: 1,
        unitCost: 2,
        currency: CURRENCY.NIO,
        invoiceDate: '2026-01-05',
        entryTimestamp: '2026-01-05T10:00:00.000Z',
      }),
    ).rejects.toThrow('invoiceNumber is required');
    expect(manager.query).not.toHaveBeenCalled();
  });

  it('rejects duplicate invoice numbers for the same tenant and supplier', async () => {
    manager.findOne.mockImplementation((entity: unknown) => {
      if (entity === Supplier) {
        return Promise.resolve(supplier);
      }

      if (entity === PurchaseDocument) {
        return Promise.resolve({
          id: 'purchase-doc-existing',
          tenant_id: 'tenant-A',
          supplier_id: 'sup-1',
          invoice_number: 'INV-1005',
        });
      }

      return Promise.resolve(null);
    });

    await expect(
      service.recordPurchase({
        id: 'purchase-doc-5',
        tenantId: 'tenant-A',
        insumoId: 'ins-1',
        supplierId: 'sup-1',
        invoiceNumber: 'INV-1005',
        quantity: 1,
        unitCost: 2,
        currency: CURRENCY.NIO,
        invoiceDate: '2026-01-05',
        entryTimestamp: '2026-01-05T10:00:00.000Z',
      }),
    ).rejects.toThrow(
      'Purchase invoice INV-1005 is already registered for supplier sup-1',
    );
  });
});
