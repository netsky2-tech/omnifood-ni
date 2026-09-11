import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ConflictException, BadRequestException } from '@nestjs/common';
import { SaleInventoryRemediationService } from './sale-inventory-remediation.service';
import { InventoryRemediationReceipt } from '../entities/inventory-remediation-receipt.entity';
import { InventoryMovement } from '../entities/inventory-movement.entity';
import { AuditLog } from '../../identity/entities/audit-log.entity';

describe('SaleInventoryRemediationService (Slice 10)', () => {
  let service: SaleInventoryRemediationService;
  let dataSource: any;
  let mockManager: any;
  let mockReceiptRepo: any;

  const tenantId = 'tenant-test-1';
  const actor = { userId: 'user-manager-1', role: 'manager' };

  beforeEach(async () => {
    mockReceiptRepo = {
      findOne: jest.fn(),
    };

    mockManager = {
      findOne: jest.fn(),
      find: jest.fn(),
      createQueryBuilder: jest.fn(),
      create: jest.fn((entityClass, props) => ({
        ...props,
        id: props.id || 'mock-id',
      })),
      save: jest.fn((entityClass, entity) => Promise.resolve(entity)),
    };

    dataSource = {
      getRepository: jest.fn((entityClass) => {
        if (entityClass === InventoryRemediationReceipt) return mockReceiptRepo;
        return {};
      }),
      transaction: jest.fn(async (isolation, cb) => cb(mockManager)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SaleInventoryRemediationService,
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<SaleInventoryRemediationService>(
      SaleInventoryRemediationService,
    );
  });

  it('rejects actor spoofing if actor fields exist in body', async () => {
    const dto: any = {
      idempotencyKey: 'idemp-1',
      invoiceId: '11111111-1111-4111-8111-111111111111',
      recipeVersionId: '22222222-2222-4222-8222-222222222222',
      reason: 'manual remediation',
      actor: 'spoofed-actor',
    };

    await expect(
      service.remediateSaleInventory(tenantId, dto, actor),
    ).rejects.toThrow(BadRequestException);
  });

  it('replays duplicate receipt when idempotencyKey and request hash match exactly', async () => {
    const dto = {
      idempotencyKey: 'idemp-replay',
      invoiceId: '11111111-1111-4111-8111-111111111111',
      recipeVersionId: '22222222-2222-4222-8222-222222222222',
      reason: 'remediation reason',
    };

    const hash = service.buildRequestHash(
      tenantId,
      dto.invoiceId,
      dto.recipeVersionId,
      dto.reason,
    );

    mockReceiptRepo.findOne.mockResolvedValueOnce({
      id: 'receipt-1',
      tenant_id: tenantId,
      idempotency_key: dto.idempotencyKey,
      request_hash: hash,
      status: 'APPLIED',
      result: { status: 'APPLIED' },
    });

    const result = await service.remediateSaleInventory(tenantId, dto, actor);
    expect(result.id).toBe('receipt-1');
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('throws IDEMPOTENCY_MISMATCH when same idempotencyKey is reused with different payload hash', async () => {
    const dto = {
      idempotencyKey: 'idemp-mismatch',
      invoiceId: '11111111-1111-4111-8111-111111111111',
      recipeVersionId: '22222222-2222-4222-8222-222222222222',
      reason: 'new reason',
    };

    mockReceiptRepo.findOne.mockResolvedValueOnce({
      id: 'receipt-prior',
      tenant_id: tenantId,
      idempotency_key: dto.idempotencyKey,
      request_hash: 'different-hash',
    });

    await expect(
      service.remediateSaleInventory(tenantId, dto, actor),
    ).rejects.toThrow(ConflictException);
  });

  it('throws ALREADY_REMEDIATED when invoice has already been remediated under another key', async () => {
    const dto = {
      idempotencyKey: 'idemp-another-key',
      invoiceId: '11111111-1111-4111-8111-111111111111',
      recipeVersionId: '22222222-2222-4222-8222-222222222222',
      reason: 'second attempt',
    };

    mockReceiptRepo.findOne
      .mockResolvedValueOnce(null) // key check
      .mockResolvedValueOnce({
        id: 'receipt-prior',
        source_invoice_id: dto.invoiceId,
        command_type: 'SALE_INVENTORY_REMEDIATION',
      }); // invoice check

    await expect(
      service.remediateSaleInventory(tenantId, dto, actor),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects remediation if source invoice is not in APPLIED_INVENTORY_PENDING outcome', async () => {
    const dto = {
      idempotencyKey: 'idemp-non-pending',
      invoiceId: '11111111-1111-4111-8111-111111111111',
      recipeVersionId: '22222222-2222-4222-8222-222222222222',
      reason: 'invalid outcome test',
    };

    mockReceiptRepo.findOne.mockResolvedValue(null);

    const qbMock: any = {
      setLock: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({
        id: dto.invoiceId,
        tenant_id: tenantId,
        inventoryOutcome: 'APPLIED', // Not pending!
      }),
    };
    mockManager.createQueryBuilder.mockReturnValue(qbMock);

    await expect(
      service.remediateSaleInventory(tenantId, dto, actor),
    ).rejects.toThrow(BadRequestException);
  });

  it('successfully applies remediation: deduces stock, creates kardex, audit, and receipt in SERIALIZABLE transaction', async () => {
    const dto = {
      idempotencyKey: 'idemp-success',
      invoiceId: '11111111-1111-4111-8111-111111111111',
      recipeVersionId: '22222222-2222-4222-8222-222222222222',
      reason: 'Valid remediation',
    };

    mockReceiptRepo.findOne.mockResolvedValue(null);

    const invoiceMock = {
      id: dto.invoiceId,
      tenant_id: tenantId,
      inventoryOutcome: 'APPLIED_INVENTORY_PENDING',
      items: [{ quantity: 2 }],
    };

    const recipeVersionMock = {
      id: dto.recipeVersionId,
      tenant_id: tenantId,
      is_active: true,
    };

    const recipeDetailsMock = [
      { insumo_id: 'insumo-1', quantity: 0.5 },
      { insumo_id: 'insumo-2', quantity: 1.0 },
    ];

    const insumo1Mock = {
      id: 'insumo-1',
      stock: 10,
      existenciaActual: 10,
    };
    const insumo2Mock = {
      id: 'insumo-2',
      stock: 5,
      existenciaActual: 5,
    };

    let qbCallCount = 0;
    mockManager.createQueryBuilder.mockImplementation(() => {
      qbCallCount++;
      return {
        setLock: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockImplementation(async () => {
          if (qbCallCount === 1) return invoiceMock; // invoice query
          if (qbCallCount === 2) return null; // sync receipt query
          if (qbCallCount === 3) return recipeVersionMock; // recipe version query
          if (qbCallCount === 4) return insumo1Mock; // insumo 1
          if (qbCallCount === 5) return insumo2Mock; // insumo 2
          return null;
        }),
      };
    });

    mockManager.find.mockResolvedValueOnce(recipeDetailsMock);

    const result = await service.remediateSaleInventory(tenantId, dto, actor);

    expect(result.status).toBe('APPLIED');
    expect(result.actor_user_id).toBe(actor.userId);
    expect(result.actor_role).toBe(actor.role);

    // Stock deduction verified: 2 items * 0.5 = 1 deducted from insumo1 (10 -> 9)
    expect(insumo1Mock.stock).toBe(9);
    // 2 items * 1.0 = 2 deducted from insumo2 (5 -> 3)
    expect(insumo2Mock.stock).toBe(3);

    // Verify Kardex movements created
    const kardexSaves = mockManager.create.mock.calls.filter(
      (c: any[]) => c[0] === InventoryMovement,
    );
    expect(kardexSaves).toHaveLength(2);
    expect(kardexSaves[0][1].sourceDocumentType).toBe('INVENTORY_REMEDIATION');
    expect(kardexSaves[0][1].quantity).toBe(-1);
    expect(kardexSaves[1][1].quantity).toBe(-2);

    // Verify Audit log created
    const auditSaves = mockManager.create.mock.calls.filter(
      (c: any[]) => c[0] === AuditLog,
    );
    expect(auditSaves).toHaveLength(1);
    expect(auditSaves[0][1].action).toBe('SALE_INVENTORY_REMEDIATED');

    // Verify SERIALIZABLE transaction used
    expect(dataSource.transaction).toHaveBeenCalledWith(
      'SERIALIZABLE',
      expect.any(Function),
    );
  });
});
