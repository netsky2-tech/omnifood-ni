import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { InventoryMovementController } from '../../src/modules/inventory/inventory-movement.controller';
import { CountSessionService } from '../../src/modules/inventory/count-session.service';
import { FxRateResolverService } from '../../src/modules/inventory/fx-rate-resolver.service';
import { FX_RATE_RESOLVER } from '../../src/modules/inventory/inventory-purchase.service';
import { InventoryPurchaseService } from '../../src/modules/inventory/inventory-purchase.service';
import { InventoryService } from '../../src/modules/inventory/inventory.service';
import { ProductionService } from '../../src/modules/inventory/production.service';
import {
  type IngestPosVersionInput,
  type IngestPosVersionResult,
  RecipeService,
} from '../../src/modules/inventory/recipe.service';
import { ShrinkageService } from '../../src/modules/inventory/shrinkage.service';
import { InventoryReportsService } from '../../src/modules/inventory/services/inventory-reports.service';
import { TenantInterceptor } from '../../src/core/database/rls.interceptor';
import { AuthGuard } from '../../src/modules/identity/guards/auth.guard';
import { AuthoritativeCurrentUserGuard } from '../../src/modules/identity/guards/authoritative-current-user.guard';
import { RolesGuard } from '../../src/modules/identity/guards/roles.guard';
import { CurrentUserAuthorizationService } from '../../src/modules/identity/services/current-user-authorization.service';
import { SyncTransportGuard } from '../../src/modules/identity/guards/sync-transport.guard';
import { UserRole } from '../../src/modules/identity/entities/user.entity';
import {
  createIdentityJwtConfigProvider,
  createIdentityJwtTestConfigProvider,
  signIdentityJwtAccessToken,
} from '../support/identity-jwt-test.fixture';

const validRecipeVersionPayload = {
  id: '00000000-0000-4000-8000-000000000001',
  productId: '00000000-0000-4000-8000-000000000aaa',
  productName: 'Gallopinto',
  versionNumber: 1,
  yieldQuantity: 10,
  technicalShrinkPct: 0,
  createdAt: '2026-06-26T12:00:00.000Z',
  publishedAt: '2026-06-26T12:00:00.000Z',
  components: [
    {
      ingredientId: '00000000-0000-4000-8000-000000000111',
      ingredientName: 'Arroz',
      ingredientType: 'INSUMO',
      grossQuantity: 5,
      technicalShrinkPct: 0,
      componentUom: 'kg',
    },
  ],
};

const INVENTORY_API_PREFIX = '/api/inventory';

// Device transport fixture (ST-03, issue #478): POST /inventory/recipes/versions
// is now guarded by SyncTransportGuard. This fixture keeps the suite's route
// behavior coverage while mirroring the real guard's contract: fail-closed on
// a missing or non-device bearer, and when it accepts, it attaches the device
// principal exactly like the real guard does, carrying the tenant. Token
// convention: device-sync-route-test-token[:<tenantId>]. Cryptographic token
// validation is proven in
// src/modules/inventory/inventory-movement.controller.spec.ts.
const DEVICE_SYNC_BEARER_TOKEN_PREFIX = 'device-sync-route-test-token';

interface RequestWithDevicePrincipalFixture {
  headers?: Record<string, unknown>;
  devicePrincipal?: Record<string, unknown>;
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
    const tenantId =
      bearer.slice(DEVICE_SYNC_BEARER_TOKEN_PREFIX.length + 1) || 'tenant-A';
    request.devicePrincipal = {
      principalType: 'DEVICE_SYNC',
      credentialId: 'device-credential-1',
      tenantId,
      deviceId: 'terminal-A',
      scopes: ['sync:push'],
      credentialVersion: 1,
    };
    return true;
  },
};

const deviceAuth = (tenantId?: string): string =>
  `Bearer ${DEVICE_SYNC_BEARER_TOKEN_PREFIX}${tenantId ? `:${tenantId}` : ''}`;

type RecipeIngestionHandler = (
  input: IngestPosVersionInput,
) => Promise<IngestPosVersionResult>;

interface RecipeServiceMock {
  ingestPosVersion: jest.MockedFunction<RecipeIngestionHandler>;
}

interface RecipeVersionIngestionResponseBody {
  recipeVersionId: string;
  replaced: boolean;
}

interface PersistedRecipeDocument {
  detailCount: number;
  productId: string;
  recipeVersionId: string;
  versionRowCount: number;
  writeCount: number;
}

describe('Recipe version ingestion route (integration)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;
  const persistedDocuments = new Map<string, PersistedRecipeDocument>();
  const fxRateResolverService = {
    getBcnRateByInvoiceDate: jest.fn(),
    resolveBcnRateByDate: jest.fn(),
  };

  const buildPersistenceKey = (input: IngestPosVersionInput): string =>
    `${input.tenantId}:${input.dto.id}`;

  const ingestPosVersionMock = jest.fn(
    (input: IngestPosVersionInput): Promise<IngestPosVersionResult> => {
      const persistenceKey = buildPersistenceKey(input);
      const existing = persistedDocuments.get(persistenceKey);

      if (existing) {
        persistedDocuments.set(persistenceKey, {
          ...existing,
          detailCount: input.dto.components.length,
          productId: input.dto.productId,
          writeCount: existing.writeCount + 1,
        });

        return Promise.resolve({
          recipeVersionId: existing.recipeVersionId,
          replaced: true,
        });
      }

      const created: PersistedRecipeDocument = {
        detailCount: input.dto.components.length,
        productId: input.dto.productId,
        recipeVersionId: `recipe-version-${input.dto.id}`,
        versionRowCount: 1,
        writeCount: 1,
      };

      persistedDocuments.set(persistenceKey, created);

      return Promise.resolve({
        recipeVersionId: created.recipeVersionId,
        replaced: false,
      });
    },
  ) as jest.MockedFunction<RecipeIngestionHandler>;

  const recipeService: RecipeServiceMock = {
    ingestPosVersion: ingestPosVersionMock,
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [InventoryMovementController],
      providers: [
        {
          provide: InventoryPurchaseService,
          useValue: {
            previewPurchase: jest.fn(),
            recordPurchase: jest.fn(),
          },
        },
        {
          provide: FxRateResolverService,
          useValue: fxRateResolverService,
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
          useValue: recipeService,
        },
        {
          provide: CountSessionService,
          useValue: {
            replayCountSession: jest.fn(),
          },
        },
        {
          provide: ProductionService,
          useValue: {
            replayProductionClose: jest.fn(),
          },
        },
        {
          provide: InventoryReportsService,
          useValue: {
            getAlertsSummaryReport: jest.fn(),
          },
        },
        TenantInterceptor,
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
      // Device transport routes (movements/sync, shrinkage, recipes/versions)
      // declare SyncTransportGuard per-route; this suite verifies route
      // behavior, so the guard is replaced by the fail-closed device fixture
      // above while the dedicated spec in
      // inventory-movement.controller.spec.ts proves the real guard for real.
      .overrideGuard(SyncTransportGuard)
      .useValue(deviceTransportGuardOverride)
      .compile();

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
    persistedDocuments.clear();
    recipeService.ingestPosVersion.mockClear();
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
    signIdentityJwtAccessToken(jwtService, {
      sub: 'user-1',
      email: 'manager@example.com',
      role: UserRole.MANAGER,
      tenant_id: 'tenant-A',
      ...overrides,
    });

  it('returns 401 when no bearer token is provided', async () => {
    await request(app.getHttpServer())
      .post(`${INVENTORY_API_PREFIX}/recipes/versions`)
      .send(validRecipeVersionPayload)
      .expect(401);

    expect(recipeService.ingestPosVersion).not.toHaveBeenCalled();
  });

  it('returns 401 when a human bearer reaches the device transport route', async () => {
    // Re-pointed (ST-03, issue #478): the former case asserted a human token
    // lacking tenant context, which tested the retired human transport's
    // tenant source. On device transport the tenant comes from the device
    // principal the guard validated, and a human session bearer is not an
    // accepted transport at all, so a manager JWT must fail closed.
    const token = signToken();

    await request(app.getHttpServer())
      .post(`${INVENTORY_API_PREFIX}/recipes/versions`)
      .set('Authorization', `Bearer ${token}`)
      .send(validRecipeVersionPayload)
      .expect(401);

    expect(recipeService.ingestPosVersion).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid request body before hitting the service', async () => {
    const invalidPayload = {
      ...validRecipeVersionPayload,
      components: [],
    };

    await request(app.getHttpServer())
      .post(`${INVENTORY_API_PREFIX}/recipes/versions`)
      .set('Authorization', deviceAuth())
      .send(invalidPayload)
      .expect(400);

    expect(recipeService.ingestPosVersion).not.toHaveBeenCalled();
  });

  it('extracts tenant_id from the device principal and delegates the validated body', async () => {
    const response = await request(app.getHttpServer())
      .post(`${INVENTORY_API_PREFIX}/recipes/versions`)
      .set('Authorization', deviceAuth('tenant-XYZ'))
      .send(validRecipeVersionPayload)
      .expect(201);

    const body = response.body as RecipeVersionIngestionResponseBody;
    expect(body).toEqual({
      recipeVersionId: `recipe-version-${validRecipeVersionPayload.id}`,
      replaced: false,
    });

    const delegatedInput = recipeService.ingestPosVersion.mock.calls[0][0];

    expect(delegatedInput.tenantId).toBe('tenant-XYZ');
    expect(delegatedInput.dto.id).toBe(validRecipeVersionPayload.id);
    expect(delegatedInput.dto.productId).toBe(
      validRecipeVersionPayload.productId,
    );
  });

  it('treats reposting the same document as an idempotent replacement at the HTTP layer', async () => {
    const tenantId = 'tenant-idempotent';

    const firstResponse = await request(app.getHttpServer())
      .post(`${INVENTORY_API_PREFIX}/recipes/versions`)
      .set('Authorization', deviceAuth(tenantId))
      .send(validRecipeVersionPayload)
      .expect(201);

    const secondResponse = await request(app.getHttpServer())
      .post(`${INVENTORY_API_PREFIX}/recipes/versions`)
      .set('Authorization', deviceAuth(tenantId))
      .send(validRecipeVersionPayload)
      .expect(201);

    expect(firstResponse.body as RecipeVersionIngestionResponseBody).toEqual({
      recipeVersionId: `recipe-version-${validRecipeVersionPayload.id}`,
      replaced: false,
    });
    expect(secondResponse.body as RecipeVersionIngestionResponseBody).toEqual({
      recipeVersionId: `recipe-version-${validRecipeVersionPayload.id}`,
      replaced: true,
    });

    const persistedDocument = persistedDocuments.get(
      `${tenantId}:${validRecipeVersionPayload.id}`,
    );

    expect(recipeService.ingestPosVersion).toHaveBeenCalledTimes(2);
    expect(persistedDocuments.size).toBe(1);
    expect(persistedDocument).toEqual({
      detailCount: validRecipeVersionPayload.components.length,
      productId: validRecipeVersionPayload.productId,
      recipeVersionId: `recipe-version-${validRecipeVersionPayload.id}`,
      versionRowCount: 1,
      writeCount: 2,
    });
  });
});
