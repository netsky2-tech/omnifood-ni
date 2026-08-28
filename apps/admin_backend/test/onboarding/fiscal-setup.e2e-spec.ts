import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, FindManyOptions, FindOneOptions } from 'typeorm';
import { TenantInterceptor } from '../../src/core/database/rls.interceptor';
import { FiscalSetupController } from '../../src/modules/onboarding/controllers/fiscal-setup.controller';
import {
  FiscalSetupService,
  FiscalRegime,
} from '../../src/modules/onboarding/services/fiscal-setup.service';
import { FiscalSetupResponse } from '../../src/modules/onboarding/dto/fiscal-setup.dto';
import { Tenant } from '../../src/modules/tenant/entities/tenant.entity';
import { SystemParametersConfig } from '../../src/modules/inventory/entities/system-parameters-config.entity';
import { UserRole } from '../../src/modules/identity/entities/user.entity';
import { AuthGuard } from '../../src/modules/identity/guards/auth.guard';
import { RolesGuard } from '../../src/modules/identity/guards/roles.guard';
import { JWT_TOKEN_TYPES } from '../../src/modules/identity/security/jwt-token.types';

const API_PREFIX = '/api/onboarding/fiscal-setup';

interface BadRequestResponseBody {
  message: string[];
  error: string;
  statusCode: number;
}

describe('FiscalSetup (Integration & E2E)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;

  // In-memory simulated DB tables
  let dbTenants: Tenant[] = [];
  let dbSysParams: SystemParametersConfig[] = [];

  const tenantRepo = {
    findOne: jest.fn((options: FindOneOptions<Tenant>) => {
      const where = options.where as { id?: string };
      return Promise.resolve(dbTenants.find((t) => t.id === where?.id) || null);
    }),
    save: jest.fn((entity: Tenant) => {
      const existingIdx = dbTenants.findIndex((t) => t.id === entity.id);
      if (existingIdx >= 0) {
        dbTenants[existingIdx] = { ...entity };
      } else {
        dbTenants.push({ ...entity });
      }
      return Promise.resolve(entity);
    }),
  };

  const sysParamRepo = {
    find: jest.fn((options: FindManyOptions<SystemParametersConfig>) => {
      const where = options.where as { tenant_id?: string; isActive?: boolean };
      return Promise.resolve(
        dbSysParams.filter(
          (p) =>
            p.tenant_id === where?.tenant_id &&
            (where.isActive === undefined || p.isActive === where.isActive),
        ),
      );
    }),
  };

  const manager = {
    findOne: jest.fn(
      (entityClass: unknown, options: FindOneOptions<Tenant>) => {
        if (entityClass === Tenant) {
          const where = options.where as { id?: string };
          return Promise.resolve(
            dbTenants.find((t) => t.id === where?.id) || null,
          );
        }
        return Promise.resolve(null);
      },
    ),
    find: jest.fn(
      (
        entityClass: unknown,
        options: FindManyOptions<SystemParametersConfig>,
      ) => {
        if (entityClass === SystemParametersConfig) {
          const where = options.where as {
            tenant_id?: string;
            paramKey?: string;
            isActive?: boolean;
          };
          return Promise.resolve(
            dbSysParams.filter(
              (p) =>
                p.tenant_id === where?.tenant_id &&
                (where.paramKey === undefined ||
                  p.paramKey === where.paramKey) &&
                (where.isActive === undefined || p.isActive === where.isActive),
            ),
          );
        }
        return Promise.resolve([]);
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
      if (entityClass === Tenant) {
        const entity = item as Tenant;
        const existingIdx = dbTenants.findIndex((t) => t.id === entity.id);
        if (existingIdx >= 0) {
          dbTenants[existingIdx] = { ...entity };
        } else {
          dbTenants.push({ ...entity });
        }
        return Promise.resolve(entity);
      }
      if (entityClass === SystemParametersConfig) {
        const entity = item as SystemParametersConfig;
        const existingIdx = dbSysParams.findIndex((p) => p.id === entity.id);
        if (existingIdx >= 0) {
          dbSysParams[existingIdx] = { ...entity };
        } else {
          const withId = {
            ...entity,
            id: entity.id || `param-${Math.random().toString(36).substring(7)}`,
          };
          dbSysParams.push(withId);
          return Promise.resolve(withId);
        }
        return Promise.resolve(entity);
      }
      return Promise.resolve(item);
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
      controllers: [FiscalSetupController],
      providers: [
        FiscalSetupService,
        {
          provide: 'TenantRepository',
          useValue: tenantRepo,
        },
        {
          provide: 'SystemParametersConfigRepository',
          useValue: sysParamRepo,
        },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn() },
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
    dbTenants = [
      {
        id: 'tenant-A',
        name: 'Restaurante Managua',
        ruc: null,
        is_active: true,
        created_at: new Date('2026-01-01'),
        updated_at: new Date('2026-01-01'),
      },
      {
        id: 'tenant-B',
        name: 'Café Granada',
        ruc: null,
        is_active: true,
        created_at: new Date('2026-01-01'),
        updated_at: new Date('2026-01-01'),
      },
    ];
    dbSysParams = [];
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
      .post(API_PREFIX)
      .set('Authorization', `Bearer ${token}`)
      .send({
        regime: FiscalRegime.CUOTA_FIJA,
        businessName: 'Café Central',
        commercialFxSpread: 0.5,
        pricesIncludeTax: true,
      })
      .expect(401);
  });

  it('returns 403 when user has CASHIER role', async () => {
    const token = signToken({ role: UserRole.CASHIER });

    await request(app.getHttpServer())
      .get(API_PREFIX)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('returns 400 when businessName is empty or missing', async () => {
    const token = signToken();

    const response = await request(app.getHttpServer())
      .post(API_PREFIX)
      .set('Authorization', `Bearer ${token}`)
      .send({
        regime: FiscalRegime.CUOTA_FIJA,
        businessName: '',
        commercialFxSpread: 0.5,
        pricesIncludeTax: true,
      })
      .expect(400);

    const body = response.body as BadRequestResponseBody;
    expect(body.message).toContain('businessName must not be empty');
  });

  it('returns 400 when commercialFxSpread is negative', async () => {
    const token = signToken();

    const response = await request(app.getHttpServer())
      .post(API_PREFIX)
      .set('Authorization', `Bearer ${token}`)
      .send({
        regime: FiscalRegime.CUOTA_FIJA,
        businessName: 'Café Central',
        commercialFxSpread: -0.5,
        pricesIncludeTax: true,
      })
      .expect(400);

    const body = response.body as BadRequestResponseBody;
    expect(body.message).toContain(
      'commercialFxSpread must be greater than or equal to 0',
    );
  });

  it('returns 400 when regime is invalid', async () => {
    const token = signToken();

    const response = await request(app.getHttpServer())
      .post(API_PREFIX)
      .set('Authorization', `Bearer ${token}`)
      .send({
        regime: 'INVALID_REGIME',
        businessName: 'Café Central',
        commercialFxSpread: 0.5,
        pricesIncludeTax: true,
      })
      .expect(400);

    const body = response.body as BadRequestResponseBody;
    expect(body.message).toContain(
      'regime must be either CUOTA_FIJA or REGIMEN_GENERAL',
    );
  });

  it('returns 200 with default fiscal setup when not yet configured', async () => {
    const token = signToken({ tenant_id: 'tenant-A' });

    const response = await request(app.getHttpServer())
      .get(API_PREFIX)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const body = response.body as FiscalSetupResponse;
    expect(body).toEqual({
      tenantId: 'tenant-A',
      businessName: 'Restaurante Managua',
      ruc: null,
      regime: FiscalRegime.CUOTA_FIJA,
      taxRateIva: 0.0,
      pricesIncludeTax: true,
      commercialFxSpread: 0.5,
    });
  });

  it('returns 201 and configures CUOTA_FIJA updating Tenant and sys parameters', async () => {
    const token = signToken({ tenant_id: 'tenant-A' });

    const payload = {
      regime: FiscalRegime.CUOTA_FIJA,
      businessName: 'Comedor Doña Mary',
      ruc: 'CF-99999',
      commercialFxSpread: 0.5,
      pricesIncludeTax: true,
    };

    const response = await request(app.getHttpServer())
      .post(API_PREFIX)
      .set('Authorization', `Bearer ${token}`)
      .send(payload)
      .expect(201);

    const body = response.body as FiscalSetupResponse;
    expect(body).toMatchObject({
      tenantId: 'tenant-A',
      businessName: 'Comedor Doña Mary',
      ruc: 'CF-99999',
      regime: FiscalRegime.CUOTA_FIJA,
      taxRateIva: 0.0,
      pricesIncludeTax: true,
      commercialFxSpread: 0.5,
    });

    const tenantA = dbTenants.find((t) => t.id === 'tenant-A');
    expect(tenantA?.name).toBe('Comedor Doña Mary');
    expect(tenantA?.ruc).toBe('CF-99999');

    const params = dbSysParams.filter(
      (p) => p.tenant_id === 'tenant-A' && p.isActive,
    );
    expect(params).toHaveLength(4);
    expect(params.find((p) => p.paramKey === 'TAX_RATE_IVA')?.paramValue).toBe(
      0.0,
    );
    expect(params.find((p) => p.paramKey === 'FISCAL_REGIME')?.paramValue).toBe(
      FiscalRegime.CUOTA_FIJA,
    );
  });

  it('returns 201 and switches to REGIMEN_GENERAL (15% IVA) with versioning', async () => {
    const token = signToken({ tenant_id: 'tenant-A' });

    // 1. Initial setup as CUOTA_FIJA
    await request(app.getHttpServer())
      .post(API_PREFIX)
      .set('Authorization', `Bearer ${token}`)
      .send({
        regime: FiscalRegime.CUOTA_FIJA,
        businessName: 'Restaurante Managua',
        ruc: 'CF-12345',
        commercialFxSpread: 0.5,
        pricesIncludeTax: true,
      })
      .expect(201);

    // 2. Transition to REGIMEN_GENERAL (Formal DGI tax invoicing)
    const response = await request(app.getHttpServer())
      .post(API_PREFIX)
      .set('Authorization', `Bearer ${token}`)
      .send({
        regime: FiscalRegime.REGIMEN_GENERAL,
        businessName: 'Restaurante Managua S.A.',
        ruc: 'J0310000012345',
        commercialFxSpread: 0.75,
        pricesIncludeTax: false,
      })
      .expect(201);

    const body = response.body as FiscalSetupResponse;
    expect(body).toMatchObject({
      tenantId: 'tenant-A',
      businessName: 'Restaurante Managua S.A.',
      ruc: 'J0310000012345',
      regime: FiscalRegime.REGIMEN_GENERAL,
      taxRateIva: 0.15,
      pricesIncludeTax: false,
      commercialFxSpread: 0.75,
    });

    const activeTaxParam = dbSysParams.find(
      (p) =>
        p.tenant_id === 'tenant-A' &&
        p.paramKey === 'TAX_RATE_IVA' &&
        p.isActive,
    );
    expect(activeTaxParam?.paramValue).toBe(0.15);
    expect(activeTaxParam?.version).toBe(2);

    const oldTaxParam = dbSysParams.find(
      (p) =>
        p.tenant_id === 'tenant-A' &&
        p.paramKey === 'TAX_RATE_IVA' &&
        !p.isActive,
    );
    expect(oldTaxParam?.paramValue).toBe(0.0);
    expect(oldTaxParam?.version).toBe(1);
    expect(oldTaxParam?.effectiveTo).toBeInstanceOf(Date);
  });

  it('guarantees multi-tenant isolation for fiscal configuration', async () => {
    const tokenA = signToken({ tenant_id: 'tenant-A' });
    const tokenB = signToken({ tenant_id: 'tenant-B' });

    // Tenant A sets REGIMEN_GENERAL
    await request(app.getHttpServer())
      .post(API_PREFIX)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        regime: FiscalRegime.REGIMEN_GENERAL,
        businessName: 'Tenant A Corp',
        ruc: 'J0310000000001',
        commercialFxSpread: 1.0,
        pricesIncludeTax: false,
      })
      .expect(201);

    // Tenant B sets CUOTA_FIJA
    await request(app.getHttpServer())
      .post(API_PREFIX)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        regime: FiscalRegime.CUOTA_FIJA,
        businessName: 'Tenant B Pulpería',
        ruc: null,
        commercialFxSpread: 0.25,
        pricesIncludeTax: true,
      })
      .expect(201);

    // Query Tenant A
    const resA = await request(app.getHttpServer())
      .get(API_PREFIX)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    expect((resA.body as FiscalSetupResponse).regime).toBe(
      FiscalRegime.REGIMEN_GENERAL,
    );
    expect((resA.body as FiscalSetupResponse).taxRateIva).toBe(0.15);
    expect((resA.body as FiscalSetupResponse).businessName).toBe(
      'Tenant A Corp',
    );

    // Query Tenant B
    const resB = await request(app.getHttpServer())
      .get(API_PREFIX)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    expect((resB.body as FiscalSetupResponse).regime).toBe(
      FiscalRegime.CUOTA_FIJA,
    );
    expect((resB.body as FiscalSetupResponse).taxRateIva).toBe(0.0);
    expect((resB.body as FiscalSetupResponse).businessName).toBe(
      'Tenant B Pulpería',
    );
  });
});
