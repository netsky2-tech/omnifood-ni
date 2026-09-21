import {
  CallHandler,
  ExecutionContext,
  INestApplication,
  NestInterceptor,
  UnauthorizedException,
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
import { InventoryReportsService } from '../../src/modules/inventory/services/inventory-reports.service';
import { AuthGuard } from '../../src/modules/identity/guards/auth.guard';
import { AuthoritativeCurrentUserGuard } from '../../src/modules/identity/guards/authoritative-current-user.guard';
import { RolesGuard } from '../../src/modules/identity/guards/roles.guard';
import { CurrentUserAuthorizationService } from '../../src/modules/identity/services/current-user-authorization.service';
import { SyncTransportGuard } from '../../src/modules/identity/guards/sync-transport.guard';
import {
  createIdentityJwtConfigProvider,
  createIdentityJwtTestConfigProvider,
} from '../support/identity-jwt-test.fixture';

const TEST_TENANT_ID = 'tenant-production-close';

// Device transport fixture (ST-03, issue #478): POST
// /inventory/production-orders/close is now guarded by SyncTransportGuard.
// This fixture keeps the suite's route behavior coverage while mirroring the
// real guard's contract: fail-closed on a missing or non-device bearer, and
// when it accepts, it attaches the device principal exactly like the real
// guard does, carrying the tenant and the terminal (deviceId). Cryptographic
// token validation is proven in
// src/modules/inventory/inventory-movement.controller.spec.ts.
const DEVICE_SYNC_BEARER_TOKEN_PREFIX = 'device-sync-route-test-token';
const DEFAULT_DEVICE_TERMINAL_ID = 'terminal-route-1';

interface RequestWithDevicePrincipalFixture {
  headers?: Record<string, unknown>;
  devicePrincipal?: {
    principalType: string;
    credentialId: string;
    tenantId: string;
    deviceId: string;
    scopes: string[];
    credentialVersion: number;
  };
}

interface RequestWithUser {
  user?: {
    tenant_id: string;
    terminal_id?: string;
  };
}

const deviceTransportGuardOverride = {
  canActivate: (context: ExecutionContext): boolean => {
    const request = context
      .switchToHttp()
      .getRequest<RequestWithDevicePrincipalFixture>();
    const header = request.headers?.authorization;
    const bearer =
      typeof header === 'string' && header.startsWith('Bearer ')
        ? header.slice('Bearer '.length)
        : undefined;
    if (!bearer?.startsWith(DEVICE_SYNC_BEARER_TOKEN_PREFIX)) {
      throw new UnauthorizedException(
        'Missing or invalid device authorization header',
      );
    }
    // Token convention: device-sync-route-test-token[:<deviceId>]. The
    // optional segment lets a case authenticate a specific terminal, the way
    // a real device credential identifies one terminal.
    const deviceId =
      bearer.slice(DEVICE_SYNC_BEARER_TOKEN_PREFIX.length + 1) ||
      DEFAULT_DEVICE_TERMINAL_ID;
    request.devicePrincipal = {
      principalType: 'DEVICE_SYNC',
      credentialId: 'device-credential-1',
      tenantId: TEST_TENANT_ID,
      deviceId,
      scopes: ['sync:push'],
      credentialVersion: 1,
    };
    return true;
  },
};

const deviceAuth = (deviceId?: string): string =>
  `Bearer ${DEVICE_SYNC_BEARER_TOKEN_PREFIX}${deviceId ? `:${deviceId}` : ''}`;

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
    // Sentinel tenant for a human session: the route moved to device
    // transport, so the tenant used by the handler must come from the device
    // principal, never from this human-session user. The assertions below
    // expect TEST_TENANT_ID, proving the device principal is the source.
    context.switchToHttp().getRequest<RequestWithUser>().user = {
      ...context.switchToHttp().getRequest<RequestWithUser>().user,
      tenant_id: 'tenant-from-human-session-do-not-use',
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
        {
          provide: InventoryReportsService,
          useValue: { getAlertsSummaryReport: jest.fn() },
        },
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
    })
      // Device transport routes (movements/sync, shrinkage,
      // production-orders/close) declare SyncTransportGuard per-route; this
      // suite verifies route behavior, so the guard is replaced by the
      // fail-closed device fixture above while the dedicated spec in
      // inventory-movement.controller.spec.ts proves the real guard for real.
      .overrideGuard(SyncTransportGuard)
      .useValue(deviceTransportGuardOverride)
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(
      (request: RequestWithUser, _response: unknown, next: () => void) => {
        // Sentinel human session; see TestTenantInterceptor. The handler must
        // bind the tenant from the device principal instead.
        request.user = { tenant_id: 'tenant-from-human-session-do-not-use' };
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

  it('passes the device-principal tenant-scoped production close document to the replay service', async () => {
    // The human-session middleware injects a sentinel tenant; the assertion
    // on TEST_TENANT_ID proves the tenant comes from the device principal.
    await request(app.getHttpServer())
      .post('/api/inventory/production-orders/close')
      .set('Authorization', deviceAuth())
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
    // The idempotency key is rebuilt from the device principal terminal
    // (terminal-route-1), not the payload terminal (terminal-1).
    expect(replayCalls[0]?.[0].document.idempotencyKey).toBe(
      `production:${DEFAULT_DEVICE_TERMINAL_ID}:prod-doc-route-1`,
    );
    expect(replayCalls[0]?.[0].document.payloadHash).toBe(
      validProductionClosePayload.payloadHash,
    );
  });

  it('binds the production replay stream to the terminal of the authenticated device principal, never the payload', async () => {
    await request(app.getHttpServer())
      .post('/api/inventory/production-orders/close')
      .set('Authorization', deviceAuth('terminal-claim-1'))
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

  // Re-pointed (ST-03, issue #478): the former case asserted the payload
  // fallback when no authenticated terminal claim was available. Under device
  // transport that state cannot occur: every valid device token carries a
  // deviceId in its principal, enforced by the guard's strict claims contract
  // and proven in inventory-movement.controller.spec.ts. The preserved
  // invariant is that the terminal identity always comes from the
  // authenticated device principal, so a payload terminal fork is neutralized
  // (overridden and the idempotency key rebuilt), never honored.
  it('neutralizes payload terminal stream forking: the device principal claim wins', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/inventory/production-orders/close')
      .set('Authorization', deviceAuth())
      .send({
        ...validProductionClosePayload,
        terminalId: 'terminal-payload-2',
        idempotencyKey: 'production:terminal-payload-2:prod-doc-route-1',
      })
      .expect(201);

    expect(response.body).toEqual({
      documentId: validProductionClosePayload.id,
      skippedExisting: false,
    });

    const replayCalls = replayProductionClose.mock.calls as Array<
      [ProductionCloseReplayCall]
    >;
    expect(replayCalls[0]?.[0].document).toEqual(
      expect.objectContaining({
        terminalId: DEFAULT_DEVICE_TERMINAL_ID,
        idempotencyKey: `production:${DEFAULT_DEVICE_TERMINAL_ID}:prod-doc-route-1`,
      }),
    );
  });

  it('rejects production close replay without authentication', async () => {
    await request(app.getHttpServer())
      .post('/api/inventory/production-orders/close')
      .send(validProductionClosePayload)
      .expect(401);

    expect(replayProductionClose).not.toHaveBeenCalled();
  });

  // Retired case (ST-03, issue #478): the former 403 CASHIER case tested the
  // human RolesGuard on this route. The device transport carries no human
  // roles; scope enforcement is the guard's sync:push metadata, asserted in
  // inventory-movement.controller.spec.ts. Human role enforcement on the
  // inventory document routes remains covered by the purchase correction
  // cases in purchase-routes.e2e-spec.ts and the authoritative-routes suite.

  it('rejects an invalid failed close before replay persistence is attempted', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/inventory/production-orders/close')
      .set('Authorization', deviceAuth())
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
      .set('Authorization', deviceAuth())
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
      .set('Authorization', deviceAuth())
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
        .set('Authorization', deviceAuth())
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
      .set('Authorization', deviceAuth())
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
      .set('Authorization', deviceAuth())
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
        .set('Authorization', deviceAuth())
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
        .set('Authorization', deviceAuth())
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
        .set('Authorization', deviceAuth())
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
      .set('Authorization', deviceAuth())
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
      .set('Authorization', deviceAuth())
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
