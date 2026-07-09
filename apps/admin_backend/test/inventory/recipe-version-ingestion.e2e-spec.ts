import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import {
  type IngestPosVersionInput,
  type IngestPosVersionResult,
  RecipeService,
} from '../../src/modules/inventory/recipe.service';
import { ShrinkageService } from '../../src/modules/inventory/shrinkage.service';
import { TenantInterceptor } from '../../src/core/database/rls.interceptor';
import { AuthGuard } from '../../src/modules/identity/guards/auth.guard';
import { RolesGuard } from '../../src/modules/identity/guards/roles.guard';
import { UserRole } from '../../src/modules/identity/entities/user.entity';

const JWT_SECRET = process.env.JWT_SECRET?.trim() || 'test-secret';

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

type RecipeIngestionHandler = (
  input: IngestPosVersionInput,
) => Promise<IngestPosVersionResult>;

interface RecipeServiceMock {
  ingestPosVersion: jest.MockedFunction<RecipeIngestionHandler>;
}

interface UnauthorizedResponseBody {
  message: string;
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

  it('returns 401 when no bearer token is provided', async () => {
    await request(app.getHttpServer())
      .post(`${INVENTORY_API_PREFIX}/recipes/versions`)
      .send(validRecipeVersionPayload)
      .expect(401);

    expect(recipeService.ingestPosVersion).not.toHaveBeenCalled();
  });

  it('returns 401 when the authenticated token lacks tenant context', async () => {
    const token = signToken({ tenant_id: undefined });

    const response = await request(app.getHttpServer())
      .post(`${INVENTORY_API_PREFIX}/recipes/versions`)
      .set('Authorization', `Bearer ${token}`)
      .send(validRecipeVersionPayload)
      .expect(401);

    const body = response.body as UnauthorizedResponseBody;
    expect(body.message).toBe('Tenant context is required');

    expect(recipeService.ingestPosVersion).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid request body before hitting the service', async () => {
    const token = signToken();
    const invalidPayload = {
      ...validRecipeVersionPayload,
      components: [],
    };

    await request(app.getHttpServer())
      .post(`${INVENTORY_API_PREFIX}/recipes/versions`)
      .set('Authorization', `Bearer ${token}`)
      .send(invalidPayload)
      .expect(400);

    expect(recipeService.ingestPosVersion).not.toHaveBeenCalled();
  });

  it('extracts tenant_id from the auth token and delegates the validated body', async () => {
    const token = signToken({ tenant_id: 'tenant-XYZ' });

    const response = await request(app.getHttpServer())
      .post(`${INVENTORY_API_PREFIX}/recipes/versions`)
      .set('Authorization', `Bearer ${token}`)
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
    const token = signToken({ tenant_id: tenantId });

    const firstResponse = await request(app.getHttpServer())
      .post(`${INVENTORY_API_PREFIX}/recipes/versions`)
      .set('Authorization', `Bearer ${token}`)
      .send(validRecipeVersionPayload)
      .expect(201);

    const secondResponse = await request(app.getHttpServer())
      .post(`${INVENTORY_API_PREFIX}/recipes/versions`)
      .set('Authorization', `Bearer ${token}`)
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
