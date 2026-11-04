import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { InvoicesService } from './invoices.service';
import { Invoice } from '../entities/invoice.entity';
import { InvoiceItem } from '../entities/invoice-item.entity';
import { Payment } from '../entities/payment.entity';
import {
  InventoryMovement,
  MovementType,
} from '../../inventory/entities/inventory-movement.entity';
import { InventorySyncReceipt } from '../../inventory/entities/inventory-sync-receipt.entity';
import { InventorySyncOutbox } from '../../inventory/entities/inventory-sync-outbox.entity';
import { RecipeService } from '../../inventory/recipe.service';
import { BomExplosionService } from '../../inventory/bom-explosion.service';
import { User, UserRole } from '../../identity/entities/user.entity';
import { Insumo } from '../../inventory/entities/insumo.entity';
import { AuditLog } from '../../identity/entities/audit-log.entity';

describe('InvoicesService.voidAdminInvoice', () => {
  let service: InvoicesService;
  let invoiceRepo: {
    findOne: jest.Mock;
    save: jest.Mock;
  };
  let movementRepo: {
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let auditRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let insumoRepo: {
    findOne: jest.Mock;
    save: jest.Mock;
  };
  let queryBuilder: {
    setLock: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    getOne: jest.Mock;
  };
  let txManager: {
    query: jest.Mock;
    save: jest.Mock;
    getRepository: jest.Mock;
    findOne: jest.Mock;
    find: jest.Mock;
    createQueryBuilder: jest.Mock;
  };

  const tenantId = 'tenant-1';
  const invoiceId = '11111111-1111-4111-8111-111111111111';
  const authorizer = { userId: 'admin-1', role: UserRole.OWNER };

  beforeEach(async () => {
    invoiceRepo = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((inv) => Promise.resolve(inv)),
    };
    movementRepo = {
      find: jest.fn().mockResolvedValue([]),
      create: jest
        .fn()
        .mockImplementation((dto) => ({ id: 'mov-cancel-1', ...dto })),
      save: jest.fn().mockImplementation((mov) => Promise.resolve(mov)),
    };
    auditRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest
        .fn()
        .mockImplementation((entry) => ({ id: 'audit-1', ...entry })),
      save: jest.fn().mockImplementation((entry) => Promise.resolve(entry)),
    };
    insumoRepo = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((ins) => Promise.resolve(ins)),
    };

    queryBuilder = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
    };

    txManager = {
      query: jest.fn().mockResolvedValue(undefined),
      save: jest
        .fn()
        .mockImplementation((_entity, val) => Promise.resolve(val)),
      getRepository: jest.fn((entity) => {
        if (entity === Invoice) return invoiceRepo;
        if (entity === InventoryMovement) return movementRepo;
        if (entity === AuditLog) return auditRepo;
        if (entity === Insumo) return insumoRepo;
        return {
          findOne: jest.fn(),
          save: jest.fn(),
          find: jest.fn().mockResolvedValue([]),
        };
      }),
      findOne: jest.fn(),
      find: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };

    const dataSource = {
      transaction: jest.fn((isolationOrCb: unknown, maybeCb?: unknown) => {
        const cb =
          typeof isolationOrCb === 'function'
            ? isolationOrCb
            : (maybeCb as (m: unknown) => Promise<unknown>);
        return cb(txManager);
      }),
      getRepository: jest.fn((entity) => {
        if (entity === Invoice) return invoiceRepo;
        if (entity === InventoryMovement) return movementRepo;
        if (entity === AuditLog) return auditRepo;
        return { findOne: jest.fn() };
      }),
    } as unknown as DataSource;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoicesService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(Invoice), useValue: invoiceRepo },
        {
          provide: getRepositoryToken(InvoiceItem),
          useValue: { find: jest.fn() },
        },
        {
          provide: getRepositoryToken(Payment),
          useValue: { upsert: jest.fn() },
        },
        { provide: getRepositoryToken(User), useValue: { findOne: jest.fn() } },
        {
          provide: getRepositoryToken(InventoryMovement),
          useValue: movementRepo,
        },
        {
          provide: getRepositoryToken(InventorySyncReceipt),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(InventorySyncOutbox),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: RecipeService,
          useValue: { findActiveVersion: jest.fn(), getSnapshot: jest.fn() },
        },
        { provide: BomExplosionService, useValue: { explode: jest.fn() } },
      ],
    }).compile();

    service = module.get<InvoicesService>(InvoicesService);
  });

  it('successfully voids an active regular invoice, sets reason and logs audit', async () => {
    const regularInvoice = {
      id: invoiceId,
      number: '001-001-01-00000005',
      tenant_id: tenantId,
      type: 'regular',
      isCanceled: false,
      voidReason: null,
    };
    invoiceRepo.findOne.mockResolvedValue(regularInvoice);

    const existingSaleMovement = {
      id: 'mov-sale-1',
      tenant_id: tenantId,
      insumoId: 'insumo-1',
      quantity: -2,
      unitCostNio: 15.5,
      type: MovementType.SALE,
    };
    movementRepo.find.mockResolvedValue([existingSaleMovement]);

    const insumoEntity = {
      id: 'insumo-1',
      tenant_id: tenantId,
      stock: 10,
      existenciaActual: 10,
      averageCost: 15.5,
    };
    queryBuilder.getOne.mockResolvedValue(insumoEntity);

    const result = await service.voidAdminInvoice(
      tenantId,
      invoiceId,
      {
        reason: 'ERROR_DE_CAPTURA',
        reasonDetail: 'Duplicado por error de red',
      },
      authorizer,
    );

    expect(result).toEqual({
      id: invoiceId,
      number: '001-001-01-00000005',
      isCanceled: true,
      voidReason: 'ERROR_DE_CAPTURA \u2014 Duplicado por error de red',
    });

    expect(invoiceRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        isCanceled: true,
        voidReason: 'ERROR_DE_CAPTURA \u2014 Duplicado por error de red',
      }),
    );

    // Stock compensated
    expect(insumoEntity.stock).toBe(12);
    expect(insumoEntity.existenciaActual).toBe(12);
    expect(movementRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MovementType.SALE_CANCEL,
        quantity: 2,
        previousStock: 10,
        newStock: 12,
        compensationForKardexId: 'mov-sale-1',
        sourceDeviceId: 'WEB_ADMIN',
      }),
    );

    // Audit log saved
    expect(auditRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: tenantId,
        user_id: authorizer.userId,
        action: 'ADMIN_INVOICE_VOIDED',
        target_id: invoiceId,
        device_id: 'WEB_ADMIN',
        sequence_no: 1,
        prev_hash: 'GENESIS',
      }),
    );
    expect(auditRepo.save).toHaveBeenCalled();
  });

  it('throws NotFoundException when invoice does not exist', async () => {
    invoiceRepo.findOne.mockResolvedValue(null);

    await expect(
      service.voidAdminInvoice(
        tenantId,
        'non-existent-id',
        { reason: 'ERROR_DE_CAPTURA' },
        authorizer,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when trying to void a credit note', async () => {
    invoiceRepo.findOne.mockResolvedValue({
      id: invoiceId,
      tenant_id: tenantId,
      type: 'creditNote',
      isCanceled: false,
    });

    await expect(
      service.voidAdminInvoice(
        tenantId,
        invoiceId,
        { reason: 'ERROR_DE_CAPTURA' },
        authorizer,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws ConflictException when invoice is already canceled', async () => {
    invoiceRepo.findOne.mockResolvedValue({
      id: invoiceId,
      tenant_id: tenantId,
      type: 'regular',
      isCanceled: true,
      voidReason: 'PREVIOUS_VOID',
    });

    await expect(
      service.voidAdminInvoice(
        tenantId,
        invoiceId,
        { reason: 'ERROR_DE_CAPTURA' },
        authorizer,
      ),
    ).rejects.toThrow(ConflictException);
  });
});
