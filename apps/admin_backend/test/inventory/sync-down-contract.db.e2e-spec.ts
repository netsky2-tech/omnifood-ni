import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { InboundSyncController } from '../../src/modules/sales/controllers/inbound-sync.controller';
import { InboundSyncService } from '../../src/modules/sales/services/inbound-sync.service';
import { Product } from '../../src/modules/inventory/entities/product.entity';
import { CatalogValue } from '../../src/modules/catalog/entities/catalog-value.entity';
import { Insumo } from '../../src/modules/inventory/entities/insumo.entity';
import { Recipe } from '../../src/modules/inventory/entities/recipe.entity';
import { RecipeVersion } from '../../src/modules/inventory/entities/recipe-version.entity';
import {
  User,
  UserRole,
} from '../../src/modules/identity/entities/user.entity';
import { UomConversion } from '../../src/modules/inventory/entities/uom-conversion.entity';
import { SecurityProfile } from '../../src/modules/identity/entities/security-profile.entity';
import { Tenant } from '../../src/modules/tenant/entities/tenant.entity';
import { AuthGuard } from '../../src/modules/identity/guards/auth.guard';
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

const ALL_ENTITIES = [
  Tenant,
  Product,
  CatalogValue,
  Insumo,
  Recipe,
  RecipeVersion,
  User,
  UomConversion,
  SecurityProfile,
];

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
      entities: ALL_ENTITIES,
      synchronize: true,
    });
    await dataSource.initialize();
    await dataSource.query(`SET search_path TO "${schema}"`);

    const tenantId = randomUUID();
    await dataSource.query(
      `INSERT INTO tenants (id, name, is_active, created_at, updated_at) VALUES ($1, $2, true, now(), now())`,
      [tenantId, `E2E Tenant ${schemaPrefix}`],
    );

    const productRepo = dataSource.getRepository(Product);
    const catalogValueRepo = dataSource.getRepository(CatalogValue);
    const insumoRepo = dataSource.getRepository(Insumo);
    const recipeRepo = dataSource.getRepository(Recipe);
    const recipeVersionRepo = dataSource.getRepository(RecipeVersion);
    const userRepo = dataSource.getRepository(User);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [InboundSyncController],
      providers: [
        InboundSyncService,
        { provide: getRepositoryToken(Product), useValue: productRepo },
        {
          provide: getRepositoryToken(CatalogValue),
          useValue: catalogValueRepo,
        },
        { provide: getRepositoryToken(Insumo), useValue: insumoRepo },
        { provide: getRepositoryToken(Recipe), useValue: recipeRepo },
        {
          provide: getRepositoryToken(RecipeVersion),
          useValue: recipeVersionRepo,
        },
        { provide: getRepositoryToken(User), useValue: userRepo },
        JwtService,
        AuthGuard,
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

describe('InboundSyncController E2E — real PostgreSQL', () => {
  const TEST_TIMEOUT_MS = 30000;

  // ─── Contract: products in sync-down response ───────────────

  describe('Contract: products in sync-down response', () => {
    it(
      'returns seeded products with correct field mapping',
      async () => {
        await withIsolatedSchema(
          'e2e_sync_products',
          async ({ app, dataSource, jwtService, tenantId }) => {
            const token = signIdentityJwtAccessToken(jwtService, {
              role: UserRole.MANAGER,
              tenant_id: tenantId,
            });

            const productId = randomUUID();
            await dataSource.query(
              `INSERT INTO products (id, tenant_id, name, uom, stock, "averageCost", "sellPrice", is_active, is_perishable, created_at, updated_at)
               VALUES ($1, $2, 'Cafe Americano', 'UND', 100, 12.50, 60.00, true, false, now(), now())`,
              [productId, tenantId],
            );

            const res = await request(app.getHttpServer())
              .get('/v1/sync/inbound/deltas?types=products')
              .set('Authorization', `Bearer ${token}`)
              .expect(200);

            // Top-level envelope contract
            expect(res.body.status).toBe('success');
            expect(typeof res.body.serverTime).toBe('string');
            expect(new Date(res.body.serverTime).toISOString()).toBe(
              res.body.serverTime,
            );
            expect(typeof res.body.currentVersion).toBe('number');

            // Product DTO contract
            expect(Array.isArray(res.body.deltas.products)).toBe(true);
            expect(res.body.deltas.products).toHaveLength(1);

            const product = res.body.deltas.products[0];
            expect(product.id).toBe(productId);
            expect(product.name).toBe('Cafe Americano');
            expect(product.uom).toBe('UND');
            expect(product.stock).toBe(100);
            expect(product.averageCost).toBe(12.5);
            expect(product.sellPrice).toBe(60);
            expect(product.isActive).toBe(true);
            expect(product.isPerishable).toBe(false);
            expect(typeof product.createdAt).toBe('string');
            expect(typeof product.updatedAt).toBe('string');
          },
        );
      },
      TEST_TIMEOUT_MS,
    );
  });

  // ─── Contract: catalog values in sync-down response ─────────

  describe('Contract: catalog values in sync-down response', () => {
    it(
      'returns seeded catalog values with correct field mapping',
      async () => {
        await withIsolatedSchema(
          'e2e_sync_catalog',
          async ({ app, dataSource, jwtService, tenantId }) => {
            const token = signIdentityJwtAccessToken(jwtService, {
              role: UserRole.MANAGER,
              tenant_id: tenantId,
            });

            const catalogId = randomUUID();
            await dataSource.query(
              `INSERT INTO catalog_values (id, tenant_id, catalog_type, code, label, is_active, sort_order, created_at, updated_at)
               VALUES ($1, $2, 'UOM', 'kg', 'Kilogramo', true, 0, now(), now())`,
              [catalogId, tenantId],
            );

            const res = await request(app.getHttpServer())
              .get('/v1/sync/inbound/deltas?types=catalogvalues')
              .set('Authorization', `Bearer ${token}`)
              .expect(200);

            expect(res.body.status).toBe('success');
            expect(typeof res.body.serverTime).toBe('string');
            expect(typeof res.body.currentVersion).toBe('number');

            // CatalogValue DTO contract
            expect(Array.isArray(res.body.deltas.catalogValues)).toBe(true);
            expect(res.body.deltas.catalogValues).toHaveLength(1);

            const cv = res.body.deltas.catalogValues[0];
            expect(cv.id).toBe(catalogId);
            expect(cv.catalogType).toBe('UOM');
            expect(cv.code).toBe('kg');
            expect(cv.name).toBe('Kilogramo');
            expect(cv.description).toBeNull();
            expect(cv.isActive).toBe(true);
            expect(cv.sortOrder).toBe(0);
            expect(typeof cv.createdAt).toBe('string');
            expect(typeof cv.updatedAt).toBe('string');
          },
        );
      },
      TEST_TIMEOUT_MS,
    );
  });

  // ─── Contract: sinceVersion filters correctly ───────────────

  describe('Contract: sinceVersion filters correctly', () => {
    it(
      'only returns products updated after sinceVersion',
      async () => {
        await withIsolatedSchema(
          'e2e_sync_since',
          async ({ app, dataSource, jwtService, tenantId }) => {
            const token = signIdentityJwtAccessToken(jwtService, {
              role: UserRole.MANAGER,
              tenant_id: tenantId,
            });

            const oldProductId = randomUUID();
            const newProductId = randomUUID();

            // Old product — updated_at frozen at 1970-01-01 (clearly before sinceVersion)
            await dataSource.query(
              `INSERT INTO products (id, tenant_id, name, uom, stock, "averageCost", "sellPrice", is_active, is_perishable, created_at, updated_at)
               VALUES ($1, $2, 'Old Product', 'UND', 10, 5.00, 15.00, true, false, '1970-01-01T00:00:00Z', '1970-01-01T00:00:00Z')`,
              [oldProductId, tenantId],
            );

            // New product — updated_at = now
            await dataSource.query(
              `INSERT INTO products (id, tenant_id, name, uom, stock, "averageCost", "sellPrice", is_active, is_perishable, created_at, updated_at)
               VALUES ($1, $2, 'New Product', 'UND', 20, 8.00, 25.00, true, false, now(), now())`,
              [newProductId, tenantId],
            );

            // sinceVersion = epoch millis for 2000-01-01T00:00:00Z (between old and new)
            const sinceVersion = new Date('2000-01-01T00:00:00Z').getTime();

            const res = await request(app.getHttpServer())
              .get(
                `/v1/sync/inbound/deltas?types=products&sinceVersion=${sinceVersion}`,
              )
              .set('Authorization', `Bearer ${token}`)
              .expect(200);

            // Only the new product should be returned (updated_at > sinceDate)
            expect(res.body.deltas.products).toHaveLength(1);
            expect(res.body.deltas.products[0].id).toBe(newProductId);
            expect(res.body.deltas.products[0].name).toBe('New Product');
          },
        );
      },
      TEST_TIMEOUT_MS,
    );
  });

  // ─── Contract: types filter works ───────────────────────────

  describe('Contract: types filter works', () => {
    it(
      'returns only the requested type and empty arrays for others',
      async () => {
        await withIsolatedSchema(
          'e2e_sync_types',
          async ({ app, dataSource, jwtService, tenantId }) => {
            const token = signIdentityJwtAccessToken(jwtService, {
              role: UserRole.MANAGER,
              tenant_id: tenantId,
            });

            // Seed a product
            await dataSource.query(
              `INSERT INTO products (id, tenant_id, name, uom, stock, "averageCost", "sellPrice", is_active, is_perishable, created_at, updated_at)
               VALUES ($1, $2, 'Test Product', 'UND', 10, 5.00, 15.00, true, false, now(), now())`,
              [randomUUID(), tenantId],
            );

            // Seed a catalog value
            await dataSource.query(
              `INSERT INTO catalog_values (id, tenant_id, catalog_type, code, label, is_active, sort_order, created_at, updated_at)
               VALUES ($1, $2, 'UOM', 'kg', 'Kilogramo', true, 0, now(), now())`,
              [randomUUID(), tenantId],
            );

            // Request only products
            const res = await request(app.getHttpServer())
              .get('/v1/sync/inbound/deltas?types=products')
              .set('Authorization', `Bearer ${token}`)
              .expect(200);

            expect(res.body.deltas.products).toHaveLength(1);
            expect(res.body.deltas.catalogValues).toHaveLength(0);
          },
        );
      },
      TEST_TIMEOUT_MS,
    );
  });

  // ─── Contract: tenant isolation ─────────────────────────────

  describe('Contract: tenant isolation', () => {
    it(
      'only returns products belonging to the authenticated tenant',
      async () => {
        await withIsolatedSchema(
          'e2e_sync_tenant',
          async ({ app, dataSource, jwtService, tenantId }) => {
            const otherTenantId = randomUUID();
            await dataSource.query(
              `INSERT INTO tenants (id, name, is_active, created_at, updated_at) VALUES ($1, $2, true, now(), now())`,
              [otherTenantId, 'Other Tenant'],
            );

            const tokenA = signIdentityJwtAccessToken(jwtService, {
              role: UserRole.MANAGER,
              tenant_id: tenantId,
            });

            // Product for tenant A
            await dataSource.query(
              `INSERT INTO products (id, tenant_id, name, uom, stock, "averageCost", "sellPrice", is_active, is_perishable, created_at, updated_at)
               VALUES ($1, $2, 'Tenant A Product', 'UND', 10, 5.00, 15.00, true, false, now(), now())`,
              [randomUUID(), tenantId],
            );

            // Product for tenant B
            await dataSource.query(
              `INSERT INTO products (id, tenant_id, name, uom, stock, "averageCost", "sellPrice", is_active, is_perishable, created_at, updated_at)
               VALUES ($1, $2, 'Tenant B Product', 'UND', 10, 5.00, 15.00, true, false, now(), now())`,
              [randomUUID(), otherTenantId],
            );

            const res = await request(app.getHttpServer())
              .get('/v1/sync/inbound/deltas?types=products')
              .set('Authorization', `Bearer ${tokenA}`)
              .expect(200);

            expect(res.body.deltas.products).toHaveLength(1);
            expect(res.body.deltas.products[0].name).toBe('Tenant A Product');
          },
        );
      },
      TEST_TIMEOUT_MS,
    );
  });

  // ─── Contract: 401 without token ────────────────────────────

  describe('Contract: 401 without token', () => {
    it(
      'returns 401 when no Authorization header is present',
      async () => {
        await withIsolatedSchema('e2e_sync_401', async ({ app }) => {
          await request(app.getHttpServer())
            .get('/v1/sync/inbound/deltas?types=products')
            .expect(401);
        });
      },
      TEST_TIMEOUT_MS,
    );
  });
});
