import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { Tenant } from '../../src/modules/tenant/entities/tenant.entity';
import { CatalogValue } from '../../src/modules/catalog/entities/catalog-value.entity';
import { CatalogService } from '../../src/modules/catalog/catalog.service';
import { ChangeLogService } from '../../src/modules/audit/change-log.service';
import { CatalogController } from '../../src/modules/catalog/catalog.controller';
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

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for DB-backed E2E tests`);
  return value;
}

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: Number(process.env.DB_PORT?.trim() ?? 5432),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: getRequiredEnv('DB_PASSWORD'),
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

async function withIsolatedSchema(
  schemaPrefix: string,
  assertion: (ctx: {
    app: INestApplication;
    dataSource: DataSource;
    jwtService: JwtService;
    tenantId: string;
  }) => Promise<void>,
): Promise<void> {
  const bootstrap = new DataSource({ type: 'postgres', ...postgresConnection });
  const schema = `${schemaPrefix}_${randomUUID().replace(/-/g, '')}`;
  let dataSource: DataSource | null = null;
  let app: INestApplication | null = null;

  try {
    await bootstrap.initialize();
    await bootstrap.query(`CREATE SCHEMA "${schema}"`);

    dataSource = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      schema,
      entities: [Tenant, CatalogValue],
      synchronize: true,
    });
    await dataSource.initialize();
    await dataSource.query(`SET search_path TO "${schema}"`);

    const tenantId = randomUUID();
    await dataSource.query(
      `INSERT INTO tenants (id, name, is_active, created_at, updated_at) VALUES ($1, $2, true, now(), now())`,
      [tenantId, `E2E Tenant ${schemaPrefix}`],
    );

    const catalogService = new CatalogService(dataSource, {
      log: jest.fn(),
    } as unknown as ChangeLogService);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [CatalogController],
      providers: [
        Reflector,
        AuthGuard,
        AuthoritativeCurrentUserGuard,
        RolesGuard,
        {
          provide: CurrentUserAuthorizationService,
          useValue: { authorize: jest.fn((token: unknown) => token) },
        },
        { provide: CatalogService, useValue: catalogService },
        JwtService,
        createIdentityJwtTestConfigProvider(),
        createIdentityJwtConfigProvider(),
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();

    const jwtService = app.get(JwtService);

    await assertion({ app, dataSource, jwtService, tenantId });
  } finally {
    if (app) await app.close();
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (bootstrap.isInitialized) {
      await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await bootstrap.destroy();
    }
  }
}

describe('CatalogController E2E — real PostgreSQL', () => {
  const TEST_TIMEOUT_MS = 30000;

  describe('POST /catalogs/:type', () => {
    it(
      'creates a catalog value and persists it in the database',
      async () => {
        await withIsolatedSchema(
          'e2e_catalog_create',
          async ({ app, jwtService, tenantId }) => {
            const token = signIdentityJwtAccessToken(jwtService, {
              role: UserRole.OWNER,
              tenant_id: tenantId,
            });

            const res = await request(app.getHttpServer())
              .post('/catalogs/UOM')
              .set('Authorization', `Bearer ${token}`)
              .send({
                code: 'kg',
                name: 'Kilogramo',
              })
              .expect(201);

            expect(res.body.id).toBeDefined();
            expect(res.body.code).toBe('kg');
            expect(res.body.name).toBe('Kilogramo');
            expect(res.body.catalog_type).toBe('UOM');
            expect(res.body.is_active).toBe(true);
          },
        );
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'returns 400 for missing required fields',
      async () => {
        await withIsolatedSchema(
          'e2e_catalog_create_400',
          async ({ app, jwtService, tenantId }) => {
            const token = signIdentityJwtAccessToken(jwtService, {
              role: UserRole.OWNER,
              tenant_id: tenantId,
            });

            await request(app.getHttpServer())
              .post('/catalogs/UOM')
              .set('Authorization', `Bearer ${token}`)
              .send({ code: 'kg' })
              .expect(400);
          },
        );
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'returns 404 for invalid catalog type',
      async () => {
        await withIsolatedSchema(
          'e2e_catalog_create_invalid_type',
          async ({ app, jwtService, tenantId }) => {
            const token = signIdentityJwtAccessToken(jwtService, {
              role: UserRole.OWNER,
              tenant_id: tenantId,
            });

            await request(app.getHttpServer())
              .post('/catalogs/INVALID_TYPE')
              .set('Authorization', `Bearer ${token}`)
              .send({ code: 'test', name: 'Test' })
              .expect(404);
          },
        );
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('GET /catalogs/:type', () => {
    it(
      'returns catalog values for the authenticated tenant',
      async () => {
        await withIsolatedSchema(
          'e2e_catalog_list',
          async ({ app, dataSource, jwtService, tenantId }) => {
            const token = signIdentityJwtAccessToken(jwtService, {
              role: UserRole.MANAGER,
              tenant_id: tenantId,
            });

            await dataSource.query(
              `INSERT INTO catalog_values (id, tenant_id, catalog_type, code, label, is_active, sort_order, created_at, updated_at)
             VALUES ($1, $2, 'UOM', 'un', 'Unidad', true, 0, now(), now())`,
              [randomUUID(), tenantId],
            );

            const res = await request(app.getHttpServer())
              .get('/catalogs/UOM')
              .set('Authorization', `Bearer ${token}`)
              .expect(200);

            expect(res.body).toHaveLength(1);
            expect(res.body[0].code).toBe('un');
            expect(res.body[0].name).toBe('Unidad');
          },
        );
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'excludes inactive by default, includes with includeInactive=true',
      async () => {
        await withIsolatedSchema(
          'e2e_catalog_list_inactive',
          async ({ app, dataSource, jwtService, tenantId }) => {
            const token = signIdentityJwtAccessToken(jwtService, {
              role: UserRole.MANAGER,
              tenant_id: tenantId,
            });

            await dataSource.query(
              `INSERT INTO catalog_values (id, tenant_id, catalog_type, code, label, is_active, sort_order, created_at, updated_at)
             VALUES ($1, $2, 'UOM', 'kg', 'Kilogramo', true, 0, now(), now()),
                    ($3, $4, 'UOM', 'lb', 'Libra', false, 1, now(), now())`,
              [randomUUID(), tenantId, randomUUID(), tenantId],
            );

            const activeRes = await request(app.getHttpServer())
              .get('/catalogs/UOM')
              .set('Authorization', `Bearer ${token}`)
              .expect(200);
            expect(activeRes.body).toHaveLength(1);
            expect(activeRes.body[0].code).toBe('kg');

            const allRes = await request(app.getHttpServer())
              .get('/catalogs/UOM?includeInactive=true')
              .set('Authorization', `Bearer ${token}`)
              .expect(200);
            expect(allRes.body).toHaveLength(2);
          },
        );
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'returns 401 without token',
      async () => {
        await withIsolatedSchema('e2e_catalog_list_401', async ({ app }) => {
          await request(app.getHttpServer()).get('/catalogs/UOM').expect(401);
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'returns 403 for CASHIER role',
      async () => {
        await withIsolatedSchema(
          'e2e_catalog_list_403',
          async ({ app, jwtService, tenantId }) => {
            const token = signIdentityJwtAccessToken(jwtService, {
              role: UserRole.CASHIER,
              tenant_id: tenantId,
            });

            await request(app.getHttpServer())
              .get('/catalogs/UOM')
              .set('Authorization', `Bearer ${token}`)
              .expect(403);
          },
        );
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'returns 404 for nonexistent catalog value by id',
      async () => {
        await withIsolatedSchema(
          'e2e_catalog_findone_404',
          async ({ app, jwtService, tenantId }) => {
            const token = signIdentityJwtAccessToken(jwtService, {
              role: UserRole.MANAGER,
              tenant_id: tenantId,
            });

            await request(app.getHttpServer())
              .get(`/catalogs/UOM/${randomUUID()}`)
              .set('Authorization', `Bearer ${token}`)
              .expect(404);
          },
        );
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('PATCH /catalogs/:type/:id', () => {
    it(
      'updates catalog value name',
      async () => {
        await withIsolatedSchema(
          'e2e_catalog_update',
          async ({ app, dataSource, jwtService, tenantId }) => {
            const token = signIdentityJwtAccessToken(jwtService, {
              role: UserRole.OWNER,
              tenant_id: tenantId,
            });
            const catalogId = randomUUID();
            await dataSource.query(
              `INSERT INTO catalog_values (id, tenant_id, catalog_type, code, label, is_active, sort_order, created_at, updated_at)
             VALUES ($1, $2, 'UOM', 'kg', 'Kilogramo', true, 0, now(), now())`,
              [catalogId, tenantId],
            );

            const res = await request(app.getHttpServer())
              .patch(`/catalogs/UOM/${catalogId}`)
              .set('Authorization', `Bearer ${token}`)
              .send({ name: 'Kg Actualizado' })
              .expect(200);

            expect(res.body.name).toBe('Kg Actualizado');
          },
        );
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'returns 404 for nonexistent catalog value',
      async () => {
        await withIsolatedSchema(
          'e2e_catalog_update_404',
          async ({ app, jwtService, tenantId }) => {
            const token = signIdentityJwtAccessToken(jwtService, {
              role: UserRole.OWNER,
              tenant_id: tenantId,
            });

            await request(app.getHttpServer())
              .patch(`/catalogs/UOM/${randomUUID()}`)
              .set('Authorization', `Bearer ${token}`)
              .send({ name: 'X' })
              .expect(404);
          },
        );
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('DELETE /catalogs/:type/:id', () => {
    it(
      'soft-deactivates catalog value',
      async () => {
        await withIsolatedSchema(
          'e2e_catalog_deactivate',
          async ({ app, dataSource, jwtService, tenantId }) => {
            const token = signIdentityJwtAccessToken(jwtService, {
              role: UserRole.OWNER,
              tenant_id: tenantId,
            });
            const catalogId = randomUUID();
            await dataSource.query(
              `INSERT INTO catalog_values (id, tenant_id, catalog_type, code, label, is_active, sort_order, created_at, updated_at)
             VALUES ($1, $2, 'UOM', 'kg', 'Kilogramo', true, 0, now(), now())`,
              [catalogId, tenantId],
            );

            const res = await request(app.getHttpServer())
              .delete(`/catalogs/UOM/${catalogId}`)
              .set('Authorization', `Bearer ${token}`)
              .expect(200);

            expect(res.body).toEqual({ id: catalogId, deactivated: true });

            // Verify is_active is false in DB
            const rows = await dataSource.query(
              `SELECT is_active FROM catalog_values WHERE id = $1`,
              [catalogId],
            );
            expect(rows[0].is_active).toBe(false);
          },
        );
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'returns 404 for nonexistent catalog value',
      async () => {
        await withIsolatedSchema(
          'e2e_catalog_deactivate_404',
          async ({ app, jwtService, tenantId }) => {
            const token = signIdentityJwtAccessToken(jwtService, {
              role: UserRole.OWNER,
              tenant_id: tenantId,
            });

            await request(app.getHttpServer())
              .delete(`/catalogs/UOM/${randomUUID()}`)
              .set('Authorization', `Bearer ${token}`)
              .expect(404);
          },
        );
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('Tenant isolation', () => {
    it(
      'tenant A cannot see tenant B catalog values via HTTP',
      async () => {
        await withIsolatedSchema(
          'e2e_catalog_tenant_isolation',
          async ({ app, dataSource, jwtService, tenantId }) => {
            const otherTenantId = randomUUID();
            await dataSource.query(
              `INSERT INTO tenants (id, name, is_active, created_at, updated_at) VALUES ($1, $2, true, now(), now())`,
              [otherTenantId, 'Other Tenant'],
            );

            const tokenA = signIdentityJwtAccessToken(jwtService, {
              role: UserRole.OWNER,
              tenant_id: tenantId,
            });

            // Insert catalog value for other tenant directly in DB
            await dataSource.query(
              `INSERT INTO catalog_values (id, tenant_id, catalog_type, code, label, is_active, sort_order, created_at, updated_at)
             VALUES ($1, $2, 'UOM', 'secret_unit', 'Secret Unit', true, 0, now(), now())`,
              [randomUUID(), otherTenantId],
            );

            // Tenant A should see 0 catalog values
            const res = await request(app.getHttpServer())
              .get('/catalogs/UOM')
              .set('Authorization', `Bearer ${tokenA}`)
              .expect(200);

            expect(res.body).toHaveLength(0);
          },
        );
      },
      TEST_TIMEOUT_MS,
    );
  });
});
