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
import { TENANT_CONTEXT_SET_CONFIG_SQL } from '../../src/core/database/tenant-transaction';
import { FiscalSetupController } from '../../src/modules/onboarding/controllers/fiscal-setup.controller';
import {
  FiscalSetupService,
  FiscalRegime,
} from '../../src/modules/onboarding/services/fiscal-setup.service';
import { FiscalSetupResponse } from '../../src/modules/onboarding/dto/fiscal-setup.dto';
import { Tenant } from '../../src/modules/tenant/entities/tenant.entity';
import {
  SystemParametersConfig,
  SystemParametersConfigActiveView,
} from '../../src/modules/inventory/entities/system-parameters-config.entity';
import { UserRole } from '../../src/modules/identity/entities/user.entity';
import { AuthGuard } from '../../src/modules/identity/guards/auth.guard';
import { RolesGuard } from '../../src/modules/identity/guards/roles.guard';
import { PermissionsGuard } from '../../src/modules/identity/guards/permissions.guard';
import { JWT_TOKEN_TYPES } from '../../src/modules/identity/security/jwt-token.types';
import { createIdentityJwtConfigProvider } from '../support/identity-jwt-test.fixture';
import { normalizeTenantSlug } from '../../src/modules/tenant/tenant-slug';

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

  // Emulates the v_sys_parametros_config_active read semantics: one
  // governing row per (tenant_id, param_key) — the highest version among
  // active, unexpired rows.
  const latestActivePerKey = (
    rows: SystemParametersConfig[],
  ): SystemParametersConfig[] => {
    const latest = new Map<string, SystemParametersConfig>();
    for (const p of rows) {
      const current = latest.get(p.paramKey);
      if (!current || p.version > current.version) {
        latest.set(p.paramKey, p);
      }
    }
    return [...latest.values()];
  };

  const manager = {
    // The service binds the tenant context on the transaction manager before
    // touching a repository, so the mock has to expose query.
    query: jest.fn(() => Promise.resolve([])),
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
        if (entityClass === SystemParametersConfigActiveView) {
          const where = options.where as {
            tenant_id?: string;
            paramKey?: string;
          };
          const matching = dbSysParams.filter(
            (p) =>
              p.tenant_id === where?.tenant_id &&
              (where.paramKey === undefined ||
                p.paramKey === where.paramKey) &&
              p.isActive &&
              (p.effectiveTo === null || p.effectiveTo > new Date()),
          );
          return Promise.resolve(latestActivePerKey(matching));
        }
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
        createIdentityJwtConfigProvider(),
        {
          provide: 'TenantRepository',
          useValue: tenantRepo,
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
        PermissionsGuard,
        Reflector,
        JwtService,
        createIdentityJwtConfigProvider(),
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
        slug: 'restaurante-managua',
        ruc: null,
        is_active: true,
        created_at: new Date('2026-01-01'),
        updated_at: new Date('2026-01-01'),
      },
      {
        id: 'tenant-B',
        name: 'Café Granada',
        slug: normalizeTenantSlug('Café Granada'),
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
      custom_permissions?: string[];
    }> = {},
  ): string =>
    jwtService.sign(
      {
        sub: overrides.sub ?? 'user-1',
        email: overrides.email ?? 'owner@example.com',
        role: overrides.role ?? UserRole.OWNER,
        tenant_id:
          overrides.tenant_id !== undefined ? overrides.tenant_id : 'tenant-A',
        custom_permissions: overrides.custom_permissions,
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

  it('returns 403 when user is MANAGER without ONBOARDING_FISCAL_CONFIGURE permission attempting to write', async () => {
    const token = signToken({ role: UserRole.MANAGER });

    await request(app.getHttpServer())
      .post(API_PREFIX)
      .set('Authorization', `Bearer ${token}`)
      .send({
        regime: FiscalRegime.CUOTA_FIJA,
        businessName: 'Unauthorized Manager Café',
        commercialFxSpread: 0.5,
        pricesIncludeTax: true,
      })
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

  it('returns 400 when the issuer RUC is absent, blank, or malformed (FR-1)', async () => {
    const token = signToken();

    const base = {
      regime: FiscalRegime.CUOTA_FIJA,
      businessName: 'Café Central',
      commercialFxSpread: 0.5,
      pricesIncludeTax: true,
    };

    const cases: Array<Record<string, unknown>> = [
      { ...base }, // ruc absent
      { ...base, ruc: '' },
      { ...base, ruc: '   ' },
      { ...base, ruc: 'CF-12345' },
      { ...base, ruc: 'K0310000055555' },
      { ...base, ruc: 'J031000005555' },
    ];

    for (const rejectedBody of cases) {
      const response = await request(app.getHttpServer())
        .post(API_PREFIX)
        .set('Authorization', `Bearer ${token}`)
        .send(rejectedBody)
        .expect(400);

      const body = response.body as BadRequestResponseBody;
      const messages = Array.isArray(body.message)
        ? body.message
        : [body.message];
      expect(messages.join(' ')).toContain('RUC');
    }

    // Nothing was persisted for any rejected request.
    expect(dbSysParams).toHaveLength(0);
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
      dgiAuthorizationCode: null,
      dgiAuthorizationIssuedAt: null,
      dgiAuthorizationExpiresAt: null,
    });
  });

  it('returns 201 and configures CUOTA_FIJA updating Tenant and sys parameters', async () => {
    const token = signToken({ tenant_id: 'tenant-A' });

    const payload = {
      regime: FiscalRegime.CUOTA_FIJA,
      businessName: 'Comedor Doña Mary',
      ruc: 'J0310000099999',
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
      ruc: 'J0310000099999',
      regime: FiscalRegime.CUOTA_FIJA,
      taxRateIva: 0.0,
      pricesIncludeTax: true,
      commercialFxSpread: 0.5,
    });

    const tenantA = dbTenants.find((t) => t.id === 'tenant-A');
    expect(tenantA?.name).toBe('Comedor Doña Mary');
    expect(tenantA?.ruc).toBe('J0310000099999');

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
        ruc: 'J0310000055555',
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

    // Issue #377: supersession is append-only. The governing row is the
    // one with the highest version; the first row is never deactivated in
    // place (the trg_sys_parametros_config_immutable trigger rejects that
    // UPDATE in a migrated database).
    const activeTaxParam = dbSysParams.find(
      (p) =>
        p.tenant_id === 'tenant-A' &&
        p.paramKey === 'TAX_RATE_IVA' &&
        p.version === 2,
    );
    expect(activeTaxParam?.paramValue).toBe(0.15);
    expect(activeTaxParam?.isActive).toBe(true);
    expect(activeTaxParam?.effectiveTo).toBeNull();

    const oldTaxParam = dbSysParams.find(
      (p) =>
        p.tenant_id === 'tenant-A' &&
        p.paramKey === 'TAX_RATE_IVA' &&
        p.version === 1,
    );
    expect(oldTaxParam?.paramValue).toBe(0.0);
    expect(oldTaxParam?.version).toBe(1);
    // Append-only contract: the first row stays exactly as written.
    expect(oldTaxParam?.isActive).toBe(true);
    expect(oldTaxParam?.effectiveTo).toBeNull();
  });

  it('appends a second version on reconfiguration without mutating the first (issue #377 append-only contract)', async () => {
    // NOTE: this spec runs against an in-memory simulated database, so the
    // trg_sys_parametros_config_immutable trigger is absent here. The
    // assertions below encode the contract that the trigger enforces in a
    // migrated database: reconfiguration inserts new version rows and never
    // updates the rows written by a previous call.
    const token = signToken({ tenant_id: 'tenant-A' });

    await request(app.getHttpServer())
      .post(API_PREFIX)
      .set('Authorization', `Bearer ${token}`)
      .send({
        regime: FiscalRegime.CUOTA_FIJA,
        businessName: 'Comedor Doña Mary',
        ruc: 'J0310000055555',
        commercialFxSpread: 0.5,
        pricesIncludeTax: true,
      })
      .expect(201);

    const firstRows = dbSysParams.map((p) => ({ ...p }));
    expect(firstRows.length).toBeGreaterThan(0);

    // Second configuration with different values succeeds where the old
    // UPDATE-based supersession used to fail against the trigger.
    const response = await request(app.getHttpServer())
      .post(API_PREFIX)
      .set('Authorization', `Bearer ${token}`)
      .send({
        regime: FiscalRegime.REGIMEN_GENERAL,
        businessName: 'Comedor Doña Mary S.A.',
        ruc: 'J0310000055555',
        commercialFxSpread: 0.75,
        pricesIncludeTax: false,
      })
      .expect(201);

    expect(response.body).toMatchObject({
      regime: FiscalRegime.REGIMEN_GENERAL,
      taxRateIva: 0.15,
      pricesIncludeTax: false,
      commercialFxSpread: 0.75,
    });

    // The rows written by the first call are left completely untouched.
    for (const original of firstRows) {
      const current = dbSysParams.find((p) => p.id === original.id);
      expect(current).toEqual(original);
      // Original state preserved: still active, still open, version 1.
      expect(current?.isActive).toBe(true);
      expect(current?.effectiveTo).toBeNull();
      expect(current?.version).toBe(1);
    }

    // A second row per key exists, carrying the new values.
    const secondRows = dbSysParams.filter(
      (p) => p.tenant_id === 'tenant-A' && p.version === 2,
    );
    expect(secondRows).toHaveLength(4);
    expect(
      secondRows.find((p) => p.paramKey === 'FISCAL_REGIME')?.paramValue,
    ).toBe(FiscalRegime.REGIMEN_GENERAL);
    expect(secondRows.find((p) => p.paramKey === 'TAX_RATE_IVA')?.paramValue).toBe(
      0.15,
    );
    expect(
      secondRows.find((p) => p.paramKey === 'PRICES_INCLUDE_TAX')?.paramValue,
    ).toBe(false);
    expect(
      secondRows.find((p) => p.paramKey === 'COMMERCIAL_FX_SPREAD')?.paramValue,
    ).toBe(0.75);

    // The active-configuration read resolves the SECOND values, not the first.
    const read = await request(app.getHttpServer())
      .get(API_PREFIX)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(read.body).toMatchObject({
      regime: FiscalRegime.REGIMEN_GENERAL,
      taxRateIva: 0.15,
      pricesIncludeTax: false,
      commercialFxSpread: 0.75,
    });
  });

  it('resolves the configured value on read inside a tenant-bound transaction (issue #377 read path)', async () => {
    // NOTE: this spec runs against an in-memory simulated database, so it
    // cannot reproduce the view's RLS behaviour (security_invoker = true).
    // Against a migrated database, an unbound read of the view either
    // returns zero rows — making the API silently serve fallback defaults —
    // or throws on current_setting('app.tenant_id', true)::uuid. The value
    // assertion below guards the "params map came back empty" symptom; the
    // binding-count assertion guards the structural contract that the read
    // is tenant-bound on the same connection.
    const token = signToken({ tenant_id: 'tenant-A' });

    await request(app.getHttpServer())
      .post(API_PREFIX)
      .set('Authorization', `Bearer ${token}`)
      .send({
        regime: FiscalRegime.CUOTA_FIJA,
        businessName: 'Comedor Doña Mary',
        ruc: 'J0310000055555',
        commercialFxSpread: 1.25, // non-default: the fallback is 0.5
        pricesIncludeTax: true,
      })
      .expect(201);

    const countBinds = (): number =>
      (manager.query.mock.calls as unknown as unknown[][]).filter(
        (call) => call[0] === TENANT_CONTEXT_SET_CONFIG_SQL,
      ).length;
    const bindsBefore = countBinds();

    const response = await request(app.getHttpServer())
      .get(API_PREFIX)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect((response.body as FiscalSetupResponse).commercialFxSpread).toBe(
      1.25,
    );

    const bindsAfter = countBinds();
    expect(bindsAfter).toBeGreaterThan(bindsBefore);
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
        ruc: 'J0310000000002',
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
