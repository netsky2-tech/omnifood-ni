import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as request from 'supertest';
import { InboundSyncController } from '../../src/modules/sales/controllers/inbound-sync.controller';
import { InboundSyncService } from '../../src/modules/sales/services/inbound-sync.service';
import { Product } from '../../src/modules/inventory/entities/product.entity';
import { CatalogValue } from '../../src/modules/catalog/entities/catalog-value.entity';
import { Insumo } from '../../src/modules/inventory/entities/insumo.entity';
import { Recipe } from '../../src/modules/inventory/entities/recipe.entity';
import { RecipeVersion } from '../../src/modules/inventory/entities/recipe-version.entity';
import { RecipeDetail } from '../../src/modules/inventory/entities/recipe-detail.entity';
import { ProductInventoryMappingVersion } from '../../src/modules/inventory/entities/product-inventory-mapping-version.entity';
import { ForensicAlert } from '../../src/modules/inventory/entities/forensic-alert.entity';
import { User } from '../../src/modules/identity/entities/user.entity';
import { UomConversion } from '../../src/modules/inventory/entities/uom-conversion.entity';
import { SecurityProfile } from '../../src/modules/identity/entities/security-profile.entity';
import { Tenant } from '../../src/modules/tenant/entities/tenant.entity';
import { AuthGuard } from '../../src/modules/identity/guards/auth.guard';
import { SyncTransportGuard } from '../../src/modules/identity/guards/sync-transport.guard';
import {
  DEVICE_SYNC_JWT_CONFIG,
  getDeviceSyncJwtConfig,
} from '../../src/modules/identity/config/device-sync-jwt.config';
import { DeviceSyncCredential } from '../../src/modules/identity/entities/device-sync-credential.entity';
import { ActivationAttempt } from '../../src/modules/onboarding/entities/activation-attempt.entity';
import {
  createIdentityJwtConfigProvider,
  createIdentityJwtTestConfigProvider,
} from '../support/identity-jwt-test.fixture';
import {
  provisionDeviceSyncCredential,
  signDeviceSyncAccessToken,
  type ProvisionedDeviceSyncCredential,
} from '../support/device-sync-e2e.helper';
import { normalizeTenantSlug } from '../../src/modules/tenant/tenant-slug';
import {
  applyForcedTenantRls,
  createRlsTestRole,
  dropRlsTestRole,
  rebindTenantColumnToUuid,
} from '../support/rls-test-shape.helper';

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
  RecipeDetail,
  ProductInventoryMappingVersion,
  User,
  UomConversion,
  SecurityProfile,
  DeviceSyncCredential,
  ActivationAttempt,
  ForensicAlert,
];

/** Tables the restricted runtime role may SELECT (the inbound read path). */
const RLS_ROLE_TABLES = [
  'tenants',
  'products',
  'catalog_values',
  'insumos',
  'recipes',
  'recipe_versions',
  'recipe_details',
  'users',
  'security_profiles',
  'product_inventory_mapping_versions',
  'device_sync_credentials',
  'onboarding_activation_attempts',
  // forensic_alerts carries no row-level security policy in production: the
  // inbound alerts projection isolates tenants through its explicit
  // `tenant_id` predicate, so the role needs a plain SELECT grant and the
  // suite must not claim RLS enforcement for this table.
  'forensic_alerts',
] as const;

async function withIsolatedSchema(
  schemaPrefix: string,
  assertion: (ctx: {
    app: INestApplication;
    /** Admin (superuser) connection: schema build, seeding and cleanup only. */
    admin: DataSource;
    /** The connection the application runs on: restricted role, RLS-bound. */
    dataSource: DataSource;
    deviceToken: string;
    tenantId: string;
  }) => Promise<void>,
): Promise<void> {
  const bootstrap = new DataSource({ type: 'postgres', ...postgresConnection });
  const schema = `${schemaPrefix}_${randomUUID().replace(/-/g, '')}`;
  const roleName = `${schemaPrefix}_rls_${randomUUID().replace(/-/g, '')}`;
  const rolePassword = randomUUID();
  let admin: DataSource | null = null;
  let dataSource: DataSource | null = null;
  let app: INestApplication | null = null;
  const provisionedDevices: ProvisionedDeviceSyncCredential[] = [];

  try {
    await bootstrap.initialize();
    await bootstrap.query(`CREATE SCHEMA "${schema}"`);

    admin = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      schema,
      entities: ALL_ENTITIES,
      synchronize: true,
      extra: { max: 2 },
    });
    await admin.initialize();

    // Production RLS shape (issue #470): `synchronize` never emits RLS, so
    // the suite applies FORCED row-level security with the exact predicate
    // the migrations emit, on the catalog tables the inbound read path
    // touches. Products carry no RLS in production and keep none here.
    const ddl = admin.createQueryRunner();
    try {
      await ddl.connect();
      // current_schema() inside resolveTenantRlsPredicate follows the
      // session search_path, so point it at the isolated schema before
      // emitting any RLS DDL.
      await ddl.query(`SET search_path TO "${schema}", public`);
      await rebindTenantColumnToUuid(ddl, schema, 'catalog_values');
      await applyForcedTenantRls(ddl, schema, 'catalog_values', ['select']);
      await rebindTenantColumnToUuid(
        ddl,
        schema,
        'product_inventory_mapping_versions',
      );
      await applyForcedTenantRls(
        ddl,
        schema,
        'product_inventory_mapping_versions',
        ['select'],
      );
    } finally {
      await ddl.release();
    }

    await createRlsTestRole({
      bootstrap,
      roleName,
      password: rolePassword,
      schema,
      tables: RLS_ROLE_TABLES,
    });

    const tenantId = randomUUID();
    await admin.query(
      `INSERT INTO tenants (id, name, slug, is_active, created_at, updated_at) VALUES ($1, $2, $3, true, now(), now())`,
      [
        tenantId,
        `E2E Tenant ${schemaPrefix}`,
        normalizeTenantSlug(`E2E Tenant ${schemaPrefix}`),
      ],
    );

    // Provision an ACTIVE device sync credential (plus its PASS activation
    // attempt) for the tenant: the /v1/sync transport is device-only, so the
    // inbound pull routes below authenticate with a device token.
    provisionedDevices.push(
      await provisionDeviceSyncCredential(admin, {
        // Both DataSources carry the isolated-schema `schema` option, so
        // SyncTransportGuard reads the device tables from that isolated
        // schema and the provisioned rows must land there too.
        schema,
        tenantId,
        deviceId: 'terminal-1',
        scopes: ['sync:pull'],
      }),
    );

    // The application runs as the restricted role: NOSUPERUSER NOBYPASSRLS,
    // not the table owner, so FORCED RLS applies to every read it makes.
    dataSource = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      username: roleName,
      password: rolePassword,
      schema,
      entities: ALL_ENTITIES,
      synchronize: false,
      extra: { max: 2 },
    });
    await dataSource.initialize();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [InboundSyncController],
      providers: [
        InboundSyncService,
        {
          provide: getRepositoryToken(Product),
          useValue: dataSource.getRepository(Product),
        },
        {
          provide: getRepositoryToken(CatalogValue),
          useValue: dataSource.getRepository(CatalogValue),
        },
        {
          provide: getRepositoryToken(Insumo),
          useValue: dataSource.getRepository(Insumo),
        },
        {
          provide: getRepositoryToken(Recipe),
          useValue: dataSource.getRepository(Recipe),
        },
        {
          provide: getRepositoryToken(RecipeVersion),
          useValue: dataSource.getRepository(RecipeVersion),
        },
        {
          provide: getRepositoryToken(RecipeDetail),
          useValue: dataSource.getRepository(RecipeDetail),
        },
        {
          provide: getRepositoryToken(User),
          useValue: dataSource.getRepository(User),
        },
        JwtService,
        AuthGuard,
        SyncTransportGuard,
        { provide: DataSource, useValue: dataSource },
        {
          provide: DEVICE_SYNC_JWT_CONFIG,
          inject: [ConfigService],
          useFactory: getDeviceSyncJwtConfig,
        },
        createIdentityJwtTestConfigProvider(),
        createIdentityJwtConfigProvider(),
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();

    const deviceToken = signDeviceSyncAccessToken(app, provisionedDevices[0]);

    await assertion({ app, admin, dataSource, deviceToken, tenantId });
  } finally {
    if (app) await app.close();
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (admin?.isInitialized) {
      // Device sync rows live in the isolated schema: delete provisioned
      // credentials before their activation attempts inside a per-tenant
      // transaction that sets the RLS tenant context.
      for (const device of provisionedDevices) {
        await admin.transaction(async (manager) => {
          await manager.query("SELECT set_config('app.tenant_id', $1, true)", [
            device.tenantId,
          ]);
          await manager.query(
            `DELETE FROM device_sync_credentials WHERE id = $1`,
            [device.credentialId],
          );
          await manager.query(
            `DELETE FROM onboarding_activation_attempts WHERE id = $1`,
            [device.activationAttemptId],
          );
        });
      }
      await admin.destroy();
    }
    if (bootstrap.isInitialized) {
      await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await dropRlsTestRole(bootstrap, roleName);
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
          async ({ app, admin, deviceToken, tenantId }) => {
            const token = deviceToken;

            const productId = randomUUID();
            await admin.query(
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
          async ({ app, admin, deviceToken, tenantId }) => {
            const token = deviceToken;

            const catalogId = randomUUID();
            await admin.query(
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
          async ({ app, admin, deviceToken, tenantId }) => {
            const token = deviceToken;

            const oldProductId = randomUUID();
            const newProductId = randomUUID();

            // Old product — updated_at frozen at 1970-01-01 (clearly before sinceVersion)
            await admin.query(
              `INSERT INTO products (id, tenant_id, name, uom, stock, "averageCost", "sellPrice", is_active, is_perishable, created_at, updated_at)
               VALUES ($1, $2, 'Old Product', 'UND', 10, 5.00, 15.00, true, false, '1970-01-01T00:00:00Z', '1970-01-01T00:00:00Z')`,
              [oldProductId, tenantId],
            );

            // New product — updated_at = now
            await admin.query(
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
          async ({ app, admin, deviceToken, tenantId }) => {
            const token = deviceToken;

            // Seed a product
            await admin.query(
              `INSERT INTO products (id, tenant_id, name, uom, stock, "averageCost", "sellPrice", is_active, is_perishable, created_at, updated_at)
               VALUES ($1, $2, 'Test Product', 'UND', 10, 5.00, 15.00, true, false, now(), now())`,
              [randomUUID(), tenantId],
            );

            // Seed a catalog value
            await admin.query(
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
          async ({ app, admin, deviceToken, tenantId }) => {
            const otherTenantId = randomUUID();
            await admin.query(
              `INSERT INTO tenants (id, name, slug, is_active, created_at, updated_at) VALUES ($1, $2, $3, true, now(), now())`,
              [
                otherTenantId,
                'Other Tenant',
                normalizeTenantSlug('Other Tenant'),
              ],
            );

            const tokenA = deviceToken;

            // Product for tenant A
            await admin.query(
              `INSERT INTO products (id, tenant_id, name, uom, stock, "averageCost", "sellPrice", is_active, is_perishable, created_at, updated_at)
               VALUES ($1, $2, 'Tenant A Product', 'UND', 10, 5.00, 15.00, true, false, now(), now())`,
              [randomUUID(), tenantId],
            );

            // Product for tenant B
            await admin.query(
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

  // ─── Contract: forensic alerts in sync-down response ───────

  describe('Contract: forensic alerts in sync-down response', () => {
    it(
      'returns seeded forensic alerts with the cloud-to-POS field mapping',
      async () => {
        await withIsolatedSchema(
          'e2e_sync_alerts_map',
          async ({ app, admin, deviceToken, tenantId }) => {
            const token = deviceToken;

            const activeAlertId = randomUUID();
            const resolvedAlertId = randomUUID();

            await admin.query(
              `INSERT INTO forensic_alerts (id, tenant_id, alert_type, severity, actor_role, message, metadata, resolved_at, created_at)
               VALUES ($1, $2, 'COUNT_VARIANCE', 'high', 'MANAGER', 'Conteo con variación relevante.', NULL, NULL, '2026-09-01T10:00:00Z')`,
              [activeAlertId, tenantId],
            );
            await admin.query(
              `INSERT INTO forensic_alerts (id, tenant_id, alert_type, severity, actor_role, message, metadata, resolved_at, created_at)
               VALUES ($1, $2, 'AUDIT_BACKEND_TERMINAL_REJECTION', 'critical', NULL, 'Rechazo de terminal registrado.', NULL, '2026-09-02T12:00:00Z', '2026-09-01T11:00:00Z')`,
              [resolvedAlertId, tenantId],
            );

            const res = await request(app.getHttpServer())
              .get('/v1/sync/inbound/deltas?types=alerts')
              .set('Authorization', `Bearer ${token}`)
              .expect(200);

            expect(res.body.deltas.alerts).toHaveLength(2);
            const byId = new Map<string, Record<string, unknown>>(
              (res.body.deltas.alerts as { id: string }[]).map(
                (alert) => [alert.id, alert] as const,
              ),
            );

            const active = byId.get(activeAlertId);
            expect(active).toMatchObject({
              alertType: 'COUNT_VARIANCE',
              severity: 'high',
              message: 'Conteo con variación relevante.',
              actorRole: 'MANAGER',
              resolvedAt: null,
            });

            // Lifecycle state is reported, never fabricated: the backend
            // hands over resolvedAt verbatim and the terminal derives the
            // status from it.
            const resolved = byId.get(resolvedAlertId);
            expect(resolved).toMatchObject({
              alertType: 'AUDIT_BACKEND_TERMINAL_REJECTION',
              severity: 'critical',
              actorRole: null,
            });
            expect(resolved.resolvedAt).toBeTruthy();
            expect(new Date(resolved.resolvedAt as string).toISOString()).toBe(
              '2026-09-02T12:00:00.000Z',
            );
          },
        );
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'filters incremental alert pulls by created_at >= sinceVersion',
      async () => {
        await withIsolatedSchema(
          'e2e_sync_alerts_since',
          async ({ app, admin, deviceToken, tenantId }) => {
            const token = deviceToken;

            await admin.query(
              `INSERT INTO forensic_alerts (id, tenant_id, alert_type, severity, actor_role, message, metadata, resolved_at, created_at)
               VALUES ($1, $2, 'OLD_ALERT', 'low', NULL, 'Antiguo.', NULL, NULL, '1970-01-01T00:00:00Z')`,
              [randomUUID(), tenantId],
            );
            const newAlertId = randomUUID();
            await admin.query(
              `INSERT INTO forensic_alerts (id, tenant_id, alert_type, severity, actor_role, message, metadata, resolved_at, created_at)
               VALUES ($1, $2, 'NEW_ALERT', 'high', NULL, 'Reciente.', NULL, NULL, now())`,
              [newAlertId, tenantId],
            );

            const sinceVersion = new Date('2000-01-01T00:00:00Z').getTime();
            const res = await request(app.getHttpServer())
              .get(
                `/v1/sync/inbound/deltas?types=alerts&sinceVersion=${sinceVersion}`,
              )
              .set('Authorization', `Bearer ${token}`)
              .expect(200);

            // The table has no updated_at, so created_at is the only cursor.
            expect(res.body.deltas.alerts).toHaveLength(1);
            expect(res.body.deltas.alerts[0].id).toBe(newAlertId);
          },
        );
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'returns an alert whose created_at equals the sinceVersion watermark exactly',
      async () => {
        await withIsolatedSchema(
          'e2e_sync_alerts_boundary',
          async ({ app, admin, deviceToken, tenantId }) => {
            const token = deviceToken;

            // Created strictly before the watermark: excluded.
            await admin.query(
              `INSERT INTO forensic_alerts (id, tenant_id, alert_type, severity, actor_role, message, metadata, resolved_at, created_at)
               VALUES ($1, $2, 'OLDER_ALERT', 'low', NULL, 'Anterior.', NULL, NULL, $3)`,
              [randomUUID(), tenantId, new Date(1787745599000).toISOString()],
            );
            // Created exactly AT the watermark: the inclusive comparison is
            // what makes cloud overlap idempotent on the terminal, because
            // the POS projection is insert-if-absent.
            const boundaryAlertId = randomUUID();
            await admin.query(
              `INSERT INTO forensic_alerts (id, tenant_id, alert_type, severity, actor_role, message, metadata, resolved_at, created_at)
               VALUES ($1, $2, 'BOUNDARY_ALERT', 'high', NULL, 'En la marca.', NULL, NULL, $3)`,
              [
                boundaryAlertId,
                tenantId,
                new Date(1787745600000).toISOString(),
              ],
            );

            const res = await request(app.getHttpServer())
              .get(
                `/v1/sync/inbound/deltas?types=alerts&sinceVersion=1787745600000`,
              )
              .set('Authorization', `Bearer ${token}`)
              .expect(200);

            expect(res.body.deltas.alerts).toHaveLength(1);
            expect(res.body.deltas.alerts[0].id).toBe(boundaryAlertId);
          },
        );
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'only returns alerts belonging to the authenticated tenant via the explicit predicate',
      async () => {
        await withIsolatedSchema(
          'e2e_sync_alerts_tenant',
          async ({ app, admin, deviceToken, tenantId }) => {
            const token = deviceToken;
            const otherTenantId = randomUUID();
            await admin.query(
              `INSERT INTO tenants (id, name, slug, is_active, created_at, updated_at) VALUES ($1, $2, $3, true, now(), now())`,
              [
                otherTenantId,
                'Other Tenant',
                normalizeTenantSlug('Other Tenant'),
              ],
            );

            await admin.query(
              `INSERT INTO forensic_alerts (id, tenant_id, alert_type, severity, actor_role, message, metadata, resolved_at, created_at)
               VALUES ($1, $2, 'TENANT_A_ALERT', 'high', NULL, 'De A.', NULL, NULL, now())`,
              [randomUUID(), tenantId],
            );
            await admin.query(
              `INSERT INTO forensic_alerts (id, tenant_id, alert_type, severity, actor_role, message, metadata, resolved_at, created_at)
               VALUES ($1, $2, 'TENANT_B_ALERT', 'high', NULL, 'De B.', NULL, NULL, now())`,
              [randomUUID(), otherTenantId],
            );

            // forensic_alerts has NO row-level security policy in production;
            // the isolation proof below therefore exercises the explicit
            // tenant_id predicate, not RLS. Do not credit RLS here.
            const res = await request(app.getHttpServer())
              .get('/v1/sync/inbound/deltas?types=alerts')
              .set('Authorization', `Bearer ${token}`)
              .expect(200);

            expect(res.body.deltas.alerts).toHaveLength(1);
            expect(res.body.deltas.alerts[0].alertType).toBe('TENANT_A_ALERT');
          },
        );
      },
      TEST_TIMEOUT_MS,
    );
  });

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
