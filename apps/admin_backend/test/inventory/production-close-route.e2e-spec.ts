import {
  CallHandler,
  ExecutionContext,
  INestApplication,
  NestInterceptor,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { Observable } from 'rxjs';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { TenantInterceptor } from '../../src/core/database/rls.interceptor';
import { InventoryMovementController } from '../../src/modules/inventory/inventory-movement.controller';
import { CountSessionService } from '../../src/modules/inventory/count-session.service';
import { FxRateResolverService } from '../../src/modules/inventory/fx-rate-resolver.service';
import { InventoryPurchaseService } from '../../src/modules/inventory/inventory-purchase.service';
import { InventoryService } from '../../src/modules/inventory/inventory.service';
import { ProductionService } from '../../src/modules/inventory/production.service';
import { RecipeService } from '../../src/modules/inventory/recipe.service';
import { ShrinkageService } from '../../src/modules/inventory/shrinkage.service';
import { AuthGuard } from '../../src/modules/identity/guards/auth.guard';
import { AuthoritativeCurrentUserGuard } from '../../src/modules/identity/guards/authoritative-current-user.guard';
import { RolesGuard } from '../../src/modules/identity/guards/roles.guard';
import { CurrentUserAuthorizationService } from '../../src/modules/identity/services/current-user-authorization.service';
import { UserRole } from '../../src/modules/identity/entities/user.entity';
import {
  createIdentityJwtConfigProvider,
  createIdentityJwtTestConfigProvider,
  signIdentityJwtAccessToken,
} from '../support/identity-jwt-test.fixture';

const TEST_TENANT_ID = 'tenant-production-close';
const productionCloseRouteTestJwtService = new JwtService();

const AUTH_TOKEN = signIdentityJwtAccessToken(
  productionCloseRouteTestJwtService,
  {
    tenant_id: TEST_TENANT_ID,
    role: UserRole.MANAGER,
  },
);
const CLAIMED_TERMINAL_AUTH_TOKEN = signIdentityJwtAccessToken(
  productionCloseRouteTestJwtService,
  {
    tenant_id: TEST_TENANT_ID,
    role: UserRole.MANAGER,
    terminal_id: 'terminal-claim-1',
  },
);
const UNAUTHORIZED_ROLE_TOKEN = signIdentityJwtAccessToken(
  productionCloseRouteTestJwtService,
  {
    tenant_id: TEST_TENANT_ID,
    role: UserRole.CASHIER,
  },
);

interface RequestWithUser {
  user?: {
    tenant_id: string;
    terminal_id?: string;
  };
}

interface ProductionCloseReplayCall {
  tenantId: string;
  document: {
    id: string;
    idempotencyKey: string;
    payloadHash: string;
    failureReason?: string;
  };
}

interface BadRequestBody {
  message: string[];
}

class TestTenantInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    context.switchToHttp().getRequest<RequestWithUser>().user = {
      ...context.switchToHttp().getRequest<RequestWithUser>().user,
      tenant_id: TEST_TENANT_ID,
    };
    return next.handle();
  }
}

const validProductionClosePayload = {
  id: 'prod-doc-route-1',
  recipeVersionId: 'recipe-version-1',
  producedInsumoId: 'finished-1',
  producedBatchNumber: 'PB-ROUTE-1',
  producedExpirationDate: '2026-12-01T00:00:00.000Z',
  plannedQuantity: 4,
  actualQuantity: 4,
  outcome: 'COMPLETED',
  terminalId: 'terminal-1',
  sourceSequence: 11,
  idempotencyKey: 'production:terminal-1:prod-doc-route-1',
  payloadHash: 'route-hash-1',
  totalConsumedCostNio: 8,
  producedUnitCostNio: 2,
  operationDate: '2026-05-01T00:00:00.000Z',
  movementReferences: ['out-1', 'in-1'],
};

describe('Production close route (integration)', () => {
  let app: INestApplication<App>;
  const replayProductionClose = jest.fn();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [InventoryMovementController],
      providers: [
        { provide: ProductionService, useValue: { replayProductionClose } },
        {
          provide: CountSessionService,
          useValue: { replayCountSession: jest.fn() },
        },
        {
          provide: FxRateResolverService,
          useValue: { getBcnRateByInvoiceDate: jest.fn() },
        },
        {
          provide: InventoryPurchaseService,
          useValue: {
            previewPurchase: jest.fn(),
            recordPurchase: jest.fn(),
            correctPurchase: jest.fn(),
          },
        },
        { provide: ShrinkageService, useValue: { recordShrinkage: jest.fn() } },
        { provide: InventoryService, useValue: { syncMovements: jest.fn() } },
        { provide: RecipeService, useValue: { ingestPosVersion: jest.fn() } },
        { provide: TenantInterceptor, useClass: TestTenantInterceptor },
        AuthGuard,
        AuthoritativeCurrentUserGuard,
        RolesGuard,
        {
          provide: CurrentUserAuthorizationService,
          useValue: { authorize: jest.fn((token: unknown) => token) },
        },
        Reflector,
        JwtService,
        createIdentityJwtTestConfigProvider(),
        createIdentityJwtConfigProvider(),
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(
      (request: RequestWithUser, _response: unknown, next: () => void) => {
        request.user = { tenant_id: TEST_TENANT_ID };
        next();
      },
    );
    app.setGlobalPrefix('api');
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
    replayProductionClose.mockResolvedValue({
      documentId: validProductionClosePayload.id,
      skippedExisting: false,
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  it('passes the tenant-scoped production close document to the replay service', async () => {
    await request(app.getHttpServer())
      .post('/api/inventory/production-orders/close')
      .set('Authorization', `Bearer ${AUTH_TOKEN}`)
      .send(validProductionClosePayload)
      .expect(201)
      .expect({
        documentId: validProductionClosePayload.id,
        skippedExisting: false,
      });

    const replayCalls = replayProductionClose.mock.calls as Array<
      [ProductionCloseReplayCall]
    >;
    expect(replayCalls[0]?.[0].tenantId).toBe(TEST_TENANT_ID);
    expect(replayCalls[0]?.[0].document.id).toBe(
      validProductionClosePayload.id,
    );
    expect(replayCalls[0]?.[0].document.idempotencyKey).toBe(
      validProductionClosePayload.idempotencyKey,
    );
    expect(replayCalls[0]?.[0].document.payloadHash).toBe(
      validProductionClosePayload.payloadHash,
    );
  });

  it('binds the production replay stream to an authenticated terminal claim when present', async () => {
    await request(app.getHttpServer())
      .post('/api/inventory/production-orders/close')
      .set('Authorization', `Bearer ${CLAIMED_TERMINAL_AUTH_TOKEN}`)
      .send({
        ...validProductionClosePayload,
        terminalId: 'payload-spoofed-terminal',
        idempotencyKey: 'production:payload-spoofed-terminal:prod-doc-route-1',
      })
      .expect(201);

    const replayCalls = replayProductionClose.mock.calls as Array<
      [ProductionCloseReplayCall]
    >;
    expect(replayCalls[0]?.[0].document).toEqual(
      expect.objectContaining({
        terminalId: 'terminal-claim-1',
        idempotencyKey: 'production:terminal-claim-1:prod-doc-route-1',
      }),
    );
  });

  it('rejects payload terminal stream forking when no authenticated terminal claim is available', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/inventory/production-orders/close')
      .set('Authorization', `Bearer ${AUTH_TOKEN}`)
      .send({
        ...validProductionClosePayload,
        terminalId: 'terminal-payload-2',
        idempotencyKey: 'production:terminal-1:prod-doc-route-1',
      })
      .expect(400);

    const body = response.body as BadRequestBody;
    expect(body.message).toBe(
      'production terminalId must match the terminal segment in idempotencyKey when no authenticated terminal claim is available',
    );
    expect(replayProductionClose).not.toHaveBeenCalled();
  });

  it('rejects production close replay without authentication', async () => {
    await request(app.getHttpServer())
      .post('/api/inventory/production-orders/close')
      .send(validProductionClosePayload)
      .expect(401);

    expect(replayProductionClose).not.toHaveBeenCalled();
  });

  it('rejects production close replay for an authenticated role without production close permission', async () => {
    await request(app.getHttpServer())
      .post('/api/inventory/production-orders/close')
      .set('Authorization', `Bearer ${UNAUTHORIZED_ROLE_TOKEN}`)
      .send(validProductionClosePayload)
      .expect(403)
      .expect((response) => {
        expect(response.body).toEqual(
          expect.objectContaining({
            statusCode: 403,
            message: 'Forbidden resource',
          }),
        );
      });

    expect(replayProductionClose).not.toHaveBeenCalled();
  });

  it('rejects an invalid failed close before replay persistence is attempted', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/inventory/production-orders/close')
      .set('Authorization', `Bearer ${AUTH_TOKEN}`)
      .send({
        ...validProductionClosePayload,
        outcome: 'FAILED',
        failureReason: undefined,
      })
      .expect(400);

    const body = response.body as BadRequestBody;
    expect(body.message).toContain(
      'failureReason must be one of the following values: DESECHO_COCINA',
    );
    expect(replayProductionClose).not.toHaveBeenCalled();
  });

  it('rejects a completed close with failure metadata before replay persistence is attempted', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/inventory/production-orders/close')
      .set('Authorization', `Bearer ${AUTH_TOKEN}`)
      .send({
        ...validProductionClosePayload,
        outcome: 'COMPLETED',
        failureReason: 'DESECHO_COCINA',
      })
      .expect(400);

    const body = response.body as BadRequestBody;
    expect(body.message).toContain(
      'failureReason is only valid for failed or interrupted production close',
    );
    expect(replayProductionClose).not.toHaveBeenCalled();
  });

  it('accepts POS completed close payloads that send failureReason as null', async () => {
    await request(app.getHttpServer())
      .post('/api/inventory/production-orders/close')
      .set('Authorization', `Bearer ${AUTH_TOKEN}`)
      .send({
        ...validProductionClosePayload,
        outcome: 'COMPLETED',
        failureReason: null,
      })
      .expect(201)
      .expect({
        documentId: validProductionClosePayload.id,
        skippedExisting: false,
      });

    const replayCalls = replayProductionClose.mock.calls as Array<
      [ProductionCloseReplayCall]
    >;
    expect(replayCalls[0]?.[0].document.failureReason).toBeUndefined();
  });

  it.each([
    [
      'plannedQuantity',
      0,
      'completed production close must have positive planned and actual output',
    ],
    [
      'actualQuantity',
      0,
      'completed production close must have positive planned and actual output',
    ],
  ])(
    'rejects a completed close with non-positive %s before replay persistence is attempted',
    async (fieldName, value, expectedMessage) => {
      const response = await request(app.getHttpServer())
        .post('/api/inventory/production-orders/close')
        .set('Authorization', `Bearer ${AUTH_TOKEN}`)
        .send({
          ...validProductionClosePayload,
          [fieldName]: value,
        })
        .expect(400);

      const body = response.body as BadRequestBody;
      expect(body.message).toContain(expectedMessage);
      expect(replayProductionClose).not.toHaveBeenCalled();
    },
  );

  it('rejects a failed close with finished output before replay persistence is attempted', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/inventory/production-orders/close')
      .set('Authorization', `Bearer ${AUTH_TOKEN}`)
      .send({
        ...validProductionClosePayload,
        outcome: 'FAILED',
        failureReason: 'DESECHO_COCINA',
        actualQuantity: 1,
      })
      .expect(400);

    const body = response.body as BadRequestBody;
    expect(body.message).toContain(
      'failed or interrupted production close must have zero finished output',
    );
    expect(replayProductionClose).not.toHaveBeenCalled();
  });

  it('rejects an interrupted close with finished output before replay persistence is attempted', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/inventory/production-orders/close')
      .set('Authorization', `Bearer ${AUTH_TOKEN}`)
      .send({
        ...validProductionClosePayload,
        outcome: 'INTERRUPTED',
        failureReason: 'DESECHO_COCINA',
        actualQuantity: 2,
      })
      .expect(400);

    const body = response.body as BadRequestBody;
    expect(body.message).toContain(
      'failed or interrupted production close must have zero finished output',
    );
    expect(replayProductionClose).not.toHaveBeenCalled();
  });

  it.each([0, -1])(
    'rejects non-positive production source sequence %s before replay persistence is attempted',
    async (sourceSequence) => {
      const response = await request(app.getHttpServer())
        .post('/api/inventory/production-orders/close')
        .set('Authorization', `Bearer ${AUTH_TOKEN}`)
        .send({
          ...validProductionClosePayload,
          sourceSequence,
        })
        .expect(400);

      const body = response.body as BadRequestBody;
      expect(body.message).toContain('sourceSequence must not be less than 1');
      expect(replayProductionClose).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['id', 'id must not be empty'],
    ['recipeVersionId', 'recipeVersionId must not be empty'],
    ['producedInsumoId', 'producedInsumoId must not be empty'],
    ['producedBatchNumber', 'producedBatchNumber must not be empty'],
    ['terminalId', 'terminalId must not be empty'],
    ['idempotencyKey', 'idempotencyKey must not be empty'],
    ['payloadHash', 'payloadHash must not be empty'],
  ])(
    'rejects an empty required replay string field: %s',
    async (fieldName, expectedMessage) => {
      const response = await request(app.getHttpServer())
        .post('/api/inventory/production-orders/close')
        .set('Authorization', `Bearer ${AUTH_TOKEN}`)
        .send({
          ...validProductionClosePayload,
          [fieldName]: '',
        })
        .expect(400);

      const body = response.body as BadRequestBody;
      expect(body.message).toContain(expectedMessage);
      expect(replayProductionClose).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['id', 'id must not be empty'],
    ['recipeVersionId', 'recipeVersionId must not be empty'],
    ['producedInsumoId', 'producedInsumoId must not be empty'],
    ['producedBatchNumber', 'producedBatchNumber must not be empty'],
    ['terminalId', 'terminalId must not be empty'],
    ['idempotencyKey', 'idempotencyKey must not be empty'],
    ['payloadHash', 'payloadHash must not be empty'],
  ])(
    'rejects a whitespace-only required replay string field: %s',
    async (fieldName, expectedMessage) => {
      const response = await request(app.getHttpServer())
        .post('/api/inventory/production-orders/close')
        .set('Authorization', `Bearer ${AUTH_TOKEN}`)
        .send({
          ...validProductionClosePayload,
          [fieldName]: '   ',
        })
        .expect(400);

      const body = response.body as BadRequestBody;
      expect(body.message).toContain(expectedMessage);
      expect(replayProductionClose).not.toHaveBeenCalled();
    },
  );

  it('rejects empty movement reference elements before replay persistence is attempted', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/inventory/production-orders/close')
      .set('Authorization', `Bearer ${AUTH_TOKEN}`)
      .send({
        ...validProductionClosePayload,
        movementReferences: ['out-1', '', 'in-1'],
      })
      .expect(400);

    const body = response.body as BadRequestBody;
    expect(body.message).toContain('movementReferences must not be empty');
    expect(replayProductionClose).not.toHaveBeenCalled();
  });

  it('rejects whitespace-only movement reference elements before replay persistence is attempted', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/inventory/production-orders/close')
      .set('Authorization', `Bearer ${AUTH_TOKEN}`)
      .send({
        ...validProductionClosePayload,
        movementReferences: ['out-1', '   ', 'in-1'],
      })
      .expect(400);

    const body = response.body as BadRequestBody;
    expect(body.message).toContain('movementReferences must not be empty');
    expect(replayProductionClose).not.toHaveBeenCalled();
  });
});
