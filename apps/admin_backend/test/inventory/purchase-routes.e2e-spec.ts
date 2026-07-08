import {
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { TenantInterceptor } from '../../src/core/database/rls.interceptor';
import { CostCalculatorService } from '../../src/modules/inventory/cost-calculator.service';
import { InventoryMovementController } from '../../src/modules/inventory/inventory-movement.controller';
import { FxRateResolverService } from '../../src/modules/inventory/fx-rate-resolver.service';
import {
  FX_RATE_RESOLVER,
  type PurchasePreview,
  InventoryPurchaseService,
} from '../../src/modules/inventory/inventory-purchase.service';
import { PurchaseDocument } from '../../src/modules/inventory/entities/purchase-document.entity';
import { InventoryMovement } from '../../src/modules/inventory/entities/inventory-movement.entity';
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

interface NotFoundResponseBody {
  error: string;
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
  fiscal_authorization_code: string | null;
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

interface BadRequestResponseBody {
  message: string[];
  error: string;
  statusCode: number;
}

interface BcnFxRateResponseBody {
  invoiceDate: string;
  effectiveDate: string;
  rateNio: number;
  message?: string;
  statusCode?: number;
}

const validPurchasePayload = {
  id: 'purchase-doc-1',
  insumoId: 'ins-1',
  supplierId: 'sup-1',
  invoiceNumber: 'INV-1001',
  fiscalAuthorizationCode: 'CAE-ABC-123',
  quantity: 2,
  unitCost: 10,
  currency: 'USD' as const,
  invoiceDate: '2026-01-03',
  entryTimestamp: '2026-01-03T08:15:00.000Z',
  bcnRate: 36.5,
};

const officialModePurchasePayload = {
  ...validPurchasePayload,
  id: 'purchase-doc-official-1',
  invoiceNumber: 'INV-2001',
  invoiceDate: '2026-01-06',
  entryTimestamp: '2026-01-06T08:15:00.000Z',
  fxRateMode: 'official' as const,
};

const INVENTORY_API_PREFIX = '/api/inventory';

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
  const getBcnRateByInvoiceDate = jest.fn();
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
    const fxRateResolverService = {
      getBcnRateByInvoiceDate,
      resolveBcnRateByDate,
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [InventoryMovementController],
      providers: [
        {
          provide: FxRateResolverService,
          useValue: fxRateResolverService,
        },
        InventoryPurchaseService,
        CostCalculatorService,
        {
          provide: DataSource,
          useValue: dataSource,
        },
        {
          provide: FX_RATE_RESOLVER,
          useExisting: FxRateResolverService,
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
    app.setGlobalPrefix('api');
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
    getBcnRateByInvoiceDate.mockResolvedValue({
      invoiceDate: '2026-01-03',
      effectiveDate: '2026-01-03',
      rateNio: 36.5,
    });
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
      .post(`${INVENTORY_API_PREFIX}/purchase`)
      .send(validPurchasePayload)
      .expect(401);

    expect(repositoryFindOne).not.toHaveBeenCalled();
  });

  it('returns 401 for BCN FX lookup when no bearer token is provided', async () => {
    await request(app.getHttpServer())
      .get(`${INVENTORY_API_PREFIX}/fx/bcn?invoiceDate=2026-01-03`)
      .expect(401);

    expect(getBcnRateByInvoiceDate).not.toHaveBeenCalled();
  });

  it('returns 200 with the persisted BCN FX rate for an authenticated valid request', async () => {
    const token = signToken();

    const response = await request(app.getHttpServer())
      .get(`${INVENTORY_API_PREFIX}/fx/bcn`)
      .query({ invoiceDate: '2026-01-03' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const body = response.body as BcnFxRateResponseBody;
    expect(body).toEqual({
      invoiceDate: '2026-01-03',
      effectiveDate: '2026-01-03',
      rateNio: 36.5,
    });
    expect(getBcnRateByInvoiceDate).toHaveBeenCalledWith('2026-01-03');
  });

  it('returns 404 when the requested BCN FX rate does not exist', async () => {
    const token = signToken();
    getBcnRateByInvoiceDate.mockRejectedValueOnce(
      new NotFoundException(
        'No official BCN FX rate found for invoiceDate 2026-01-04',
      ),
    );

    const response = await request(app.getHttpServer())
      .get(`${INVENTORY_API_PREFIX}/fx/bcn`)
      .query({ invoiceDate: '2026-01-04' })
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    const body = response.body as BcnFxRateResponseBody;
    expect(body.message).toBe(
      'No official BCN FX rate found for invoiceDate 2026-01-04',
    );
    expect(body.statusCode).toBe(404);
  });

  it('returns 400 when invoiceDate is missing from the BCN FX lookup query', async () => {
    const token = signToken();

    const response = await request(app.getHttpServer())
      .get(`${INVENTORY_API_PREFIX}/fx/bcn`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    const body = response.body as BadRequestResponseBody;
    expect(body.error).toBe('Bad Request');
    expect(body.message).toEqual(
      expect.arrayContaining(['invoiceDate should not be empty']),
    );
    expect(getBcnRateByInvoiceDate).not.toHaveBeenCalled();
  });

  it('returns 400 when invoiceDate is malformed for the BCN FX lookup query', async () => {
    const token = signToken();

    const response = await request(app.getHttpServer())
      .get(`${INVENTORY_API_PREFIX}/fx/bcn`)
      .query({ invoiceDate: '2026/01/03' })
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    const body = response.body as BadRequestResponseBody;
    expect(body.error).toBe('Bad Request');
    expect(body.message).toEqual(
      expect.arrayContaining(['invoiceDate must be in YYYY-MM-DD format']),
    );
    expect(getBcnRateByInvoiceDate).not.toHaveBeenCalled();
  });

  it('returns 400 when unexpected query params are sent to the BCN FX lookup route', async () => {
    const token = signToken();

    const response = await request(app.getHttpServer())
      .get(`${INVENTORY_API_PREFIX}/fx/bcn`)
      .query({ invoiceDate: '2026-01-03', source: 'manual' })
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    const body = response.body as BadRequestResponseBody;
    expect(body.error).toBe('Bad Request');
    expect(body.message).toEqual(
      expect.arrayContaining(['property source should not exist']),
    );
    expect(getBcnRateByInvoiceDate).not.toHaveBeenCalled();
  });

  it('returns 401 for purchase preview when the authenticated token lacks tenant context', async () => {
    const token = signToken({ tenant_id: undefined });

    const response = await request(app.getHttpServer())
      .post(`${INVENTORY_API_PREFIX}/purchase`)
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
      .post(`${INVENTORY_API_PREFIX}/purchase`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...validPurchasePayload,
        invoiceNumber: '   ',
      })
      .expect(400);

    expect(repositoryFindOne).not.toHaveBeenCalled();
  });

  it('returns 400 for purchase preview when fiscalAuthorizationCode is blank after trimming', async () => {
    const token = signToken();

    const response = await request(app.getHttpServer())
      .post(`${INVENTORY_API_PREFIX}/purchase`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...validPurchasePayload,
        fiscalAuthorizationCode: '   ',
      })
      .expect(400);

    const body = response.body as BadRequestResponseBody;
    expect(body.error).toBe('Bad Request');
    expect(body.message).toEqual(
      expect.arrayContaining(['fiscalAuthorizationCode should not be empty']),
    );
    expect(repositoryFindOne).not.toHaveBeenCalled();
  });

  it('accepts an authenticated manager purchase preview request and forwards tenant context', async () => {
    const token = signToken({ tenant_id: 'tenant-XYZ' });

    const response = await request(app.getHttpServer())
      .post(`${INVENTORY_API_PREFIX}/purchase`)
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

  it('returns 201 for purchase preview in official mode and resolves BCN FX by invoice date', async () => {
    const token = signToken();
    resolveBcnRateByDate.mockResolvedValueOnce(36.7123);

    const response = await request(app.getHttpServer())
      .post(`${INVENTORY_API_PREFIX}/purchase`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...officialModePurchasePayload,
        bcnRate: undefined,
      })
      .expect(201);

    const body = response.body as PurchasePreviewResponseBody;
    expect(body).toMatchObject({
      invoiceDate: officialModePurchasePayload.invoiceDate,
      currency: officialModePurchasePayload.currency,
      bcnRate: 36.7123,
      bcnRateSource: 'Official BCN rate by invoice date',
      unitCostNio: 367.123,
      previousCppNio: 50,
      projectedCppNio: 102.8538,
      previousStock: 10,
      projectedStock: 12,
      requiresBatchTracking: false,
    });
    expect(resolveBcnRateByDate).toHaveBeenCalledWith('2026-01-06');
  });

  it('returns 404 for purchase preview in official mode when no BCN FX rate exists for the invoice date', async () => {
    const token = signToken();
    resolveBcnRateByDate.mockRejectedValueOnce(
      new NotFoundException(
        'No official BCN FX rate found for invoiceDate 2026-01-08',
      ),
    );

    const response = await request(app.getHttpServer())
      .post(`${INVENTORY_API_PREFIX}/purchase`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...officialModePurchasePayload,
        invoiceDate: '2026-01-08',
        entryTimestamp: '2026-01-08T08:15:00.000Z',
        bcnRate: undefined,
      })
      .expect(404);

    const body = response.body as NotFoundResponseBody;
    expect(body).toEqual({
      error: 'Not Found',
      message: 'No official BCN FX rate found for invoiceDate 2026-01-08',
      statusCode: 404,
    });
    expect(resolveBcnRateByDate).toHaveBeenCalledWith('2026-01-08');
    expect(repositoryFindOne).toHaveBeenCalledWith({
      where: {
        id: officialModePurchasePayload.insumoId,
        tenant_id: 'tenant-A',
      },
    });
  });

  it('returns 403 for purchase posting when the authenticated role lacks permission', async () => {
    const token = signToken({ role: UserRole.CASHIER });

    await request(app.getHttpServer())
      .post(`${INVENTORY_API_PREFIX}/purchases`)
      .set('Authorization', `Bearer ${token}`)
      .send(validPurchasePayload)
      .expect(403);

    expect(transaction).not.toHaveBeenCalled();
  });

  it('returns 401 for purchase posting when no bearer token is provided', async () => {
    await request(app.getHttpServer())
      .post(`${INVENTORY_API_PREFIX}/purchases`)
      .send(validPurchasePayload)
      .expect(401);

    expect(transaction).not.toHaveBeenCalled();
  });

  it('returns 401 for purchase posting when the authenticated token lacks tenant context', async () => {
    const token = signToken({ tenant_id: undefined });

    const response = await request(app.getHttpServer())
      .post(`${INVENTORY_API_PREFIX}/purchases`)
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
      .post(`${INVENTORY_API_PREFIX}/purchases`)
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
        fiscal_authorization_code: validPurchasePayload.fiscalAuthorizationCode,
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

  it('returns 201 for purchase posting in official mode and persists the resolved BCN rate', async () => {
    const token = signToken();
    resolveBcnRateByDate.mockResolvedValueOnce(36.95);

    const response = await request(app.getHttpServer())
      .post(`${INVENTORY_API_PREFIX}/purchases`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...officialModePurchasePayload,
        bcnRate: undefined,
      })
      .expect(201);

    const body = response.body as RecordPurchaseResponseBody;
    expect(body.purchaseDocument).toEqual({
      id: officialModePurchasePayload.id,
      tenant_id: 'tenant-A',
      insumo_id: officialModePurchasePayload.insumoId,
      supplier_id: officialModePurchasePayload.supplierId,
      invoice_number: officialModePurchasePayload.invoiceNumber,
      fiscal_authorization_code:
        officialModePurchasePayload.fiscalAuthorizationCode,
      invoice_date: new Date(officialModePurchasePayload.invoiceDate).toJSON(),
      entry_date: new Date(officialModePurchasePayload.invoiceDate).toJSON(),
      entry_timestamp: new Date(
        officialModePurchasePayload.entryTimestamp,
      ).toJSON(),
      quantity: officialModePurchasePayload.quantity,
      unit_cost: officialModePurchasePayload.unitCost,
      currency: officialModePurchasePayload.currency,
      bcn_rate: 36.95,
      unit_cost_nio: 369.5,
      projected_cpp_nio: 103.25,
      lot_code: null,
      received_date: null,
      expiration_date: null,
    });
    expect(body.preview).toMatchObject({
      bcnRate: 36.95,
      bcnRateSource: 'Official BCN rate by invoice date',
      unitCostNio: 369.5,
      projectedCppNio: 103.25,
    });
    expect(resolveBcnRateByDate).toHaveBeenCalledWith('2026-01-06');
  });

  it('returns 404 for purchase posting in official mode when no BCN FX rate exists for the invoice date', async () => {
    const token = signToken();
    resolveBcnRateByDate.mockRejectedValueOnce(
      new NotFoundException(
        'No official BCN FX rate found for invoiceDate 2026-01-08',
      ),
    );

    const response = await request(app.getHttpServer())
      .post(`${INVENTORY_API_PREFIX}/purchases`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...officialModePurchasePayload,
        invoiceDate: '2026-01-08',
        entryTimestamp: '2026-01-08T08:15:00.000Z',
        bcnRate: undefined,
      })
      .expect(404);

    const body = response.body as NotFoundResponseBody;
    expect(body).toEqual({
      error: 'Not Found',
      message: 'No official BCN FX rate found for invoiceDate 2026-01-08',
      statusCode: 404,
    });
    expect(resolveBcnRateByDate).toHaveBeenCalledWith('2026-01-08');
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('returns 409 for purchase posting when the invoice is already registered', async () => {
    const token = signToken();
    existingPurchaseDocument = { id: 'purchase-doc-duplicate' };

    const response = await request(app.getHttpServer())
      .post(`${INVENTORY_API_PREFIX}/purchases`)
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

  it('returns 409 for repeated purchase correction without appending another correction document or movement', async () => {
    const token = signToken();
    const originalDocument = {
      id: 'purchase-doc-original-1',
      tenant_id: 'tenant-A',
      insumo_id: validPurchasePayload.insumoId,
      supplier_id: validPurchasePayload.supplierId,
      invoice_number: 'INV-ORIGINAL-1',
    };
    const existingCorrection = {
      id: 'purchase-doc-correction-1',
      tenant_id: 'tenant-A',
      correction_for_purchase_document_id: originalDocument.id,
    };

    manager.findOne.mockImplementation((entity: unknown, options?: unknown) => {
      if (entity === PurchaseDocument) {
        const where = (options as { where?: Record<string, unknown> })?.where;

        if (where?.id === originalDocument.id) {
          return Promise.resolve(originalDocument);
        }

        if (
          where?.correction_for_purchase_document_id === originalDocument.id
        ) {
          return Promise.resolve(existingCorrection);
        }
      }

      return Promise.resolve(null);
    });

    const response = await request(app.getHttpServer())
      .post(
        `${INVENTORY_API_PREFIX}/purchases/${originalDocument.id}/correction`,
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Wrong invoice entered' })
      .expect(409);

    const body = response.body as ConflictResponseBody;
    expect(body.message).toBe(
      'Purchase document purchase-doc-original-1 has already been corrected',
    );
    expect(body.statusCode).toBe(409);
    expect(manager.save).not.toHaveBeenCalledWith(
      PurchaseDocument,
      expect.objectContaining({ document_type: 'PURCHASE_CORRECTION' }),
    );
    expect(manager.save).not.toHaveBeenCalledWith(
      InventoryMovement,
      expect.objectContaining({ sourceDocumentType: 'PURCHASE_CORRECTION' }),
    );
  });
});
