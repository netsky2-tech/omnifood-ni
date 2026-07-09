import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { NextFunction, Request, Response } from 'express';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { SyncBatchController } from '../../src/modules/sales/controllers/sync-batch.controller';
import { InvoicesService } from '../../src/modules/sales/services/invoices.service';

interface RequestWithUser extends Request {
  user?: {
    tenant_id: string;
    sub: string;
    email: string;
    role: string;
  };
}

interface SyncBatchRecordRequest {
  idempotencyKey: string;
  sourceDeviceId: string;
  sourceSequence: number;
  flowType: string;
  documentType: string;
  movements?: Array<Record<string, unknown>>;
  invoice?: Record<string, unknown>;
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

describe('Sync batch route (e2e)', () => {
  let app: INestApplication<App>;
  const syncBatch = jest.fn();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [SyncBatchController],
      providers: [
        {
          provide: InvoicesService,
          useValue: { syncBatch },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
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
});
