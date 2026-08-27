import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, FindManyOptions, FindOneOptions } from 'typeorm';
import { TenantInterceptor } from '../../src/core/database/rls.interceptor';
import { IndustryTemplateController } from '../../src/modules/onboarding/controllers/industry-template.controller';
import { IndustryTemplateService } from '../../src/modules/onboarding/services/industry-template.service';
import { IndustryTemplate } from '../../src/modules/onboarding/entities/industry-template.entity';
import {
  Insumo,
  NEGATIVE_STOCK_POLICY,
} from '../../src/modules/inventory/entities/insumo.entity';
import { Product } from '../../src/modules/inventory/entities/product.entity';
import { RecipeVersion } from '../../src/modules/inventory/entities/recipe-version.entity';
import { RecipeDetail } from '../../src/modules/inventory/entities/recipe-detail.entity';
import { Recipe } from '../../src/modules/inventory/entities/recipe.entity';
import { UomConversion } from '../../src/modules/inventory/entities/uom-conversion.entity';
import { UserRole } from '../../src/modules/identity/entities/user.entity';
import { AuthGuard } from '../../src/modules/identity/guards/auth.guard';
import { RolesGuard } from '../../src/modules/identity/guards/roles.guard';
import { JWT_TOKEN_TYPES } from '../../src/modules/identity/security/jwt-token.types';

const API_PREFIX = '/api/onboarding/templates';

interface ErrorResponseBody {
  message: string | string[];
  error?: string;
  statusCode?: number;
}

interface TemplateSummaryResponseBody {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  insumoCount: number;
  productCount: number;
}

type TemplateDetailResponseBody = IndustryTemplate;

describe('IndustryTemplate (Integration & E2E)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;

  const mockTemplates: IndustryTemplate[] = [
    {
      id: 'CAFETERIA',
      code: 'CAFETERIA',
      name: 'Cafetería & Coffee Shop',
      description: 'Plantilla especializada en café de especialidad y bebidas.',
      icon: 'coffee',
      is_active: true,
      created_at: new Date('2026-01-01'),
      updated_at: new Date('2026-01-01'),
      templateInsumos: [
        {
          id: 'ti-1',
          template_id: 'CAFETERIA',
          template: null,
          name: 'Granos de Café Especial',
          purchase_uom: 'KG',
          consumption_uom: 'G',
          conversion_factor: 1000,
          par_level: 10000,
          min_stock: 2000,
          is_perishable: false,
          negative_stock_policy: NEGATIVE_STOCK_POLICY.RESTRICT,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: 'ti-2',
          template_id: 'CAFETERIA',
          template: null,
          name: 'Leche Entera',
          purchase_uom: 'L',
          consumption_uom: 'ML',
          conversion_factor: 1000,
          par_level: 20000,
          min_stock: 5000,
          is_perishable: true,
          negative_stock_policy: NEGATIVE_STOCK_POLICY.RESTRICT,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
      templateProducts: [
        {
          id: 'tp-1',
          template_id: 'CAFETERIA',
          template: null,
          name: 'Capuchino 8oz',
          category: 'Bebidas Calientes',
          uom: 'UN',
          suggested_price: 95.0,
          is_perishable: false,
          created_at: new Date(),
          updated_at: new Date(),
          recipeItems: [
            {
              id: 'tri-1',
              template_product_id: 'tp-1',
              templateProduct: null,
              template_insumo_name: 'Granos de Café Especial',
              gross_quantity: 18,
              technical_shrink_pct: 0,
              component_uom: 'G',
              created_at: new Date(),
              updated_at: new Date(),
            },
            {
              id: 'tri-2',
              template_product_id: 'tp-1',
              templateProduct: null,
              template_insumo_name: 'Leche Entera',
              gross_quantity: 150,
              technical_shrink_pct: 0,
              component_uom: 'ML',
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        },
      ],
    },
    {
      id: 'BAR_RESTAURANTE',
      code: 'BAR_RESTAURANTE',
      name: 'Bar & Restaurante',
      description: 'Plantilla para gastronomía y coctelería.',
      icon: 'utensils',
      is_active: true,
      created_at: new Date('2026-01-01'),
      updated_at: new Date('2026-01-01'),
      templateInsumos: [],
      templateProducts: [],
    },
    {
      id: 'RETAIL_MINIMARKET',
      code: 'RETAIL_MINIMARKET',
      name: 'Retail & Minimarket',
      description: 'Plantilla para abarrotes y snacks.',
      icon: 'shopping-cart',
      is_active: true,
      created_at: new Date('2026-01-01'),
      updated_at: new Date('2026-01-01'),
      templateInsumos: [],
      templateProducts: [],
    },
  ];

  // In-memory persistent state for simulated DB
  let dbInsumos: Insumo[] = [];
  let dbProducts: Product[] = [];
  let dbRecipeVersions: RecipeVersion[] = [];
  let dbRecipeDetails: RecipeDetail[] = [];
  let dbRecipes: Recipe[] = [];
  let dbConversions: UomConversion[] = [];

  const templateRepo = {
    find: jest.fn(() => Promise.resolve(mockTemplates)),
    findOne: jest.fn((options: FindOneOptions<IndustryTemplate>) => {
      const where = options.where;
      let codeOrId: string | undefined;
      if (Array.isArray(where)) {
        const item = where[0] as { code?: string; id?: string };
        codeOrId = item.code ?? item.id;
      } else if (where && typeof where === 'object') {
        const item = where as { code?: string; id?: string };
        codeOrId = item.code ?? item.id;
      }
      const found = mockTemplates.find(
        (t) => t.code === codeOrId || t.id === codeOrId,
      );
      return Promise.resolve(found || null);
    }),
  };

  const manager = {
    query: jest.fn().mockResolvedValue(undefined),
    find: jest.fn(
      (
        entityClass: unknown,
        options?: FindManyOptions<Insumo | Product | RecipeVersion>,
      ) => {
        const where = options?.where as { tenant_id?: string } | undefined;
        const tenantId = where?.tenant_id;
        if (entityClass === Insumo) {
          return Promise.resolve(
            dbInsumos.filter((i) => i.tenant_id === tenantId),
          );
        }
        if (entityClass === Product) {
          return Promise.resolve(
            dbProducts.filter((p) => p.tenant_id === tenantId),
          );
        }
        if (entityClass === RecipeVersion) {
          return Promise.resolve(
            dbRecipeVersions.filter((r) => r.tenant_id === tenantId),
          );
        }
        return Promise.resolve([]);
      },
    ),
    findOne: jest.fn(
      (entityClass: unknown, options?: FindOneOptions<RecipeVersion>) => {
        const where = options?.where as
          | { tenant_id?: string; product_id?: string; is_active?: boolean }
          | undefined;
        const tenantId = where?.tenant_id;
        const productId = where?.product_id;
        if (entityClass === RecipeVersion) {
          return Promise.resolve(
            dbRecipeVersions.find(
              (r) =>
                r.tenant_id === tenantId &&
                r.product_id === productId &&
                r.is_active,
            ) || null,
          );
        }
        return Promise.resolve(null);
      },
    ),
    create: jest.fn(
      (_entityClass: unknown, plain: Record<string, unknown>) => ({
        ...plain,
        id:
          (plain.id as string) ||
          `gen-id-${Math.random().toString(36).substring(7)}`,
      }),
    ),
    save: jest.fn((entityClass: unknown, item: unknown) => {
      const saveItem = (obj: Record<string, unknown>) => {
        const withId = {
          ...obj,
          id:
            (obj.id as string) ||
            `saved-id-${Math.random().toString(36).substring(7)}`,
        };
        if (entityClass === Insumo) dbInsumos.push(withId as unknown as Insumo);
        if (entityClass === Product)
          dbProducts.push(withId as unknown as Product);
        if (entityClass === RecipeVersion)
          dbRecipeVersions.push(withId as unknown as RecipeVersion);
        if (entityClass === RecipeDetail)
          dbRecipeDetails.push(withId as unknown as RecipeDetail);
        if (entityClass === Recipe) dbRecipes.push(withId as unknown as Recipe);
        if (entityClass === UomConversion)
          dbConversions.push(withId as unknown as UomConversion);
        return withId;
      };
      if (Array.isArray(item)) {
        return Promise.resolve(
          (item as Record<string, unknown>[]).map(saveItem),
        );
      }
      return Promise.resolve(saveItem(item as Record<string, unknown>));
    }),
  };

  const dataSource = {
    transaction: jest.fn((cb: (mgr: typeof manager) => Promise<unknown>) =>
      cb(manager),
    ),
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET =
      'test-only-jwt-secret-with-at-least-thirty-two-bytes';
    process.env.JWT_ISSUER = 'omnifood-admin';
    process.env.JWT_AUDIENCE = 'omnifood-pos';
    process.env.JWT_ACCESS_TTL_SECONDS = '3600';
    process.env.JWT_REFRESH_TTL_SECONDS = '604800';
    process.env.JWT_CLOCK_TOLERANCE_SECONDS = '5';
    process.env.JWT_ALGORITHM = 'HS256';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      controllers: [IndustryTemplateController],
      providers: [
        IndustryTemplateService,
        {
          provide: 'IndustryTemplateRepository',
          useValue: templateRepo,
        },
        {
          provide: 'TemplateInsumoRepository',
          useValue: {},
        },
        {
          provide: 'TemplateProductRepository',
          useValue: {},
        },
        {
          provide: 'TemplateRecipeItemRepository',
          useValue: {},
        },
        {
          provide: 'InsumoRepository',
          useValue: {},
        },
        {
          provide: 'ProductRepository',
          useValue: {},
        },
        {
          provide: 'RecipeVersionRepository',
          useValue: {},
        },
        {
          provide: 'RecipeDetailRepository',
          useValue: {},
        },
        {
          provide: 'RecipeRepository',
          useValue: {},
        },
        {
          provide: 'UomConversionRepository',
          useValue: {},
        },
        {
          provide: DataSource,
          useValue: dataSource,
        },
        TenantInterceptor,
        AuthGuard,
        RolesGuard,
        Reflector,
        JwtService,
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
    dbInsumos = [];
    dbProducts = [];
    dbRecipeVersions = [];
    dbRecipeDetails = [];
    dbRecipes = [];
    dbConversions = [];
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
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
        sub: overrides.sub ?? 'user-1',
        email: overrides.email ?? 'manager@example.com',
        role: overrides.role ?? UserRole.MANAGER,
        tenant_id:
          overrides.tenant_id !== undefined ? overrides.tenant_id : 'tenant-A',
        is_active: true,
        token_type: JWT_TOKEN_TYPES.ACCESS,
        security_version: 1,
      },
      {
        secret: process.env.JWT_SECRET,
        issuer: process.env.JWT_ISSUER,
        audience: process.env.JWT_AUDIENCE,
        expiresIn: '1h',
      },
    );

  it('returns 401 when unauthenticated', async () => {
    await request(app.getHttpServer()).get(API_PREFIX).expect(401);
  });

  it('returns 401 when token lacks tenant context', async () => {
    const token = signToken({ tenant_id: '' });

    await request(app.getHttpServer())
      .post(`${API_PREFIX}/CAFETERIA/apply`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(401);
  });

  it('returns 403 when user has CASHIER role', async () => {
    const token = signToken({ role: UserRole.CASHIER });

    await request(app.getHttpServer())
      .get(API_PREFIX)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('returns 200 with all industry templates for authenticated manager', async () => {
    const token = signToken();

    const response = await request(app.getHttpServer())
      .get(API_PREFIX)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const body = response.body as TemplateSummaryResponseBody[];
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(3);
    expect(body[0]).toMatchObject({
      id: 'CAFETERIA',
      code: 'CAFETERIA',
      name: 'Cafetería & Coffee Shop',
      insumoCount: 2,
      productCount: 1,
    });
  });

  it('returns 200 with template detail for valid template code', async () => {
    const token = signToken();

    const response = await request(app.getHttpServer())
      .get(`${API_PREFIX}/CAFETERIA`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const body = response.body as TemplateDetailResponseBody;
    expect(body).toMatchObject({
      id: 'CAFETERIA',
      code: 'CAFETERIA',
      name: 'Cafetería & Coffee Shop',
    });
    expect(body.templateInsumos).toHaveLength(2);
    expect(body.templateProducts).toHaveLength(1);
  });

  it('returns 404 when requested template does not exist', async () => {
    const token = signToken();

    const response = await request(app.getHttpServer())
      .get(`${API_PREFIX}/NON_EXISTENT_TEMPLATE`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    const body = response.body as ErrorResponseBody;
    expect(body.message).toContain('not found');
  });

  it('returns 201 and applies template creating insumos, products, conversions, and recipes', async () => {
    const token = signToken({ tenant_id: 'tenant-A' });

    const response = await request(app.getHttpServer())
      .post(`${API_PREFIX}/CAFETERIA/apply`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(201);

    expect(response.body).toEqual({
      tenantId: 'tenant-A',
      templateCode: 'CAFETERIA',
      insumosCreated: 2,
      insumosSkipped: 0,
      productsCreated: 1,
      productsSkipped: 0,
      recipesCreated: 1,
    });

    expect(dbInsumos.filter((i) => i.tenant_id === 'tenant-A')).toHaveLength(2);
    expect(dbProducts.filter((p) => p.tenant_id === 'tenant-A')).toHaveLength(
      1,
    );
    expect(
      dbRecipeVersions.filter((r) => r.tenant_id === 'tenant-A'),
    ).toHaveLength(1);
    expect(
      dbRecipeDetails.filter((r) => r.tenant_id === 'tenant-A'),
    ).toHaveLength(2);
    expect(
      dbConversions.filter((c) => c.tenant_id === 'tenant-A'),
    ).toHaveLength(2);
  });

  it('is strictly idempotent on re-apply: skips existing items and creates 0 duplicates', async () => {
    const token = signToken({ tenant_id: 'tenant-A' });

    // First apply
    await request(app.getHttpServer())
      .post(`${API_PREFIX}/CAFETERIA/apply`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(201);

    // Second apply
    const response = await request(app.getHttpServer())
      .post(`${API_PREFIX}/CAFETERIA/apply`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(201);

    expect(response.body).toEqual({
      tenantId: 'tenant-A',
      templateCode: 'CAFETERIA',
      insumosCreated: 0,
      insumosSkipped: 2,
      productsCreated: 0,
      productsSkipped: 1,
      recipesCreated: 0,
    });

    // Counts remain unchanged
    expect(dbInsumos.filter((i) => i.tenant_id === 'tenant-A')).toHaveLength(2);
    expect(dbProducts.filter((p) => p.tenant_id === 'tenant-A')).toHaveLength(
      1,
    );
    expect(
      dbRecipeVersions.filter((r) => r.tenant_id === 'tenant-A'),
    ).toHaveLength(1);
  });

  it('guarantees multi-tenant isolation between distinct tenants', async () => {
    const tokenA = signToken({ tenant_id: 'tenant-ALPHA' });
    const tokenB = signToken({ tenant_id: 'tenant-BETA' });

    // Apply CAFETERIA to Tenant ALPHA
    await request(app.getHttpServer())
      .post(`${API_PREFIX}/CAFETERIA/apply`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({})
      .expect(201);

    // Apply CAFETERIA to Tenant BETA
    await request(app.getHttpServer())
      .post(`${API_PREFIX}/CAFETERIA/apply`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({})
      .expect(201);

    const alphaInsumos = dbInsumos.filter(
      (i) => i.tenant_id === 'tenant-ALPHA',
    );
    const betaInsumos = dbInsumos.filter((i) => i.tenant_id === 'tenant-BETA');

    expect(alphaInsumos).toHaveLength(2);
    expect(betaInsumos).toHaveLength(2);
    expect(alphaInsumos[0].id).not.toBe(betaInsumos[0].id);

    const alphaProducts = dbProducts.filter(
      (p) => p.tenant_id === 'tenant-ALPHA',
    );
    const betaProducts = dbProducts.filter(
      (p) => p.tenant_id === 'tenant-BETA',
    );

    expect(alphaProducts).toHaveLength(1);
    expect(betaProducts).toHaveLength(1);
    expect(alphaProducts[0].id).not.toBe(betaProducts[0].id);
  });
});
