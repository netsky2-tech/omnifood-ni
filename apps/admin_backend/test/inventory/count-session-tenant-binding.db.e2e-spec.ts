import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { DataSource, QueryRunner } from 'typeorm';
import { InventoryMovementController } from '../../src/modules/inventory/inventory-movement.controller';
import { CountSessionService } from '../../src/modules/inventory/count-session.service';
import { FxRateResolverService } from '../../src/modules/inventory/fx-rate-resolver.service';
import { InventoryPurchaseService } from '../../src/modules/inventory/inventory-purchase.service';
import { InventoryService } from '../../src/modules/inventory/inventory.service';
import { RecipeService } from '../../src/modules/inventory/recipe.service';
import { ShrinkageService } from '../../src/modules/inventory/shrinkage.service';
import { ProductionService } from '../../src/modules/inventory/production.service';
import { InventoryReportsService } from '../../src/modules/inventory/services/inventory-reports.service';
import { Insumo } from '../../src/modules/inventory/entities/insumo.entity';
import { UomConversion } from '../../src/modules/inventory/entities/uom-conversion.entity';
import { InventoryMovement } from '../../src/modules/inventory/entities/inventory-movement.entity';
import { Tenant } from '../../src/modules/tenant/entities/tenant.entity';
import { DeviceSyncCredential } from '../../src/modules/identity/entities/device-sync-credential.entity';
import { ActivationAttempt } from '../../src/modules/onboarding/entities/activation-attempt.entity';
import { TenantInterceptor } from '../../src/core/database/rls.interceptor';
import { AuthGuard } from '../../src/modules/identity/guards/auth.guard';
import { AuthoritativeCurrentUserGuard } from '../../src/modules/identity/guards/authoritative-current-user.guard';
import { RolesGuard } from '../../src/modules/identity/guards/roles.guard';
import { CurrentUserAuthorizationService } from '../../src/modules/identity/services/current-user-authorization.service';
import { SyncTransportGuard } from '../../src/modules/identity/guards/sync-transport.guard';
import {
  DEVICE_SYNC_JWT_CONFIG,
  getDeviceSyncJwtConfig,
} from '../../src/modules/identity/config/device-sync-jwt.config';
import {
  createIdentityJwtConfigProvider,
  createIdentityJwtTestConfigProvider,
} from '../support/identity-jwt-test.fixture';
import {
  provisionDeviceSyncCredential,
  signDeviceSyncAccessToken,
  type ProvisionedDeviceSyncCredential,
} from '../support/device-sync-e2e.helper';
import {
  applyForcedTenantRls,
  createRlsTestRole,
  dropRlsTestRole,
  rebindTenantColumnToUuid,
} from '../support/rls-test-shape.helper';
import { resolveTenantRlsPredicate } from '../../src/core/database/tenant-rls-policy';
import { normalizeTenantSlug } from '../../src/modules/tenant/tenant-slug';

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
  Insumo,
  UomConversion,
  InventoryMovement,
  DeviceSyncCredential,
  ActivationAttempt,
];

/**
 * Tables the restricted runtime role must read. The count-session flow reads
 * insumos and inventory_kardex, and SyncTransportGuard reads the device
 * credential tables back.
 */
const RLS_ROLE_TABLES = [
  'tenants',
  'insumos',
  'inventory_kardex',
  'device_sync_credentials',
  'onboarding_activation_attempts',
] as const;

/**
 * Production RLS shape (issue #470): `synchronize` never emits RLS, so the
 * suite applies FORCED row-level security with the exact predicate the
 * migrations emit, to the two tables the count-session flow writes. The
 * application connection runs as a NOSUPERUSER NOBYPASSRLS role that does
 * not own the tables, so every query it makes is subject to these policies.
 *
 * The count-session flow SELECTs insumos, UPDATEs them, and INSERTs into
 * inventory_kardex, so the policies mirror that: SELECT on both tables plus
 * UPDATE on insumos and INSERT on inventory_kardex, every half carrying the
 * tenant predicate.
 */
async function applyCountSessionRls(
  ddl: QueryRunner,
  schema: string,
): Promise<void> {
  await ddl.query(`SET search_path TO "${schema}", public`);
  await rebindTenantColumnToUuid(ddl, schema, 'insumos');
  await applyForcedTenantRls(ddl, schema, 'insumos', ['select']);
  const insumoPredicate = await resolveTenantRlsPredicate(ddl, 'insumos');
  await ddl.query(
    `CREATE POLICY insumos_tenant_update ON "${schema}"."insumos" FOR UPDATE ` +
      `USING (${insumoPredicate}) WITH CHECK (${insumoPredicate})`,
  );

  await rebindTenantColumnToUuid(ddl, schema, 'inventory_kardex');
  await applyForcedTenantRls(ddl, schema, 'inventory_kardex', [
    'select',
    'insert',
  ]);
}

async function withIsolatedSchema(
  schemaPrefix: string,
  assertion: (ctx: {
    app: INestApplication;
    /** Admin (superuser) connection: schema build, seeding, verification, cleanup. */
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

    const ddl = admin.createQueryRunner();
    try {
      await ddl.connect();
      await applyCountSessionRls(ddl, schema);
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
    // The count flow writes stock updates and adjustment movements, which the
    // SELECT-only role grant inside the helper does not cover.
    await bootstrap.query(
      `GRANT INSERT, UPDATE ON "${schema}"."insumos", "${schema}"."inventory_kardex" TO "${roleName}"`,
    );
    await bootstrap.query(
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "${schema}" TO "${roleName}"`,
    );

    const tenantId = randomUUID();
    const otherTenantId = randomUUID();
    for (const [id, name] of [
      [tenantId, `Count RLS Tenant A ${schemaPrefix}`],
      [otherTenantId, `Count RLS Tenant B ${schemaPrefix}`],
    ] as const) {
      await admin.query(
        `INSERT INTO tenants (id, name, slug, is_active, created_at, updated_at) VALUES ($1, $2, $3, true, now(), now())`,
        [id, name, normalizeTenantSlug(name)],
      );
    }

    const tenantAInsumoId = randomUUID();
    const tenantBInsumoId = randomUUID();
    for (const [id, owner, stock] of [
      [tenantAInsumoId, tenantId, 15],
      [tenantBInsumoId, otherTenantId, 7],
    ] as const) {
      await admin.query(
        `INSERT INTO insumos (id, tenant_id, name, "purchaseUom", "consumptionUom", stock, existencia_actual, costo_promedio_nio)
         VALUES ($1, $2, 'Milk', 'L', 'L', $3, $3, 8)`,
        [id, owner, stock],
      );
    }

    provisionedDevices.push(
      await provisionDeviceSyncCredential(admin, {
        schema,
        tenantId,
        deviceId: 'terminal-count-1',
        scopes: ['sync:push'],
      }),
    );

    // The application runs as the restricted role: NOSUPERUSER NOBYPASSRLS,
    // not the table owner, so FORCED RLS applies to every query it makes.
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
      controllers: [InventoryMovementController],
      providers: [
        CountSessionService,
        { provide: DataSource, useValue: dataSource },
        {
          provide: FxRateResolverService,
          useValue: { getBcnRateByInvoiceDate: jest.fn() },
        },
        {
          provide: InventoryPurchaseService,
          useValue: {
            previewPurchase: jest.fn(),
            recordPurchase: jest.fn(),
            correctPurchase: jest.fn(),
          },
        },
        { provide: ShrinkageService, useValue: { recordShrinkage: jest.fn() } },
        { provide: InventoryService, useValue: { syncMovements: jest.fn() } },
        { provide: RecipeService, useValue: { ingestPosVersion: jest.fn() } },
        {
          provide: ProductionService,
          useValue: { replayProductionClose: jest.fn() },
        },
        {
          provide: InventoryReportsService,
          useValue: { getAlertsSummaryReport: jest.fn() },
        },
        TenantInterceptor,
        AuthGuard,
        AuthoritativeCurrentUserGuard,
        RolesGuard,
        {
          provide: CurrentUserAuthorizationService,
          useValue: { authorize: jest.fn((token: unknown) => token) },
        },
        SyncTransportGuard,
        JwtService,
        Reflector,
        ConfigService,
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

    await assertion({
      app,
      admin,
      dataSource,
      deviceToken,
      tenantId,
    });
  } finally {
    if (app) await app.close();
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (admin?.isInitialized) {
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

const countDocument = (insumoId: string, documentId: string) => ({
  id: documentId,
  warehouseId: 'warehouse-1',
  warehouseName: 'Main Warehouse',
  cutoffAt: '2026-06-02T10:00:00.000Z',
  status: 'posted',
  createdAt: '2026-06-02T09:00:00.000Z',
  updatedAt: '2026-06-02T10:00:00.000Z',
  postedAt: '2026-06-02T10:00:00.000Z',
  movementReferences: [`${documentId}:line-1`],
  lines: [
    {
      id: 'line-1',
      insumoId,
      insumoName: 'Milk',
      uom: 'L',
      theoreticalQuantity: 15,
      approvedEntryIndex: 0,
      entries: [{ countedQuantity: 10 }],
    },
  ],
});

describe('Count session tenant binding E2E — real PostgreSQL under FORCED RLS', () => {
  const TEST_TIMEOUT_MS = 30000;

  it(
    'rejects a count-session write without a device credential',
    async () => {
      await withIsolatedSchema(
        'e2e_count_no_token',
        async ({ app, admin, tenantId }) => {
          const insumoId = (
            await admin.query(
              `SELECT id FROM insumos WHERE tenant_id = $1 LIMIT 1`,
              [tenantId],
            )
          )[0].id as string;

          await request(app.getHttpServer())
            .post('/inventory/count-sessions')
            .send(countDocument(insumoId, 'count-no-token-1'))
            .expect(401);

          const kardex = await admin.query(`SELECT id FROM inventory_kardex`);
          expect(kardex).toHaveLength(0);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'persists the count adjustment bound to the device tenant under FORCED RLS',
    async () => {
      await withIsolatedSchema(
        'e2e_count_bind',
        async ({ app, admin, deviceToken, tenantId }) => {
          const insumoId = (
            await admin.query(
              `SELECT id FROM insumos WHERE tenant_id = $1 LIMIT 1`,
              [tenantId],
            )
          )[0].id as string;

          const res = await request(app.getHttpServer())
            .post('/inventory/count-sessions')
            .set('Authorization', `Bearer ${deviceToken}`)
            .send(countDocument(insumoId, 'count-rls-1'))
            .expect(201);

          expect(res.body).toEqual({
            sessionId: 'count-rls-1',
            movementsCreated: 1,
            skippedExisting: false,
          });

          // Persistence verification through the admin (bypassing) connection:
          // the movement row exists and is bound to the device tenant.
          const movements = await admin.query(
            `SELECT tenant_id, insumo_id, movement_type, quantity, source_document_id
             FROM inventory_kardex`,
          );
          expect(movements).toHaveLength(1);
          expect(movements[0]).toEqual(
            expect.objectContaining({
              tenant_id: tenantId,
              insumo_id: insumoId,
              movement_type: 'ADJUSTMENT',
              source_document_id: 'count-rls-1',
            }),
          );
          expect(Number(movements[0].quantity)).toBe(-5);

          // The stock write touched exactly the tenant's own row.
          const insumos = await admin.query(
            `SELECT tenant_id, stock FROM insumos ORDER BY tenant_id`,
          );
          expect(insumos).toHaveLength(2);
          const ownRow = insumos.find((row) => row.tenant_id === tenantId) as {
            tenant_id: string;
            stock: string;
          };
          const otherRow = insumos.find((row) => row.tenant_id !== tenantId);
          expect(ownRow.stock).toBe('10.0000');
          // The other tenant's row is untouched.
          expect(otherRow.stock).toBe('7.0000');
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'cannot observe or write another tenant\u2019s insumo through the device tenant context',
    async () => {
      await withIsolatedSchema(
        'e2e_count_isolation',
        async ({ app, admin, deviceToken, tenantId }) => {
          const otherInsumoId = (
            await admin.query(
              `SELECT id FROM insumos WHERE tenant_id <> $1 LIMIT 1`,
              [tenantId],
            )
          )[0].id as string;

          // Under the tenant-bound RLS context the other tenant's insumo is
          // invisible, so the document must be rejected instead of silently
          // writing a cross-tenant adjustment.
          await request(app.getHttpServer())
            .post('/inventory/count-sessions')
            .set('Authorization', `Bearer ${deviceToken}`)
            .send(countDocument(otherInsumoId, 'count-rls-x'))
            .expect(404);

          const kardex = await admin.query(`SELECT id FROM inventory_kardex`);
          expect(kardex).toHaveLength(0);

          const otherInsumo = await admin.query(
            `SELECT stock FROM insumos WHERE id = $1`,
            [otherInsumoId],
          );
          expect(otherInsumo[0].stock).toBe('7.0000');
        },
      );
    },
    TEST_TIMEOUT_MS,
  );
});
