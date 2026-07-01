import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { TenantInterceptor } from '../../src/core/database/rls.interceptor';
import { InventoryMovementController } from '../../src/modules/inventory/inventory-movement.controller';
import {
  FX_RATE_RESOLVER,
  type PurchasePreview,
  InventoryPurchaseService,
} from '../../src/modules/inventory/inventory-purchase.service';
import { PurchaseDocument } from '../../src/modules/inventory/entities/purchase-document.entity';
import { Supplier } from '../../src/modules/inventory/entities/supplier.entity';
import { InventoryService } from '../../src/modules/inventory/inventory.service';
import { RecipeService } from '../../src/modules/inventory/recipe.service';
import { ShrinkageService } from '../../src/modules/inventory/shrinkage.service';
import { UserRole } from '../../src/modules/identity/entities/user.entity';
import { AuthGuard } from '../../src/modules/identity/guards/auth.guard';
import { RolesGuard } from '../../src/modules/identity/guards/roles.guard';

const JWT_SECRET = process.env.JWT_SECRET?.trim() || 'test-secret';

interface PurchasePreviewResponseBody extends PurchasePreview {
  statusCode?: number;
}

interface ConflictResponseBody {
  message: string;
  statusCode: number;
}

interface RecordPurchaseResponseBody {
  purchaseDocument: PurchaseDocumentResponseBody;
  insumo: InsumoResponseBody;
  preview: PurchasePreview;
}

interface PurchaseDocumentResponseBody {
  id: string;
  tenant_id: string;
  insumo_id: string;
  supplier_id: string;
  invoice_number: string;
  invoice_date: string;
  entry_date: string;
  entry_timestamp: string;
  quantity: number;
  unit_cost: number;
  currency: 'NIO' | 'USD';
  bcn_rate: number;
  unit_cost_nio: number;
  projected_cpp_nio: number;
  lot_code: string | null;
  received_date: string | null;
  expiration_date: string | null;
}

interface InsumoResponseBody {
  id: string;
  tenant_id: string;
  stock: number;
  averageCost: number;
  existenciaActual: number;
  is_perishable: boolean;
}

interface UnauthorizedResponseBody {
  message: string;
}

const validPurchasePayload = {
  id: 'purchase-doc-1',
  insumoId: 'ins-1',
  supplierId: 'sup-1',
  invoiceNumber: 'INV-1001',
  quantity: 2,
  unitCost: 10,
  currency: 'USD' as const,
  invoiceDate: '2026-01-03',
  entryTimestamp: '2026-01-03T08:15:00.000Z',
  bcnRate: 36.5,
};

const buildInsumoRecord = (
  overrides: Partial<InsumoResponseBody> = {},
): InsumoResponseBody => ({
  id: validPurchasePayload.insumoId,
  tenant_id: 'tenant-A',
  stock: 10,
  averageCost: 50,
  existenciaActual: 10,
  is_perishable: false,
  ...overrides,
});

describe('Inventory purchase routes (integration)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;
  const resolveBcnRateByDate = jest.fn();
  const repositoryFindOne = jest.fn();
  const transaction = jest.fn();
  const queryBuilder = {
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  };
  const manager = {
    createQueryBuilder: jest.fn(),
    findOne: jest.fn(),
    query: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  };
  const dataSource = {
    transaction,
    getRepository: jest.fn(() => ({
      findOne: repositoryFindOne,
    })),
  };

  let currentInsumo = buildInsumoRecord();
  let existingPurchaseDocument: { id: string } | null = null;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [InventoryMovementController],
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
        {
          provide: ShrinkageService,
          useValue: {
            recordShrinkage: jest.fn(),
          },
        },
        {
          provide: InventoryService,
          useValue: {
            syncMovements: jest.fn(),
          },
        },
        {
          provide: RecipeService,
          useValue: {
            ingestPosVersion: jest.fn(),
          },
        },
        TenantInterceptor,
        AuthGuard,
        RolesGuard,
        Reflector,
        JwtService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'JWT_SECRET' ? JWT_SECRET : undefined,
          },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    jwtService = moduleFixture.get(JwtService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    currentInsumo = buildInsumoRecord();
    existingPurchaseDocument = null;

    repositoryFindOne.mockImplementation(
      ({ where }: { where: { id: string; tenant_id: string } }) =>
        Promise.resolve({
          ...currentInsumo,
          id: where.id,
          tenant_id: where.tenant_id,
        }),
    );
    queryBuilder.getOne.mockImplementation(() =>
      Promise.resolve({ ...currentInsumo }),
    );
    manager.createQueryBuilder.mockReturnValue(queryBuilder);
    manager.findOne.mockImplementation((entity: unknown) => {
      if (entity === Supplier) {
        return Promise.resolve({
          id: validPurchasePayload.supplierId,
          tenant_id: currentInsumo.tenant_id,
          name: 'Supplier X',
        });
      }

      if (entity === PurchaseDocument) {
        return Promise.resolve(existingPurchaseDocument);
      }

      return Promise.resolve(null);
    });
    manager.create.mockImplementation(
      (_entity: unknown, payload: Record<string, unknown>) => payload,
    );
    manager.query.mockResolvedValue(undefined);
    manager.save.mockImplementation(
      (_entity: unknown, payload: Record<string, unknown>) =>
        Promise.resolve(payload),
    );
    transaction.mockImplementation(
      (
        _isolation: string,
        handler: (entityManager: typeof manager) => unknown,
      ) => handler(manager),
    );
    resolveBcnRateByDate.mockResolvedValue(1);
  });

  afterAll(async () => {
    await app.close();
  });

  const signToken = (
    overrides: Partial<{
      sub: string;
      email: string;
      role: UserRole;
      tenant_id: string;
    }> = {},
  ): string =>
    jwtService.sign(
      {
        sub: 'user-1',
        email: 'manager@example.com',
        role: UserRole.MANAGER,
        tenant_id: 'tenant-A',
        ...overrides,
      },
      { secret: JWT_SECRET },
    );

  it('returns 401 for purchase preview when no bearer token is provided', async () => {
    await request(app.getHttpServer())
      .post('/inventory/purchase')
      .send(validPurchasePayload)
      .expect(401);

    expect(repositoryFindOne).not.toHaveBeenCalled();
  });

  it('returns 401 for purchase preview when the authenticated token lacks tenant context', async () => {
    const token = signToken({ tenant_id: undefined });

    const response = await request(app.getHttpServer())
      .post('/inventory/purchase')
      .set('Authorization', `Bearer ${token}`)
      .send(validPurchasePayload)
      .expect(401);

    const body = response.body as UnauthorizedResponseBody;
    expect(body.message).toBe('Tenant context is required');
    expect(repositoryFindOne).not.toHaveBeenCalled();
  });

  it('returns 400 for purchase preview when invoiceNumber is blank after trimming', async () => {
    const token = signToken();

    await request(app.getHttpServer())
      .post('/inventory/purchase')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...validPurchasePayload,
        invoiceNumber: '   ',
      })
      .expect(400);

    expect(repositoryFindOne).not.toHaveBeenCalled();
  });

  it('accepts an authenticated manager purchase preview request and forwards tenant context', async () => {
    const token = signToken({ tenant_id: 'tenant-XYZ' });

    const response = await request(app.getHttpServer())
      .post('/inventory/purchase')
      .set('Authorization', `Bearer ${token}`)
      .send(validPurchasePayload)
      .expect(201);

    const body = response.body as PurchasePreviewResponseBody;
    expect(body).toMatchObject({
      invoiceDate: validPurchasePayload.invoiceDate,
      currency: validPurchasePayload.currency,
      bcnRate: validPurchasePayload.bcnRate,
      bcnRateSource: 'Document-provided BCN rate',
      unitCostNio: 365,
      previousCppNio: 50,
      projectedCppNio: 102.5,
      previousStock: 10,
      projectedStock: 12,
      requiresBatchTracking: false,
    });
    expect(repositoryFindOne).toHaveBeenCalledWith({
      where: {
        id: validPurchasePayload.insumoId,
        tenant_id: 'tenant-XYZ',
      },
    });
  });

  it('returns 403 for purchase posting when the authenticated role lacks permission', async () => {
    const token = signToken({ role: UserRole.CASHIER });

    await request(app.getHttpServer())
      .post('/inventory/purchases')
      .set('Authorization', `Bearer ${token}`)
      .send(validPurchasePayload)
      .expect(403);

    expect(transaction).not.toHaveBeenCalled();
  });

  it('returns 401 for purchase posting when no bearer token is provided', async () => {
    await request(app.getHttpServer())
      .post('/inventory/purchases')
      .send(validPurchasePayload)
      .expect(401);

    expect(transaction).not.toHaveBeenCalled();
  });

  it('returns 401 for purchase posting when the authenticated token lacks tenant context', async () => {
    const token = signToken({ tenant_id: undefined });

    const response = await request(app.getHttpServer())
      .post('/inventory/purchases')
      .set('Authorization', `Bearer ${token}`)
      .send(validPurchasePayload)
      .expect(401);

    const body = response.body as UnauthorizedResponseBody;
    expect(body.message).toBe('Tenant context is required');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('returns 201 with the real purchase posting route contract for an authenticated valid request', async () => {
    const token = signToken();

    const response = await request(app.getHttpServer())
      .post('/inventory/purchases')
      .set('Authorization', `Bearer ${token}`)
      .send(validPurchasePayload)
      .expect(201);

    const body = response.body as RecordPurchaseResponseBody;
    expect(body).toEqual({
      purchaseDocument: {
        id: validPurchasePayload.id,
        tenant_id: 'tenant-A',
        insumo_id: validPurchasePayload.insumoId,
        supplier_id: validPurchasePayload.supplierId,
        invoice_number: validPurchasePayload.invoiceNumber,
        invoice_date: new Date(validPurchasePayload.invoiceDate).toJSON(),
        entry_date: new Date(validPurchasePayload.invoiceDate).toJSON(),
        entry_timestamp: new Date(validPurchasePayload.entryTimestamp).toJSON(),
        quantity: validPurchasePayload.quantity,
        unit_cost: validPurchasePayload.unitCost,
        currency: validPurchasePayload.currency,
        bcn_rate: validPurchasePayload.bcnRate,
        unit_cost_nio: 365,
        projected_cpp_nio: 102.5,
        lot_code: null,
        received_date: null,
        expiration_date: null,
      },
      insumo: {
        id: validPurchasePayload.insumoId,
        tenant_id: 'tenant-A',
        stock: 12,
        averageCost: 102.5,
        existenciaActual: 12,
        is_perishable: false,
      },
      preview: {
        invoiceDate: validPurchasePayload.invoiceDate,
        currency: validPurchasePayload.currency,
        bcnRate: validPurchasePayload.bcnRate,
        bcnRateSource: 'Document-provided BCN rate',
        unitCostNio: 365,
        previousCppNio: 50,
        projectedCppNio: 102.5,
        previousStock: 10,
        projectedStock: 12,
        requiresBatchTracking: false,
      },
    });
    expect(manager.query).toHaveBeenCalledWith(
      "SELECT set_config('app.tenant_id', $1, true)",
      ['tenant-A'],
    );
  });

  it('returns 409 for purchase posting when the invoice is already registered', async () => {
    const token = signToken();
    existingPurchaseDocument = { id: 'purchase-doc-duplicate' };

    const response = await request(app.getHttpServer())
      .post('/inventory/purchases')
      .set('Authorization', `Bearer ${token}`)
      .send(validPurchasePayload)
      .expect(409);

    const body = response.body as ConflictResponseBody;
    expect(body.message).toBe(
      'Purchase invoice INV-1001 is already registered for supplier sup-1',
    );
    expect(body.statusCode).toBe(409);
    expect(manager.findOne).toHaveBeenCalledWith(
      PurchaseDocument,
      expect.objectContaining({
        where: {
          tenant_id: 'tenant-A',
          supplier_id: validPurchasePayload.supplierId,
          invoice_number: validPurchasePayload.invoiceNumber,
        },
      }),
    );
  });
});
