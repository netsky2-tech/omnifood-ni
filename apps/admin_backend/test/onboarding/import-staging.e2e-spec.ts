import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, FindManyOptions, FindOneOptions } from 'typeorm';
import { TenantInterceptor } from '../../src/core/database/rls.interceptor';
import { ImportStagingController } from '../../src/modules/onboarding/controllers/import-staging.controller';
import { ImportStagingService } from '../../src/modules/onboarding/services/import-staging.service';
import {
  ImportStaging,
  ImportStagingStatus,
} from '../../src/modules/onboarding/entities/import-staging.entity';
import { Product } from '../../src/modules/inventory/entities/product.entity';
import {
  UploadSummaryResponse,
  CommitSummaryResponse,
  RowErrorDiagnostic,
} from '../../src/modules/onboarding/dto/import-staging.dto';
import { UserRole } from '../../src/modules/identity/entities/user.entity';
import { AuthGuard } from '../../src/modules/identity/guards/auth.guard';
import { RolesGuard } from '../../src/modules/identity/guards/roles.guard';
import { JWT_TOKEN_TYPES } from '../../src/modules/identity/security/jwt-token.types';

const API_PREFIX = '/api/onboarding/import';

interface ErrorResponseBody {
  message: string | string[];
  error?: string;
  statusCode?: number;
}

describe('ImportStaging (Integration & E2E)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;

  // In-memory simulated DB tables
  let dbStaging: ImportStaging[] = [];
  let dbProducts: Product[] = [];

  const stagingRepo = {
    find: jest.fn((options: FindManyOptions<ImportStaging>) => {
      const where = options.where as {
        tenant_id?: string;
        token_sesion_importacion?: string;
      };
      return Promise.resolve(
        dbStaging.filter(
          (s) =>
            s.tenant_id === where?.tenant_id &&
            (where.token_sesion_importacion === undefined ||
              s.token_sesion_importacion === where.token_sesion_importacion),
        ),
      );
    }),
  };

  const productRepo = {
    find: jest.fn((options: FindManyOptions<Product>) => {
      const where = options.where as { tenant_id?: string };
      return Promise.resolve(
        dbProducts.filter((p) => p.tenant_id === where?.tenant_id),
      );
    }),
  };

  const manager = {
    find: jest.fn(
      (
        entityClass: unknown,
        options?: FindManyOptions<ImportStaging | Product>,
      ) => {
        const where = options?.where as
          | { tenant_id?: string; token_sesion_importacion?: string }
          | undefined;
        if (entityClass === ImportStaging) {
          return Promise.resolve(
            dbStaging.filter(
              (s) =>
                s.tenant_id === where?.tenant_id &&
                (where?.token_sesion_importacion === undefined ||
                  s.token_sesion_importacion ===
                    where.token_sesion_importacion),
            ),
          );
        }
        if (entityClass === Product) {
          return Promise.resolve(
            dbProducts.filter((p) => p.tenant_id === where?.tenant_id),
          );
        }
        return Promise.resolve([]);
      },
    ),
    findOne: jest.fn(
      (entityClass: unknown, options?: FindOneOptions<Product>) => {
        const where = options?.where as
          | { tenant_id?: string; id?: string }
          | undefined;
        if (entityClass === Product) {
          return Promise.resolve(
            dbProducts.find(
              (p) => p.tenant_id === where?.tenant_id && p.id === where?.id,
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
        createdAt: new Date(),
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
        if (entityClass === ImportStaging) {
          const existingIdx = dbStaging.findIndex((s) => s.id === withId.id);
          if (existingIdx >= 0) {
            dbStaging[existingIdx] = withId as unknown as ImportStaging;
          } else {
            dbStaging.push(withId as unknown as ImportStaging);
          }
        }
        if (entityClass === Product) {
          const existingIdx = dbProducts.findIndex((p) => p.id === withId.id);
          if (existingIdx >= 0) {
            dbProducts[existingIdx] = withId as unknown as Product;
          } else {
            dbProducts.push(withId as unknown as Product);
          }
        }
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
      controllers: [ImportStagingController],
      providers: [
        ImportStagingService,
        {
          provide: 'ImportStagingRepository',
          useValue: stagingRepo,
        },
        {
          provide: 'ProductRepository',
          useValue: productRepo,
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
    dbStaging = [];
    dbProducts = [];
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
    await request(app.getHttpServer())
      .post(`${API_PREFIX}/upload`)
      .send({ rows: [{ nombre: 'Cafe', precioVenta: 50 }] })
      .expect(401);
  });

  it('returns 401 when token lacks tenant context', async () => {
    const token = signToken({ tenant_id: '' });

    await request(app.getHttpServer())
      .post(`${API_PREFIX}/upload`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rows: [{ nombre: 'Cafe', precioVenta: 50 }] })
      .expect(401);
  });

  it('returns 403 when user has CASHIER role', async () => {
    const token = signToken({ role: UserRole.CASHIER });

    await request(app.getHttpServer())
      .post(`${API_PREFIX}/upload`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rows: [{ nombre: 'Cafe', precioVenta: 50 }] })
      .expect(403);
  });

  it('returns 400 when rows array is empty', async () => {
    const token = signToken();

    await request(app.getHttpServer())
      .post(`${API_PREFIX}/upload`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rows: [] })
      .expect(400);
  });

  it('processes batch upload, stages valid & invalid rows and returns diagnostics (UC-01)', async () => {
    const token = signToken({ tenant_id: 'tenant-A' });

    const payload = {
      rows: [
        {
          nombre: 'Gaseosa Coca Cola 500ml',
          sku: 'CC-500',
          precioVenta: 'C$ 35.00',
          costoInsumo: 'C$ 20.00',
          categoria: 'Bebidas',
          stockInicial: '50',
        },
        {
          nombre: 'Papas Lays',
          sku: 'LAY-01',
          precioVenta: 'Gratis', // Non-numeric -> ERROR
        },
        {
          nombre: 'Agua Purificada 1L',
          sku: 'AG-100',
          precioVenta: '20.00',
          costoInsumo: '-5.00', // Negative cost -> ERROR
        },
      ],
    };

    const response = await request(app.getHttpServer())
      .post(`${API_PREFIX}/upload`)
      .set('Authorization', `Bearer ${token}`)
      .send(payload)
      .expect(201);

    const body = response.body as UploadSummaryResponse;
    expect(body.totalRows).toBe(3);
    expect(body.validRows).toBe(1);
    expect(body.errorRows).toBe(2);
    expect(body.errors).toHaveLength(2);
    expect(body.sessionToken).toBeDefined();

    expect(dbStaging).toHaveLength(3);
    const validRows = dbStaging.filter(
      (s) => s.estado_fila === ImportStagingStatus.VALIDO,
    );
    expect(validRows).toHaveLength(1);
    expect(validRows[0].parsed_precio_venta).toBe(35);
  });

  it('retrieves failed rows diagnostics for user correction via GET /errors/:sessionToken', async () => {
    const token = signToken({ tenant_id: 'tenant-A' });

    // 1. Upload mixed batch
    const uploadRes = await request(app.getHttpServer())
      .post(`${API_PREFIX}/upload`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        rows: [
          { nombre: 'Invalido 1', precioVenta: 'Texto' },
          { nombre: 'Valido 1', precioVenta: 100 },
        ],
      })
      .expect(201);

    const sessionToken = (uploadRes.body as UploadSummaryResponse).sessionToken;

    // 2. Fetch error diagnostics
    const errorRes = await request(app.getHttpServer())
      .get(`${API_PREFIX}/errors/${sessionToken}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const errorBody = errorRes.body as RowErrorDiagnostic[];
    expect(errorBody).toHaveLength(1);
    expect(errorBody[0].rawNombre).toBe('Invalido 1');
    expect(errorBody[0].reason).toContain('precio');
  });

  it('rejects commit in ALL_OR_NOTHING mode when batch contains invalid rows', async () => {
    const token = signToken({ tenant_id: 'tenant-A' });

    const uploadRes = await request(app.getHttpServer())
      .post(`${API_PREFIX}/upload`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        rows: [
          { nombre: 'Valido', precioVenta: 100 },
          { nombre: 'Invalido', precioVenta: 'N/A' },
        ],
      })
      .expect(201);

    const sessionToken = (uploadRes.body as UploadSummaryResponse).sessionToken;

    const commitRes = await request(app.getHttpServer())
      .post(`${API_PREFIX}/commit`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        sessionToken,
        mode: 'ALL_OR_NOTHING',
      })
      .expect(400);

    const errBody = commitRes.body as ErrorResponseBody;
    expect(errBody.message).toContain('ALL_OR_NOTHING');
    expect(dbProducts).toHaveLength(0);
  });

  it('commits valid rows in VALID_ONLY mode and moves products into live catalog', async () => {
    const token = signToken({ tenant_id: 'tenant-A' });

    const uploadRes = await request(app.getHttpServer())
      .post(`${API_PREFIX}/upload`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        rows: [
          {
            nombre: 'Capuchino Vainilla',
            precioVenta: '110.00',
            costoInsumo: '45.00',
            categoria: 'Cafetería',
            stockInicial: '15',
          },
          { nombre: 'Invalido', precioVenta: 'NoNumeric' },
        ],
      })
      .expect(201);

    const sessionToken = (uploadRes.body as UploadSummaryResponse).sessionToken;

    const commitRes = await request(app.getHttpServer())
      .post(`${API_PREFIX}/commit`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        sessionToken,
        mode: 'VALID_ONLY',
      })
      .expect(201);

    const commitBody = commitRes.body as CommitSummaryResponse;
    expect(commitBody.productsCreated).toBe(1);
    expect(commitBody.totalCommitted).toBe(1);

    expect(dbProducts).toHaveLength(1);
    expect(dbProducts[0].name).toBe('Capuchino Vainilla');
    expect(dbProducts[0].sellPrice).toBe(110);
    expect(dbProducts[0].averageCost).toBe(45);
    expect(dbProducts[0].stock).toBe(15);
  });

  it('handles duplicates on commit with REPLACE mode updating existing products (UC-03)', async () => {
    const token = signToken({ tenant_id: 'tenant-A' });

    // Seed existing product in live catalog
    dbProducts.push({
      id: 'prod-original',
      tenant_id: 'tenant-A',
      tenant: null,
      warehouse_id: 'wh-1',
      name: 'Toña 350ml',
      uom: 'UN',
      sellPrice: 50,
      averageCost: 30,
      stock: 10,
      is_perishable: false,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Upload batch with updated prices
    const uploadRes = await request(app.getHttpServer())
      .post(`${API_PREFIX}/upload`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        rows: [
          {
            nombre: 'Toña 350ml',
            precioVenta: '65.00', // Updated price
            costoInsumo: '35.00',
            stockInicial: '50',
          },
        ],
      })
      .expect(201);

    const sessionToken = (uploadRes.body as UploadSummaryResponse).sessionToken;

    const commitRes = await request(app.getHttpServer())
      .post(`${API_PREFIX}/commit`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        sessionToken,
        mode: 'VALID_ONLY',
        duplicateResolution: 'REPLACE',
      })
      .expect(201);

    const commitBody = commitRes.body as CommitSummaryResponse;
    expect(commitBody.productsCreated).toBe(0);
    expect(commitBody.productsUpdated).toBe(1);
    expect(commitBody.totalCommitted).toBe(1);

    expect(dbProducts).toHaveLength(1);
    expect(dbProducts[0].sellPrice).toBe(65);
    expect(dbProducts[0].averageCost).toBe(35);
    expect(dbProducts[0].stock).toBe(50);
  });

  it('guarantees multi-tenant isolation across upload and commit operations', async () => {
    const tokenA = signToken({ tenant_id: 'tenant-ALPHA' });
    const tokenB = signToken({ tenant_id: 'tenant-BETA' });

    // Tenant Alpha uploads batch
    const resUploadA = await request(app.getHttpServer())
      .post(`${API_PREFIX}/upload`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        rows: [{ nombre: 'Producto Alpha', precioVenta: 100 }],
      })
      .expect(201);

    const sessionTokenA = (resUploadA.body as UploadSummaryResponse)
      .sessionToken;

    // Tenant Beta cannot commit Tenant Alpha's session
    await request(app.getHttpServer())
      .post(`${API_PREFIX}/commit`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        sessionToken: sessionTokenA,
        mode: 'VALID_ONLY',
      })
      .expect(404);

    // Tenant Alpha commits session
    await request(app.getHttpServer())
      .post(`${API_PREFIX}/commit`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        sessionToken: sessionTokenA,
        mode: 'VALID_ONLY',
      })
      .expect(201);

    expect(
      dbProducts.filter((p) => p.tenant_id === 'tenant-ALPHA'),
    ).toHaveLength(1);
    expect(
      dbProducts.filter((p) => p.tenant_id === 'tenant-BETA'),
    ).toHaveLength(0);
  });
});
