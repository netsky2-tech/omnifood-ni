import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { NextFunction, Request, Response } from 'express';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { UserRole } from '../../src/modules/identity/entities/user.entity';
import { AuthGuard } from '../../src/modules/identity/guards/auth.guard';
import { SyncTransportGuard } from '../../src/modules/identity/guards/sync-transport.guard';
import { SyncBatchController } from '../../src/modules/sales/controllers/sync-batch.controller';
import { SyncCreditNoteAuthGuard } from '../../src/modules/sales/guards/sync-credit-note-auth.guard';
import { InvoicesService } from '../../src/modules/sales/services/invoices.service';
import {
  createIdentityJwtConfigProvider,
  createIdentityJwtTestConfigProvider,
  signIdentityJwtAccessToken,
} from '../support/identity-jwt-test.fixture';

interface SyncBatchRecordRequest {
  idempotencyKey: string;
  sourceDeviceId: string;
  sourceSequence: number;
  flowType: string;
  documentType: string;
  movements?: Array<Record<string, unknown>>;
  invoice?: Record<string, unknown>;
}

interface RequestWithUser extends Request {
  user?: {
    tenant_id: string;
    sub: string;
    email: string;
    role: string;
  };
}

interface SyncBatchResultResponse {
  idempotencyKey: string;
  terminalId: string;
  flowType: string;
  sourceSequence: number;
  status: string;
  retryable: boolean;
  code?: string;
}

interface SyncBatchResponse {
  status: string;
  received: number;
  processed: number;
  duplicates: number;
  results: SyncBatchResultResponse[];
}

interface ValidationErrorResponse {
  statusCode: number;
  message: string[];
  error: string;
}

const buildPurchaseRecord = (
  sequence: number,
  overrides: Partial<SyncBatchRecordRequest> = {},
): SyncBatchRecordRequest => ({
  idempotencyKey: `inventory:terminal-1:movement-${sequence}`,
  sourceDeviceId: 'terminal-1',
  sourceSequence: sequence,
  flowType: 'inventory',
  documentType: 'PURCHASE',
  movements: [
    {
      insumoId: `insumo-${sequence}`,
      quantity: sequence,
      unitCostNio: 12.5,
    },
  ],
  ...overrides,
});

const buildCreditNoteRecord = (
  sequence: number,
  overrides: Partial<SyncBatchRecordRequest> = {},
): SyncBatchRecordRequest => ({
  idempotencyKey: `sales:terminal-1:credit-note-${sequence}`,
  sourceDeviceId: 'terminal-1',
  sourceSequence: sequence,
  flowType: 'sales',
  documentType: 'CREDIT_NOTE',
  invoice: {
    id: `credit-note-${sequence}`,
    number: `CN-${sequence}`,
    type: 'creditNote',
    originInvoiceId: 'sale-origin-1',
    refundReasonCode: 'CUSTOMER_RETURN',
    refundReasonPolicy: 'FINANCIAL_ONLY',
    authorizedByUserId: 'manager-tenant-e2e',
    authorizedByRole: 'manager',
    createdAt: new Date('2026-07-13T12:00:00.000Z').toISOString(),
    userId: 'cashier-1',
    subtotal: -10,
    totalTax: -1.5,
    total: -11.5,
    paymentStatus: 'REFUNDED',
    items: [
      {
        id: `credit-note-item-${sequence}`,
        productId: 'product-1',
        productName: 'Product 1',
        quantity: -1,
        unitPrice: 10,
        originalTaxRate: 0.15,
        appliedTaxRate: 0.15,
        taxAmount: -1.5,
        total: -10,
        discount: 0,
        originInvoiceItemId: 'sale-origin-item-1',
      },
    ],
    payments: [],
  },
  ...overrides,
});

const buildSaleRecord = (
  sequence: number,
  overrides: Partial<SyncBatchRecordRequest> = {},
): SyncBatchRecordRequest => ({
  idempotencyKey: `sales:terminal-1:sale-${sequence}`,
  sourceDeviceId: 'terminal-1',
  sourceSequence: sequence,
  flowType: 'sales',
  documentType: 'SALE',
  invoice: {
    id: `sale-${sequence}`,
    number: `F-${sequence}`,
    createdAt: new Date('2026-07-13T12:00:00.000Z').toISOString(),
    userId: 'cashier-1',
    subtotal: 10,
    totalTax: 1.5,
    total: 11.5,
    paymentStatus: 'PAID',
    items: [
      {
        id: `sale-item-${sequence}`,
        productId: 'product-1',
        productName: 'Product 1',
        quantity: 1,
        unitPrice: 10,
        originalTaxRate: 0.15,
        appliedTaxRate: 0.15,
        taxAmount: 1.5,
        total: 11.5,
        discount: 1,
      },
    ],
    payments: [],
  },
  ...overrides,
});

describe('Sync batch route (e2e)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;
  const syncBatch = jest.fn();
  const signToken = (payload: Record<string, unknown> = {}): string =>
    signIdentityJwtAccessToken(jwtService, payload);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [SyncBatchController],
      providers: [
        {
          provide: InvoicesService,
          useValue: { syncBatch },
        },
        JwtService,
        AuthGuard,
        SyncCreditNoteAuthGuard,
        createIdentityJwtTestConfigProvider(),
        createIdentityJwtConfigProvider(),
      ],
    })
      .overrideGuard(SyncTransportGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    jwtService = moduleFixture.get(JwtService);
    app.use(
      (req: RequestWithUser, _res: Response, next: NextFunction): void => {
        req.user = {
          tenant_id: 'tenant-e2e',
          sub: 'user-e2e',
          email: 'sync@example.test',
          role: 'admin',
        };
        next();
      },
    );
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('returns mixed per-record outcomes so POS can sync only accepted and duplicate rows', async () => {
    const records = [
      buildPurchaseRecord(1, {
        idempotencyKey: 'inventory:terminal-1:accepted-1',
      }),
      buildPurchaseRecord(2, {
        idempotencyKey: 'inventory:terminal-1:duplicate-2',
      }),
      buildPurchaseRecord(4, {
        idempotencyKey: 'inventory:terminal-1:future-4',
      }),
      buildPurchaseRecord(5, {
        idempotencyKey: 'inventory:terminal-1:rejected-5',
      }),
      buildPurchaseRecord(6, {
        idempotencyKey: 'inventory:terminal-1:blocked-6',
      }),
    ];
    syncBatch.mockResolvedValue({
      received: records.length,
      processed: 1,
      duplicates: 1,
      results: [
        {
          idempotencyKey: 'inventory:terminal-1:accepted-1',
          terminalId: 'terminal-1',
          flowType: 'inventory',
          sourceSequence: 1,
          status: 'ACCEPTED',
          retryable: false,
          code: 'APPLIED',
        },
        {
          idempotencyKey: 'inventory:terminal-1:duplicate-2',
          terminalId: 'terminal-1',
          flowType: 'inventory',
          sourceSequence: 2,
          status: 'DUPLICATE',
          retryable: false,
          code: 'DUPLICATE_REPLAY',
        },
        {
          idempotencyKey: 'inventory:terminal-1:future-4',
          terminalId: 'terminal-1',
          flowType: 'inventory',
          sourceSequence: 4,
          status: 'STAGED_FUTURE',
          retryable: true,
          code: 'WAITING_FOR_SEQUENCE_3',
        },
        {
          idempotencyKey: 'inventory:terminal-1:rejected-5',
          terminalId: 'terminal-1',
          flowType: 'inventory',
          sourceSequence: 5,
          status: 'REJECTED',
          retryable: true,
          code: 'BUSINESS_RULE_VALIDATION',
        },
        {
          idempotencyKey: 'inventory:terminal-1:blocked-6',
          terminalId: 'terminal-1',
          flowType: 'inventory',
          sourceSequence: 6,
          status: 'BLOCKED_BY_PRIOR_FAILURE',
          retryable: true,
          code: 'WAITING_FOR_SEQUENCE_5',
        },
      ],
    });

    const response = await request(app.getHttpServer())
      .post('/v1/sync/batch')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ records })
      .expect(201);

    const body = response.body as SyncBatchResponse;
    expect(syncBatch).toHaveBeenCalledWith('tenant-e2e', records);
    expect(body).toEqual({
      status: 'success',
      received: 5,
      processed: 1,
      duplicates: 1,
      results: [
        expect.objectContaining({
          idempotencyKey: 'inventory:terminal-1:accepted-1',
          status: 'ACCEPTED',
          retryable: false,
          code: 'APPLIED',
        }),
        expect.objectContaining({
          idempotencyKey: 'inventory:terminal-1:duplicate-2',
          status: 'DUPLICATE',
          retryable: false,
          code: 'DUPLICATE_REPLAY',
        }),
        expect.objectContaining({
          idempotencyKey: 'inventory:terminal-1:future-4',
          status: 'STAGED_FUTURE',
          retryable: true,
          code: 'WAITING_FOR_SEQUENCE_3',
        }),
        expect.objectContaining({
          idempotencyKey: 'inventory:terminal-1:rejected-5',
          status: 'REJECTED',
          retryable: true,
          code: 'BUSINESS_RULE_VALIDATION',
        }),
        expect.objectContaining({
          idempotencyKey: 'inventory:terminal-1:blocked-6',
          status: 'BLOCKED_BY_PRIOR_FAILURE',
          retryable: true,
          code: 'WAITING_FOR_SEQUENCE_5',
        }),
      ],
    });
  });

  it('rejects absolute stock snapshots before the sync service can persist them', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/sync/batch')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({
        records: [
          buildPurchaseRecord(1, {
            movements: [
              {
                insumoId: 'insumo-absolute',
                quantity: 1,
                stock: 99,
              },
            ],
          }),
        ],
      })
      .expect(400);

    const body = response.body as ValidationErrorResponse;
    expect(syncBatch).not.toHaveBeenCalled();
    expect(body.message).toEqual(
      expect.arrayContaining([expect.stringContaining('stock')]),
    );
  });

  it('rejects unauthenticated CREDIT_NOTE sync requests before service execution', async () => {
    await request(app.getHttpServer())
      .post('/v1/sync/batch')
      .send({ records: [buildCreditNoteRecord(1)] })
      .expect(401);

    expect(syncBatch).not.toHaveBeenCalled();
  });

  it('rejects CREDIT_NOTE sync requests from inactive manager auth context', async () => {
    const token = signToken({
      sub: 'manager-tenant-e2e',
      tenant_id: 'tenant-e2e',
      email: 'manager@example.test',
      role: UserRole.MANAGER,
      is_active: false,
    });

    await request(app.getHttpServer())
      .post('/v1/sync/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({ records: [buildCreditNoteRecord(2)] })
      .expect(401);

    expect(syncBatch).not.toHaveBeenCalled();
  });

  it('rejects CREDIT_NOTE sync requests from non-manager/non-owner auth context', async () => {
    const token = signToken({
      sub: 'cashier-tenant-e2e',
      tenant_id: 'tenant-e2e',
      email: 'cashier@example.test',
      role: UserRole.CASHIER,
      is_active: true,
    });

    await request(app.getHttpServer())
      .post('/v1/sync/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({ records: [buildCreditNoteRecord(3)] })
      .expect(403);

    expect(syncBatch).not.toHaveBeenCalled();
  });

  it('uses the verified auth tenant for valid manager CREDIT_NOTE sync requests', async () => {
    const record = buildCreditNoteRecord(4);
    const token = signToken({
      sub: 'manager-tenant-e2e',
      tenant_id: 'tenant-e2e',
      email: 'manager@example.test',
      role: UserRole.MANAGER,
      is_active: true,
    });
    syncBatch.mockResolvedValue({
      received: 1,
      processed: 1,
      duplicates: 0,
      results: [
        {
          idempotencyKey: record.idempotencyKey,
          terminalId: record.sourceDeviceId,
          flowType: 'sales',
          sourceSequence: record.sourceSequence,
          status: 'ACCEPTED',
          retryable: false,
          code: 'APPLIED',
        },
      ],
    });

    await request(app.getHttpServer())
      .post('/v1/sync/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({ records: [record] })
      .expect(201);

    expect(syncBatch).toHaveBeenCalledWith('tenant-e2e', [record]);
  });

  it('uses the verified auth tenant for valid owner CREDIT_NOTE sync requests', async () => {
    const record = buildCreditNoteRecord(5, {
      invoice: {
        ...buildCreditNoteRecord(5).invoice,
        authorizedByUserId: 'owner-tenant-other',
        authorizedByRole: 'owner',
      },
    });
    const token = signToken({
      sub: 'owner-tenant-other',
      tenant_id: 'tenant-other',
      email: 'owner@example.test',
      role: UserRole.OWNER,
      is_active: true,
    });
    syncBatch.mockResolvedValue({
      received: 1,
      processed: 0,
      duplicates: 0,
      results: [
        {
          idempotencyKey: record.idempotencyKey,
          terminalId: record.sourceDeviceId,
          flowType: 'sales',
          sourceSequence: record.sourceSequence,
          status: 'REJECTED',
          retryable: false,
          code: 'CREDIT_NOTE_AUTHORIZATION_INVALID',
        },
      ],
    });

    await request(app.getHttpServer())
      .post('/v1/sync/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({ records: [record] })
      .expect(201);

    expect(syncBatch).toHaveBeenCalledWith('tenant-other', [record]);
  });

  it('accepts a sales batch whose invoice items OMIT discount_origin: every deployed terminal omits it today (D-A2 backward-compat contract)', async () => {
    const record = buildSaleRecord(1);
    syncBatch.mockResolvedValue({
      received: 1,
      processed: 1,
      duplicates: 0,
      results: [
        {
          idempotencyKey: record.idempotencyKey,
          terminalId: record.sourceDeviceId,
          flowType: 'sales',
          sourceSequence: record.sourceSequence,
          status: 'ACCEPTED',
          retryable: false,
          code: 'APPLIED',
        },
      ],
    });

    await request(app.getHttpServer())
      .post('/v1/sync/batch')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ records: [record] })
      .expect(201);

    expect(syncBatch).toHaveBeenCalledTimes(1);
    const [, calledRecords] = syncBatch.mock.calls[0] as [
      string,
      Array<{ invoice: { items: Array<Record<string, unknown>> } }>,
    ];
    // Absence must reach the service untouched: the column stays NULL and
    // nothing fabricates an origin for legacy/undecorated lines.
    expect(calledRecords[0].invoice.items[0]).not.toHaveProperty(
      'discountOrigin',
    );
  });

  it('accepts and forwards a valid per-line discount_origin to the sync service (D-A2)', async () => {
    const record = buildSaleRecord(2);
    const saleInvoice = record.invoice as Record<string, unknown>;
    const saleItem = (saleInvoice.items as Array<Record<string, unknown>>)[0];
    record.invoice = {
      ...saleInvoice,
      items: [{ ...saleItem, discountOrigin: 'promotion' }],
    };
    syncBatch.mockResolvedValue({
      received: 1,
      processed: 1,
      duplicates: 0,
      results: [
        {
          idempotencyKey: record.idempotencyKey,
          terminalId: record.sourceDeviceId,
          flowType: 'sales',
          sourceSequence: record.sourceSequence,
          status: 'ACCEPTED',
          retryable: false,
          code: 'APPLIED',
        },
      ],
    });

    await request(app.getHttpServer())
      .post('/v1/sync/batch')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ records: [record] })
      .expect(201);

    expect(syncBatch).toHaveBeenCalledTimes(1);
    const [, calledRecords] = syncBatch.mock.calls[0] as [
      string,
      Array<{ invoice: { items: Array<Record<string, unknown>> } }>,
    ];
    expect(calledRecords[0].invoice.items[0].discountOrigin).toBe('promotion');
  });

  it('rejects an invalid discount_origin and refuses the WHOLE batch before the sync service runs', async () => {
    const record = buildSaleRecord(3);
    const saleInvoice = record.invoice as Record<string, unknown>;
    const saleItem = (saleInvoice.items as Array<Record<string, unknown>>)[0];
    record.invoice = {
      ...saleInvoice,
      items: [{ ...saleItem, discountOrigin: 'boss-discount' }],
    };

    const response = await request(app.getHttpServer())
      .post('/v1/sync/batch')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ records: [record] })
      .expect(400);

    const body = response.body as ValidationErrorResponse;
    expect(body.message).toEqual(
      expect.arrayContaining([expect.stringContaining('discountOrigin')]),
    );
    expect(syncBatch).not.toHaveBeenCalled();
  });
});
