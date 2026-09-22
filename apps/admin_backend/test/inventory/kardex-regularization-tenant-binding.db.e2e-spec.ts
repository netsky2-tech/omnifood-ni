import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as request from 'supertest';
import { DataSource, QueryRunner } from 'typeorm';
import { RegularizationController } from '../../src/modules/inventory/controllers/regularization.controller';
import { KardexRegularizationService } from '../../src/modules/inventory/services/kardex-regularization.service';
import { GovernanceApprovalService } from '../../src/modules/inventory/services/governance-approval.service';
import { KardexCorrection } from '../../src/modules/inventory/entities/kardex-correction.entity';
import { KardexRecalculateQueue } from '../../src/modules/inventory/entities/kardex-recalculate-queue.entity';
import { InventoryMovement } from '../../src/modules/inventory/entities/inventory-movement.entity';
import { Tenant } from '../../src/modules/tenant/entities/tenant.entity';
import { DeviceSyncCredential } from '../../src/modules/identity/entities/device-sync-credential.entity';
import { ActivationAttempt } from '../../src/modules/onboarding/entities/activation-attempt.entity';
import { TenantInterceptor } from '../../src/core/database/rls.interceptor';
import { AuthGuard } from '../../src/modules/identity/guards/auth.guard';
import { RolesGuard } from '../../src/modules/identity/guards/roles.guard';
import { SyncTransportGuard } from '../../src/modules/identity/guards/sync-transport.guard';
import {
  DEVICE_SYNC_JWT_CONFIG,
  getDeviceSyncJwtConfig,
} from '../../src/modules/identity/config/device-sync-jwt.config';
import {
  createIdentityJwtConfigProvider,
  createIdentityJwtTestConfigProvider,
  signIdentityJwtAccessToken,
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
  InventoryMovement,
  KardexCorrection,
  KardexRecalculateQueue,
  DeviceSyncCredential,
  ActivationAttempt,
];

/**
 * Tables the restricted runtime role must read. The regularization sync flow
 * writes kardex_correction and inventory_kardex, and SyncTransportGuard reads
 * the device credential tables back.
 */
const RLS_ROLE_TABLES = [
  'tenants',
  'kardex_correction',
  'inventory_kardex',
  'kardex_recalculate_queue',
  'device_sync_credentials',
  'onboarding_activation_attempts',
] as const;

/**
 * Production RLS shape (ST-06): `synchronize` never emits RLS, so the suite
 * applies FORCED row-level security with the exact predicate the migrations
 * emit, to the two tables the regularization sync flow writes. The
 * application connection runs as a NOSUPERUSER NOBYPASSRLS role that does not
 * own the tables, so every query it makes is subject to these policies.
 *
 * Production column shapes (migration 1785000000000 and 1809070000000):
 * kardex_correction.tenant_id stays varchar (text predicate), while
 * inventory_kardex.tenant_id was rebound to uuid (uuid-cast predicate). The
 * sync flow SELECTs and UPDATEs inventory_kardex and SELECTs and INSERTs into
 * kardex_correction, so the policies mirror that.
 */
async function applyRegularizationRls(
  ddl: QueryRunner,
  schema: string,
): Promise<void> {
  await ddl.query(`SET search_path TO "${schema}", public`);

  await rebindTenantColumnToUuid(ddl, schema, 'inventory_kardex');
  await applyForcedTenantRls(ddl, schema, 'inventory_kardex', ['select']);
  const kardexPredicate = await resolveTenantRlsPredicate(
    ddl,
    'inventory_kardex',
  );
  await ddl.query(
    `CREATE POLICY inventory_kardex_tenant_update ON "${schema}"."inventory_kardex" FOR UPDATE ` +
      `USING (${kardexPredicate}) WITH CHECK (${kardexPredicate})`,
  );

  await applyForcedTenantRls(ddl, schema, 'kardex_correction', [
    'select',
    'insert',
  ]);

  // HR-01 (issue #486): the human pending/approve routes read and update the
  // queue table, which production rebinds to uuid with the uuid-cast tenant
  // predicate (migration 1809070000000). Mirror that shape so an unbound or
  // cleared app.tenant_id deterministically fails the empty-string uuid cast
  // instead of silently hiding rows. Emitted inline (as for the kardex UPDATE
  // policy above) because the shared helper only carries select/insert.
  await rebindTenantColumnToUuid(ddl, schema, 'kardex_recalculate_queue');
  await ddl.query(
    `ALTER TABLE "${schema}"."kardex_recalculate_queue" ENABLE ROW LEVEL SECURITY`,
  );
  await ddl.query(
    `ALTER TABLE "${schema}"."kardex_recalculate_queue" FORCE ROW LEVEL SECURITY`,
  );
  const queuePredicate = await resolveTenantRlsPredicate(
    ddl,
    'kardex_recalculate_queue',
  );
  await ddl.query(
    `CREATE POLICY kardex_recalculate_queue_tenant_select ON "${schema}"."kardex_recalculate_queue" FOR SELECT ` +
      `USING (${queuePredicate})`,
  );
  await ddl.query(
    `CREATE POLICY kardex_recalculate_queue_tenant_update ON "${schema}"."kardex_recalculate_queue" FOR UPDATE ` +
      `USING (${queuePredicate}) WITH CHECK (${queuePredicate})`,
  );
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
    /** HR-01: human OWNER/MANAGER access token bound to tenantId. */
    humanToken: string;
    tenantId: string;
    /** HR-01: tenant A's pending queue item (and tenant B's probe). */
    queueItemId: string;
    otherQueueItemId: string;
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
      await applyRegularizationRls(ddl, schema);
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
    // The sync flow inserts corrections and updates movement costing state,
    // which the SELECT-only role grant inside the helper does not cover.
    await bootstrap.query(
      `GRANT INSERT, UPDATE ON "${schema}"."kardex_correction", "${schema}"."inventory_kardex" TO "${roleName}"`,
    );
    // HR-01: the human approve route completes the queue item.
    await bootstrap.query(
      `GRANT UPDATE ON "${schema}"."kardex_recalculate_queue" TO "${roleName}"`,
    );
    await bootstrap.query(
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "${schema}" TO "${roleName}"`,
    );
    // Reproduce the production failure shape from issue #486: a pooled
    // connection whose app.tenant_id setting was cleared comes back as the
    // empty string, and `''::uuid` raises instead of filtering. With the role
    // default empty, every unbound query in this suite hits that exact cast
    // failure, so any green assertion here proves the service bound the
    // tenant before its first protected query.
    await bootstrap.query(`ALTER ROLE "${roleName}" SET app.tenant_id = ''`);

    const tenantId = randomUUID();
    const otherTenantId = randomUUID();
    for (const [id, name] of [
      [tenantId, `Regularization RLS Tenant A ${schemaPrefix}`],
      [otherTenantId, `Regularization RLS Tenant B ${schemaPrefix}`],
    ] as const) {
      await admin.query(
        `INSERT INTO tenants (id, name, is_active, created_at, updated_at) VALUES ($1, $2, true, now(), now())`,
        [id, name],
      );
    }

    // Origin movements for both tenants. Tenant A's movement 101 is BLOCKED
    // (estado_costeo 40) awaiting regularization; tenant B's movement 201 must
    // stay unreachable from a tenant-A device session.
    for (const [id, owner, insumo] of [
      [101, tenantId, randomUUID()],
      [102, tenantId, randomUUID()],
      [201, otherTenantId, randomUUID()],
    ] as const) {
      await admin.query(
        `INSERT INTO inventory_kardex
           (id, tenant_id, insumo_id, movement_type, quantity, unit_cost_nio,
            total_cost_nio, stock_before, stock_after, source_document_type,
            source_document_id, estado_costeo)
         VALUES ($1, $2, $3, 'SALE', -10, 100, 1000, 20, 10, 'SYSTEM', 'seed', 40)`,
        [id, owner, insumo],
      );
    }

    provisionedDevices.push(
      await provisionDeviceSyncCredential(admin, {
        schema,
        tenantId,
        deviceId: 'terminal-regularization-1',
        scopes: ['sync:push'],
      }),
    );

    // HR-01: one pending queue item per tenant. Tenant B's item is the
    // cross-tenant probe: tenant A's human session must neither see it in
    // the pending queue nor be able to approve it.
    const queueItemId = randomUUID();
    const otherQueueItemId = randomUUID();
    for (const [id, owner, origin, trigger] of [
      [queueItemId, tenantId, 101, 102],
      [otherQueueItemId, otherTenantId, 201, 201],
    ] as const) {
      await admin.query(
        `INSERT INTO kardex_recalculate_queue
           (id, tenant_id, insumo_id, origin_movement_id, trigger_movement_id, status)
         VALUES ($1, $2, $3, $4, $5, 'PENDING')`,
        [id, owner, randomUUID(), origin, trigger],
      );
    }

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
      controllers: [RegularizationController],
      providers: [
        KardexRegularizationService,
        GovernanceApprovalService,
        { provide: DataSource, useValue: dataSource },
        {
          provide: getRepositoryToken(KardexRecalculateQueue),
          inject: [DataSource],
          useFactory: (ds: DataSource) =>
            ds.getRepository(KardexRecalculateQueue),
        },
        {
          provide: getRepositoryToken(KardexCorrection),
          inject: [DataSource],
          useFactory: (ds: DataSource) => ds.getRepository(KardexCorrection),
        },
        {
          provide: getRepositoryToken(InventoryMovement),
          inject: [DataSource],
          useFactory: (ds: DataSource) => ds.getRepository(InventoryMovement),
        },
        TenantInterceptor,
        AuthGuard,
        RolesGuard,
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
    const humanToken = signIdentityJwtAccessToken(app.get(JwtService), {
      sub: 'human-admin-1',
      email: 'human-admin-1@example.test',
      tenant_id: tenantId,
      role: 'MANAGER',
    });

    await assertion({
      app,
      admin,
      dataSource,
      deviceToken,
      humanToken,
      tenantId,
      queueItemId,
      otherQueueItemId,
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

const syncDocument = (
  overrides: Partial<{
    id: string;
    insumoId: string;
    originMovementId: string;
    triggerMovementId: string;
    lineageHash: string;
    authorizedByUserId: string;
    authorizedByRole: string;
    authorizationMethod: string;
  }> = {},
) => ({
  corrections: [
    {
      id: overrides.id ?? randomUUID(),
      insumoId: overrides.insumoId ?? randomUUID(),
      originMovementId: overrides.originMovementId ?? '101',
      triggerMovementId: overrides.triggerMovementId ?? '102',
      previousUnitCostNio: 100,
      recalculatedUnitCostNio: 120,
      deltaUnitCostNio: 20,
      totalDeltaCostNio: 200,
      affectedQuantity: 10,
      lineageHash: overrides.lineageHash ?? randomUUID(),
      createdAt: new Date().toISOString(),
      ...(overrides.authorizedByUserId !== undefined
        ? { authorizedByUserId: overrides.authorizedByUserId }
        : {}),
      ...(overrides.authorizedByRole !== undefined
        ? { authorizedByRole: overrides.authorizedByRole }
        : {}),
      ...(overrides.authorizationMethod !== undefined
        ? { authorizationMethod: overrides.authorizationMethod }
        : {}),
    },
  ],
});

describe('Kardex regularization sync tenant binding E2E — real PostgreSQL under FORCED RLS', () => {
  const TEST_TIMEOUT_MS = 30000;

  it(
    'rejects a regularization sync without a device credential',
    async () => {
      await withIsolatedSchema(
        'e2e_reg_sync_no_token',
        async ({ app, admin }) => {
          await request(app.getHttpServer())
            .post('/inventory/regularization/sync')
            .send(syncDocument())
            .expect(401);

          const corrections = await admin.query(
            `SELECT id FROM kardex_correction`,
          );
          expect(corrections).toHaveLength(0);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'persists the sync correction bound to the device tenant under FORCED RLS',
    async () => {
      await withIsolatedSchema(
        'e2e_reg_sync_bind',
        async ({ app, admin, deviceToken, tenantId }) => {
          const res = await request(app.getHttpServer())
            .post('/inventory/regularization/sync')
            .set('Authorization', `Bearer ${deviceToken}`)
            .send(
              syncDocument({
                authorizedByUserId: 'pos-user-7',
                authorizedByRole: 'supervisor',
                authorizationMethod: 'PIN',
              }),
            )
            .expect(201);

          expect(res.body).toEqual({
            syncedCount: 1,
            duplicatesCount: 0,
          });

          // Persistence verification through the admin (bypassing) connection:
          // the correction exists, is bound to the device tenant, and carries
          // the document's self-reported actor fields (DSI-6: unattested).
          const corrections = await admin.query(
            `SELECT tenant_id, origin_movement_id, authorized_by_user_id,
                    authorized_by_role, authorization_method
             FROM kardex_correction`,
          );
          expect(corrections).toHaveLength(1);
          expect(corrections[0]).toEqual(
            expect.objectContaining({
              tenant_id: tenantId,
              origin_movement_id: '101',
              authorized_by_user_id: 'pos-user-7',
              authorized_by_role: 'supervisor',
              authorization_method: 'PIN',
            }),
          );

          // The costing update touched exactly the tenant's own movement.
          const movements = await admin.query(
            `SELECT id, tenant_id, estado_costeo, unit_cost_nio
             FROM inventory_kardex ORDER BY id`,
          );
          expect(movements).toHaveLength(3);
          const own = movements.find((row) => String(row.id) === '101');
          expect(own).toEqual(
            expect.objectContaining({
              tenant_id: tenantId,
              estado_costeo: 30,
            }),
          );
          expect(Number(own.unit_cost_nio)).toBe(120);

          // The other tenant's movement is untouched.
          const other = movements.find((row) => String(row.id) === '201');
          expect(other.estado_costeo).toBe(40);
          expect(Number(other.unit_cost_nio)).toBe(100);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'keeps legitimately absent actor fields null on auto-approved corrections',
    async () => {
      await withIsolatedSchema(
        'e2e_reg_sync_null_actor',
        async ({ app, admin, deviceToken }) => {
          await request(app.getHttpServer())
            .post('/inventory/regularization/sync')
            .set('Authorization', `Bearer ${deviceToken}`)
            .send(syncDocument())
            .expect(201);

          const corrections = await admin.query(
            `SELECT authorized_by_user_id, authorized_by_role, authorization_method
             FROM kardex_correction`,
          );
          expect(corrections).toHaveLength(1);
          expect(corrections[0].authorized_by_user_id).toBeNull();
          expect(corrections[0].authorized_by_role).toBeNull();
          expect(corrections[0].authorization_method).toBeNull();
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'cannot observe or update another tenant\u2019s movement through the device tenant context',
    async () => {
      await withIsolatedSchema(
        'e2e_reg_sync_isolation',
        async ({ app, admin, deviceToken, tenantId }) => {
          // Tenant B's movement id, offered to tenant A's device session.
          await request(app.getHttpServer())
            .post('/inventory/regularization/sync')
            .set('Authorization', `Bearer ${deviceToken}`)
            .send(syncDocument({ originMovementId: '201' }))
            .expect(201);

          // Under the tenant-bound RLS context tenant B's movement is
          // invisible, so its costing state must remain untouched.
          const other = await admin.query(
            `SELECT estado_costeo, unit_cost_nio FROM inventory_kardex WHERE id = 201`,
          );
          expect(other[0].estado_costeo).toBe(40);
          expect(Number(other[0].unit_cost_nio)).toBe(100);

          // And the correction ledger holds only the device tenant's row.
          const corrections = await admin.query(
            `SELECT tenant_id FROM kardex_correction`,
          );
          expect(corrections).toHaveLength(1);
          expect(corrections[0].tenant_id).toBe(tenantId);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  // HR-01 (issue #486): the human routes bind the authenticated tenant on
  // the same transaction that reads the FORCE-RLS queue table. With the
  // role's session default app.tenant_id = '' (the cleared-pool production
  // shape), any unbound query here fails the ''::uuid cast with a 500, so
  // these assertions cannot pass vacuously.
  it(
    'serves only the authenticated tenant\u2019s pending queue to a human manager under FORCED RLS',
    async () => {
      await withIsolatedSchema(
        'e2e_reg_human_pending',
        async ({ app, humanToken, queueItemId, otherQueueItemId }) => {
          const res = await request(app.getHttpServer())
            .get('/inventory/regularization/pending')
            .set('Authorization', `Bearer ${humanToken}`)
            .expect(200);

          expect(Array.isArray(res.body)).toBe(true);
          expect(res.body).toHaveLength(1);
          expect(res.body[0].id).toBe(queueItemId);
          expect(res.body.some((row: any) => row.id === otherQueueItemId)).toBe(
            false,
          );
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'approves a same-tenant pending item as a human manager and persists only same-tenant effects under FORCED RLS',
    async () => {
      await withIsolatedSchema(
        'e2e_reg_human_approve',
        async ({ app, admin, humanToken, tenantId, queueItemId }) => {
          // Give the trigger movement a higher cost so the approval carries a
          // meaningful, assertable delta (100 -> 120 over 10 units).
          await admin.query(
            `UPDATE inventory_kardex SET unit_cost_nio = 120 WHERE id = 102`,
          );

          const res = await request(app.getHttpServer())
            .post('/inventory/regularization/approve')
            .set('Authorization', `Bearer ${humanToken}`)
            .send({
              queueId: queueItemId,
              authMethod: 'PIN',
              token: 'e2e-human-session',
            })
            .expect(201);

          expect(res.body).toEqual(
            expect.objectContaining({
              tenant_id: tenantId,
              deltaUnitCostNio: 20,
              totalDeltaCostNio: 200,
              authorizedByUserId: 'human-admin-1',
              authorizedByRole: 'MANAGER',
              authorizationMethod: 'PIN',
            }),
          );

          // The queue item was completed inside the bound transaction.
          const queue = await admin.query(
            `SELECT status FROM kardex_recalculate_queue WHERE id = $1`,
            [queueItemId],
          );
          expect(queue[0].status).toBe('COMPLETED');

          // The correction ledger row and the movement costing update are
          // bound to the authenticated tenant.
          const corrections = await admin.query(
            `SELECT tenant_id, origin_movement_id, trigger_movement_id,
                    authorized_by_user_id, authorization_method
             FROM kardex_correction`,
          );
          expect(corrections).toHaveLength(1);
          expect(corrections[0]).toEqual(
            expect.objectContaining({
              tenant_id: tenantId,
              origin_movement_id: '101',
              trigger_movement_id: '102',
              authorized_by_user_id: 'human-admin-1',
              authorization_method: 'PIN',
            }),
          );

          const own = await admin.query(
            `SELECT estado_costeo, unit_cost_nio FROM inventory_kardex WHERE id = 101`,
          );
          expect(own[0].estado_costeo).toBe(30);
          expect(Number(own[0].unit_cost_nio)).toBe(120);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'keeps another tenant\u2019s queue item invisible and unmutatable from a human session without a 500',
    async () => {
      await withIsolatedSchema(
        'e2e_reg_human_isolation',
        async ({ app, admin, humanToken, otherQueueItemId }) => {
          // The cross-tenant queue id exists but must be invisible: the route
          // answers with its existing not-found behavior, never a 500 and
          // never a mutation.
          const res = await request(app.getHttpServer())
            .post('/inventory/regularization/approve')
            .set('Authorization', `Bearer ${humanToken}`)
            .send({
              queueId: otherQueueItemId,
              authMethod: 'PIN',
              token: 'e2e-human-session',
            })
            .expect(404);
          expect(res.body.message).toContain('no encontrado');

          // Tenant B's queue item is still pending and its movement is
          // untouched; no correction row exists for it.
          const otherQueue = await admin.query(
            `SELECT status FROM kardex_recalculate_queue WHERE id = $1`,
            [otherQueueItemId],
          );
          expect(otherQueue[0].status).toBe('PENDING');

          const otherMovement = await admin.query(
            `SELECT estado_costeo, unit_cost_nio FROM inventory_kardex WHERE id = 201`,
          );
          expect(otherMovement[0].estado_costeo).toBe(40);
          expect(Number(otherMovement[0].unit_cost_nio)).toBe(100);

          const corrections = await admin.query(
            `SELECT id FROM kardex_correction`,
          );
          expect(corrections).toHaveLength(0);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );
});
