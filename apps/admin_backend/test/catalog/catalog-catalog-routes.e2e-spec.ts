import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { CatalogController } from '../../src/modules/catalog/catalog.controller';
import { CatalogService } from '../../src/modules/catalog/catalog.service';
import { CatalogValue } from '../../src/modules/catalog/entities/catalog-value.entity';
import { Tenant } from '../../src/modules/tenant/entities/tenant.entity';
import { AuthGuard } from '../../src/modules/identity/guards/auth.guard';
import { AuthoritativeCurrentUserGuard } from '../../src/modules/identity/guards/authoritative-current-user.guard';
import { RolesGuard } from '../../src/modules/identity/guards/roles.guard';
import { CurrentUserAuthorizationService } from '../../src/modules/identity/services/current-user-authorization.service';
import { UserRole } from '../../src/modules/identity/entities/user.entity';
import {
  IDENTITY_JWT_CONFIG,
  type IdentityJwtConfig,
} from '../../src/modules/identity/config/identity-jwt.config';

const postgresConnection = {
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? '5432'),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_DATABASE ?? 'omnifood',
};

const jwtEnvironment = {
  JWT_SECRET: 'test-only-jwt-secret-with-at-least-thirty-two-bytes',
  JWT_ISSUER: 'omnifood-admin-test',
  JWT_AUDIENCE: 'omnifood-pos-test',
  JWT_ACCESS_TTL_SECONDS: '3600',
  JWT_REFRESH_TTL_SECONDS: '604800',
  JWT_CLOCK_TOLERANCE_SECONDS: '5',
  JWT_ALGORITHM: 'HS256',
} as const;

const jwtConfig: IdentityJwtConfig = {
  secret: jwtEnvironment.JWT_SECRET,
  issuer: jwtEnvironment.JWT_ISSUER,
  audience: jwtEnvironment.JWT_AUDIENCE,
  accessTokenTtlSeconds: 3600,
  refreshTokenTtlSeconds: 604800,
  clockToleranceSeconds: 5,
  algorithm: jwtEnvironment.JWT_ALGORITHM,
};

const TENANT = 'catalog-e2e-tenant';

async function createIsolatedSchema(): Promise<{
  schema: string;
  destroy: () => Promise<void>;
  bootstrap: DataSource;
}> {
  const schema = `catalog_e2e_${randomUUID().replace(/-/g, '')}`;
  const bootstrap = new DataSource({ type: 'postgres', ...postgresConnection });
  await bootstrap.initialize();
  await bootstrap.query(`CREATE SCHEMA "${schema}"`);
  await bootstrap.query(`
    CREATE TABLE "${schema}".tenants (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL UNIQUE,
      ruc varchar,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    )
  `);
  await bootstrap.query(`
    CREATE TABLE "${schema}".catalog_values (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id text NOT NULL,
      catalog_type varchar NOT NULL,
      code varchar NOT NULL,
      label varchar NOT NULL,
      description varchar,
      is_active boolean NOT NULL DEFAULT true,
      sort_order int NOT NULL DEFAULT 0,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      UNIQUE (tenant_id, catalog_type, code)
    )
  `);
  return {
    schema,
    bootstrap,
    destroy: async () => {
      await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await bootstrap.destroy();
    },
  };
}

describe('CatalogController E2E (real DB)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;
  let dbCleanup: () => Promise<void>;

  beforeAll(async () => {
    const { schema, bootstrap, destroy } = await createIsolatedSchema();
    dbCleanup = destroy;

    const clientDs = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      schema,
      entities: [CatalogValue, Tenant],
      synchronize: false,
      extra: { max: 4 },
    });
    await clientDs.initialize();

    const catalogService = new CatalogService(clientDs);

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: jwtEnvironment.JWT_SECRET,
          signOptions: {
            algorithm: jwtEnvironment.JWT_ALGORITHM as 'HS256',
            issuer: jwtEnvironment.JWT_ISSUER,
            audience: jwtEnvironment.JWT_AUDIENCE,
          },
        }),
      ],
      controllers: [CatalogController],
      providers: [
        { provide: CatalogService, useValue: catalogService },
        AuthGuard,
        AuthoritativeCurrentUserGuard,
        RolesGuard,
        {
          provide: CurrentUserAuthorizationService,
          useValue: {
            authorize: jest.fn((token: unknown) => token),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: (key: keyof typeof jwtEnvironment) => jwtEnvironment[key],
          },
        },
        { provide: IDENTITY_JWT_CONFIG, useValue: jwtConfig },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();
    jwtService = module.get(JwtService);
  });

  afterAll(async () => {
    await app?.close();
    await dbCleanup?.();
  });

  const signToken = (overrides: Record<string, unknown> = {}): string =>
    jwtService.sign({
      sub: 'user-e2e-1',
      email: 'manager@e2e.test',
      tenant_id: TENANT,
      role: UserRole.MANAGER,
      is_active: true,
      token_type: 'access',
      security_version: 1,
      ...overrides,
    });

  const http = (): ReturnType<typeof request> =>
    request(app.getHttpServer());

  // ─── Auth ───────────────────────────────────────────────

  describe('authentication', () => {
    it('returns 401 without token', async () => {
      await http().get('/catalogs/UOM').expect(401);
    });

    it('returns 403 for CASHIER role', async () => {
      await http()
        .get('/catalogs/UOM')
        .set('Authorization', `Bearer ${signToken({ role: UserRole.CASHIER })}`)
        .expect(403);
    });
  });

  // ─── CRUD ───────────────────────────────────────────────

  describe('POST /catalogs/:type', () => {
    it('creates a catalog value and returns 201', async () => {
      const res = await http()
        .post('/catalogs/UOM')
        .set('Authorization', `Bearer ${signToken()}`)
        .send({ code: 'kg', name: 'Kilogramo' })
        .expect(201);

      expect(res.body).toMatchObject({
        code: 'kg',
        name: 'Kilogramo',
        is_active: true,
      });
      expect(res.body.id).toBeDefined();
    });

    it('returns 409 on duplicate code', async () => {
      await http()
        .post('/catalogs/UOM')
        .set('Authorization', `Bearer ${signToken()}`)
        .send({ code: 'dup', name: 'First' })
        .expect(201);

      await http()
        .post('/catalogs/UOM')
        .set('Authorization', `Bearer ${signToken()}`)
        .send({ code: 'dup', name: 'Second' })
        .expect(409);
    });

    it('returns 400 for invalid code (spaces)', async () => {
      await http()
        .post('/catalogs/UOM')
        .set('Authorization', `Bearer ${signToken()}`)
        .send({ code: 'has space', name: 'Bad' })
        .expect(400);
    });

    it('returns 400 for empty name', async () => {
      await http()
        .post('/catalogs/UOM')
        .set('Authorization', `Bearer ${signToken()}`)
        .send({ code: 'ok', name: '' })
        .expect(400);
    });

    it('returns 400 for code > 64 chars', async () => {
      await http()
        .post('/catalogs/UOM')
        .set('Authorization', `Bearer ${signToken()}`)
        .send({ code: 'x'.repeat(65), name: 'Too long' })
        .expect(400);
    });

    it('returns 400 for unknown catalog type', async () => {
      await http()
        .post('/catalogs/NOPE')
        .set('Authorization', `Bearer ${signToken()}`)
        .send({ code: 'x', name: 'X' })
        .expect(404);
    });
  });

  describe('GET /catalogs/:type', () => {
    it('returns catalog values for the tenant', async () => {
      // Seed some data first
      await http()
        .post('/catalogs/UOM')
        .set('Authorization', `Bearer ${signToken()}`)
        .send({ code: 'lb', name: 'Libra' })
        .expect(201);

      const res = await http()
        .get('/catalogs/UOM')
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      const codes = res.body.map((v: { code: string }) => v.code);
      expect(codes).toContain('kg');
      expect(codes).toContain('lb');
    });

    it('excludes inactive values by default', async () => {
      // Create an inactive value
      const createRes = await http()
        .post('/catalogs/UOM')
        .set('Authorization', `Bearer ${signToken()}`)
        .send({ code: 'inactive_test', name: 'Inactive', is_active: false })
        .expect(201);

      const res = await http()
        .get('/catalogs/UOM')
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(200);

      const found = res.body.find(
        (v: { id: string }) => v.id === createRes.body.id,
      );
      expect(found).toBeUndefined();
    });

    it('includes inactive values when includeInactive=true', async () => {
      const createRes = await http()
        .post('/catalogs/UOM')
        .set('Authorization', `Bearer ${signToken()}`)
        .send({ code: 'inactive_inc', name: 'Inactive Inc', is_active: false })
        .expect(201);

      const res = await http()
        .get('/catalogs/UOM?includeInactive=true')
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(200);

      const found = res.body.find(
        (v: { id: string }) => v.id === createRes.body.id,
      );
      expect(found).toBeDefined();
      expect(found.is_active).toBe(false);
    });
  });

  describe('PATCH /catalogs/:type/:id', () => {
    it('updates name and sort_order', async () => {
      const createRes = await http()
        .post('/catalogs/INVENTORY_CATEGORY')
        .set('Authorization', `Bearer ${signToken()}`)
        .send({ code: 'LACTEOS', name: 'Lácteos' })
        .expect(201);

      const res = await http()
        .patch(`/catalogs/INVENTORY_CATEGORY/${createRes.body.id}`)
        .set('Authorization', `Bearer ${signToken()}`)
        .send({ name: 'Lácteos updated', sort_order: 10 })
        .expect(200);

      expect(res.body.name).toBe('Lácteos updated');
      expect(res.body.sort_order).toBe(10);
      expect(res.body.code).toBe('LACTEOS'); // code unchanged
    });

    it('returns 404 for nonexistent id', async () => {
      await http()
        .patch(`/catalogs/UOM/${randomUUID()}`)
        .set('Authorization', `Bearer ${signToken()}`)
        .send({ name: 'Nope' })
        .expect(404);
    });
  });

  describe('DELETE /catalogs/:type/:id', () => {
    it('soft-deactivates and returns { id, deactivated: true }', async () => {
      const createRes = await http()
        .post('/catalogs/UOM')
        .set('Authorization', `Bearer ${signToken()}`)
        .send({ code: 'to_deactivate', name: 'To Deactivate' })
        .expect(201);

      const res = await http()
        .delete(`/catalogs/UOM/${createRes.body.id}`)
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(200);

      expect(res.body).toEqual({
        id: createRes.body.id,
        deactivated: true,
      });

      // Verify it's inactive
      const listRes = await http()
        .get('/catalogs/UOM?includeInactive=true')
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(200);

      const found = listRes.body.find(
        (v: { id: string }) => v.id === createRes.body.id,
      );
      expect(found.is_active).toBe(false);
    });

    it('returns 404 for nonexistent id', async () => {
      await http()
        .delete(`/catalogs/UOM/${randomUUID()}`)
        .set('Authorization', `Bearer ${signToken()}`)
        .expect(404);
    });
  });

  // ─── Seed Defaults ──────────────────────────────────────

  describe('POST /catalogs/seed-defaults', () => {
    it('seeds default values and returns count', async () => {
      const res = await http()
        .post('/catalogs/seed-defaults')
        .set('Authorization', `Bearer ${signToken({ tenant_id: 'seed-e2e-tenant' })}`)
        .expect(201);

      expect(res.body.inserted).toBeGreaterThan(0);
    });

    it('is idempotent', async () => {
      const t = 'seed-e2e-idempotent';
      const first = await http()
        .post('/catalogs/seed-defaults')
        .set('Authorization', `Bearer ${signToken({ tenant_id: t })}`)
        .expect(201);

      const second = await http()
        .post('/catalogs/seed-defaults')
        .set('Authorization', `Bearer ${signToken({ tenant_id: t })}`)
        .expect(201);

      expect(second.body.inserted).toBe(0);
      expect(first.body.inserted).toBeGreaterThan(0);
    });
  });

  // ─── Tenant Isolation ──────────────────────────────────

  describe('tenant isolation', () => {
    it('different tenants see only their own values', async () => {
      const tenantA = 'iso-e2e-a';
      const tenantB = 'iso-e2e-b';

      await http()
        .post('/catalogs/UOM')
        .set('Authorization', `Bearer ${signToken({ tenant_id: tenantA })}`)
        .send({ code: 'kg', name: 'Kg from A' })
        .expect(201);

      await http()
        .post('/catalogs/UOM')
        .set('Authorization', `Bearer ${signToken({ tenant_id: tenantB })}`)
        .send({ code: 'kg', name: 'Kg from B' })
        .expect(201);

      const resA = await http()
        .get('/catalogs/UOM')
        .set('Authorization', `Bearer ${signToken({ tenant_id: tenantA })}`)
        .expect(200);

      const resB = await http()
        .get('/catalogs/UOM')
        .set('Authorization', `Bearer ${signToken({ tenant_id: tenantB })}`)
        .expect(200);

      expect(resA.body).toHaveLength(1);
      expect(resA.body[0].name).toBe('Kg from A');

      expect(resB.body).toHaveLength(1);
      expect(resB.body[0].name).toBe('Kg from B');
    });
  });
});
