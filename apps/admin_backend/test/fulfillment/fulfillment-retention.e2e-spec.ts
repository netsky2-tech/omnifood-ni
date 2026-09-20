import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { IdentityModule } from '../../src/modules/identity/identity.module';
import { InventoryModule } from '../../src/modules/inventory/inventory.module';
import {
  User,
  UserRole,
} from '../../src/modules/identity/entities/user.entity';
import { Tenant } from '../../src/modules/tenant/entities/tenant.entity';
import { SecurityProfile } from '../../src/modules/identity/entities/security-profile.entity';
import { AuditLog } from '../../src/modules/identity/entities/audit-log.entity';
import { AuditIntegrityAlert } from '../../src/modules/identity/entities/audit-integrity-alert.entity';
import { InventorySyncReceipt } from '../../src/modules/inventory/entities/inventory-sync-receipt.entity';
import { InventorySyncOutbox } from '../../src/modules/inventory/entities/inventory-sync-outbox.entity';
import { InventoryMovement } from '../../src/modules/inventory/entities/inventory-movement.entity';
import { Insumo } from '../../src/modules/inventory/entities/insumo.entity';
import { Product } from '../../src/modules/inventory/entities/product.entity';
import { Recipe } from '../../src/modules/inventory/entities/recipe.entity';
import { RecipeVersion } from '../../src/modules/inventory/entities/recipe-version.entity';
import { RecipeDetail } from '../../src/modules/inventory/entities/recipe-detail.entity';
import { Supplier } from '../../src/modules/inventory/entities/supplier.entity';
import { Warehouse } from '../../src/modules/inventory/entities/warehouse.entity';
import { UomConversion } from '../../src/modules/inventory/entities/uom-conversion.entity';
import { Batch } from '../../src/modules/inventory/entities/batch.entity';
import { Invoice } from '../../src/modules/sales/entities/invoice.entity';
import { InvoiceItem } from '../../src/modules/sales/entities/invoice-item.entity';
import { Payment } from '../../src/modules/sales/entities/payment.entity';
import { InvoiceItemModifier } from '../../src/modules/sales/entities/invoice-item-modifier.entity';
import { SalesModule } from '../../src/modules/sales/sales.module';
import { FulfillmentModule } from '../../src/modules/fulfillment/fulfillment.module';
import { TenantTopologyRevision } from '../../src/modules/fulfillment/entities/tenant-topology-revision.entity';
import { TenantFulfillmentRecord } from '../../src/modules/fulfillment/entities/tenant-fulfillment-record.entity';
import { DeviceSyncCredential } from '../../src/modules/identity/entities/device-sync-credential.entity';
import { ActivationAttempt } from '../../src/modules/onboarding/entities/activation-attempt.entity';
import { signIdentityJwtAccessToken } from '../support/identity-jwt-test.fixture';
import { createMigrationBuiltSchemaFixture } from '../support/migration-built-schema.helper';
import {
  provisionDeviceSyncCredential,
  signDeviceSyncAccessToken,
  type ProvisionedDeviceSyncCredential,
} from '../support/device-sync-e2e.helper';
import { SyncBatchRecordDto } from '../../src/modules/sales/dto/sync-batch.dto';

/**
 * Issue #429: this HTTP E2E builds its schema exclusively from the FULL
 * migration set (`createMigrationBuiltSchemaFixture`) and runs the Nest
 * application under the fixture's dedicated runtime role — LOGIN
 * NOSUPERUSER NOBYPASSRLS, owner of nothing. Every RLS policy below is
 * therefore production policy actually enforced by PostgreSQL, not a
 * decorative policy bypassed by a superuser connection.
 *
 * The administrator connection is used only for infrastructure and seeding
 * the runtime role must not own: tenants/users fixtures, the device sync
 * credential rows, and direct invoice/fulfillment seeds. Application flows
 * (HTTP requests, RLS-context transactions) run through the app DataSource
 * as the restricted runtime role.
 */
describe('FulfillmentRetention (e2e - Real PostgreSQL, migration-built schema, restricted runtime role)', () => {
  let app: INestApplication<App>;
  let appSource: DataSource;
  let adminSource: DataSource;
  let jwtService: JwtService;
  let fixture: Awaited<ReturnType<typeof createMigrationBuiltSchemaFixture>>;
  let schema: string;

  const tenantAId = randomUUID();
  const tenantBId = randomUUID();
  const ownerAId = randomUUID();
  const ownerBId = randomUUID();

  let ownerAToken: string;
  let ownerBToken: string;

  let deviceAToken: string;
  const provisionedDevices: ProvisionedDeviceSyncCredential[] = [];

  const postgresConnection = {
    type: 'postgres' as const,
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? '5432'),
    username: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_DATABASE ?? 'omnifood',
  };

  beforeAll(async () => {
    // The schema is the migrations' output, built as a restricted role; the
    // helper provisions the scratch schema, uuid-ossp, the migration/reader
    // roles, and the dedicated runtime app role (NOSUPERUSER NOBYPASSRLS,
    // DML-only grants, no migrations-ledger access).
    fixture = await createMigrationBuiltSchemaFixture();
    schema = fixture.schema;
    process.stdout.write(
      `[timing] migration-built setup = ${fixture.setupDurationMs} ms (migrations alone: ${fixture.migrationDurationMs} ms)\n`,
    );

    // Administrator connection for infrastructure/seeding only: superuser
    // bypasses the FORCED row-level security, which is what makes cross-
    // tenant fixture seeding possible. The app itself never uses this
    // connection. search_path is pinned so unqualified seeding SQL resolves
    // against the scratch schema.
    adminSource = new DataSource({
      ...postgresConnection,
      schema,
      extra: {
        allowExitOnIdle: true,
        options: `-c search_path=${schema},public`,
      },
    });
    await adminSource.initialize();

    const tenantAName = `Tenant A Retention ${randomUUID().substring(0, 8)}`;
    const tenantBName = `Tenant B Retention ${randomUUID().substring(0, 8)}`;

    // The migration set created tenants/users (with uuid ids and the
    // users_role_enum role column) inside the scratch schema; seed via the
    // admin connection, which bypasses RLS on purpose for fixtures.
    const seedRunner = adminSource.createQueryRunner();
    await seedRunner.connect();
    await seedRunner.query(
      `INSERT INTO tenants (id, name, is_active) VALUES ($1, $2, true), ($3, $4, true)`,
      [tenantAId, tenantAName, tenantBId, tenantBName],
    );

    const ownerAEmail = `owner.a.${randomUUID()}@test.com`;
    const ownerBEmail = `owner.b.${randomUUID()}@test.com`;

    await seedRunner.query(
      `INSERT INTO users (id, tenant_id, name, email, role, is_active, security_version) VALUES
       ($1, $2, 'Owner A', $3, 'OWNER', true, 1),
       ($4, $5, 'Owner B', $6, 'OWNER', true, 1)`,
      [ownerAId, tenantAId, ownerAEmail, ownerBId, tenantBId, ownerBEmail],
    );
    await seedRunner.release();

    // Provision an ACTIVE device sync credential (plus its PASS activation
    // attempt) for Tenant A, in the scratch schema (the migration set owns
    // the device sync DDL there): /v1/sync/batch is device-only, so it is
    // bound to the canonical device id the batch record below uses as
    // sourceDeviceId ('terminal-1') and granted only the sync:push scope the
    // batch route requires. Tenant B never touches /v1/sync/* (human-auth
    // endpoints only), so it needs no device credential.
    provisionedDevices.push(
      await provisionDeviceSyncCredential(adminSource, {
        tenantId: tenantAId,
        deviceId: 'terminal-1',
        schema,
        scopes: ['sync:push'],
      }),
    );

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              NODE_ENV: 'test',
              JWT_SECRET: 'test-only-jwt-secret-with-at-least-thirty-two-bytes',
              JWT_ISSUER: 'omnifood-admin',
              JWT_AUDIENCE: 'omnifood-pos',
              JWT_ACCESS_TTL_SECONDS: '3600',
              JWT_REFRESH_TTL_SECONDS: '604800',
              JWT_CLOCK_TOLERANCE_SECONDS: '5',
              JWT_ALGORITHM: 'HS256',
            }),
          ],
        }),
        EventEmitterModule.forRoot(),
        TypeOrmModule.forRoot({
          ...postgresConnection,
          // Issue #429: the Nest application connects as the fixture's
          // runtime role — NOSUPERUSER NOBYPASSRLS, non-owner, DML-only —
          // so every query below is subject to the migrated RLS policies.
          username: fixture.runtimeRoleName,
          password: fixture.runtimeRolePassword,
          entities: [
            Tenant,
            User,
            SecurityProfile,
            AuditLog,
            AuditIntegrityAlert,
            InventorySyncReceipt,
            InventorySyncOutbox,
            InventoryMovement,
            Insumo,
            Product,
            Recipe,
            RecipeVersion,
            RecipeDetail,
            Supplier,
            Warehouse,
            UomConversion,
            Batch,
            Invoice,
            InvoiceItem,
            Payment,
            InvoiceItemModifier,
            TenantTopologyRevision,
            TenantFulfillmentRecord,
            DeviceSyncCredential,
            ActivationAttempt,
          ],
          // The migration-built tables all live in the scratch schema,
          // including the device sync tables. The DataSource-level `schema`
          // option and the per-connection search_path agree on that schema
          // for every pooled connection, exactly as production agrees on
          // its own schema.
          schema,
          extra: {
            allowExitOnIdle: true,
            options: `-c search_path=${schema},public`,
          },
          synchronize: false,
        }),
        IdentityModule,
        InventoryModule,
        SalesModule,
        FulfillmentModule,
      ],
      providers: [
        {
          provide: 'InvoiceRepository',
          useFactory: (dataSource: DataSource) =>
            dataSource.getRepository(Invoice),
          inject: [DataSource],
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );

    await app.init();

    appSource = moduleFixture.get<DataSource>(DataSource);

    jwtService = moduleFixture.get<JwtService>(JwtService);
    ownerAToken = signIdentityJwtAccessToken(jwtService, {
      sub: ownerAId,
      email: ownerAEmail,
      role: UserRole.OWNER,
      tenant_id: tenantAId,
    });
    ownerBToken = signIdentityJwtAccessToken(jwtService, {
      sub: ownerBId,
      email: ownerBEmail,
      role: UserRole.OWNER,
      tenant_id: tenantBId,
    });

    // Device tokens are minted from the SAME DEVICE_SYNC_JWT_CONFIG the
    // bootstrapped app runs with (read from the container, not duplicated).
    deviceAToken = signDeviceSyncAccessToken(app, provisionedDevices[0]);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (adminSource && adminSource.isInitialized) {
      // Device sync rows live in the scratch schema and
      // device_sync_credentials is FORCE RLS: delete inside a per-tenant
      // transaction that sets the RLS tenant context, credentials before
      // their activation attempts (same as the migrated reference suites).
      for (const device of provisionedDevices) {
        await adminSource.transaction(async (manager) => {
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
      await adminSource.destroy();
    }
    // The helper's close() drops the scratch schema and every role; all
    // application/admin sessions must be gone first, because live sessions
    // block DROP ROLE.
    if (fixture) {
      await fixture.close();
    }
  });

  it('syncs fulfillment batch into PostgreSQL and verifies via GET /fulfillment/records/:id', async () => {
    const fulfillmentId = `f-sale-e2e-${randomUUID()}`;
    const recordDto: SyncBatchRecordDto = {
      idempotencyKey: `outbox:terminal-1:${fulfillmentId}`,
      sourceDeviceId: 'terminal-1',
      sourceSequence: 1,
      flowType: 'fulfillment',
      documentType: 'FULFILLMENT',
      aggregateType: 'fulfillment',
      aggregateId: fulfillmentId,
      eventId: `event:${fulfillmentId}`,
      topologyRevision: 1,
      fulfillment: {
        id: fulfillmentId,
        saleId: 'sale-e2e-1',
        topologySnapshotId: 'snapshot-1',
        topologyRevision: 1,
        channel: 'KDS_AND_PRINT',
        routeState: 'ROUTED',
        deliveryState: 'PENDING',
        lines: [{ id: 'line-1', action: 'PREPARE', station: 'COCINA' }],
      },
    };

    // 1. Post sync batch (device-only transport: device JWT; human Bearer
    // tokens are rejected on /v1/sync/*)
    const syncRes = await request(app.getHttpServer())
      .post('/api/v1/sync/batch')
      .set('Authorization', `Bearer ${deviceAToken}`)
      .send({ records: [recordDto] })
      .expect(201);

    expect(syncRes.body).toMatchObject({ processed: 1 });

    // 2. Fetch record from central fulfillment endpoint
    const recordRes = await request(app.getHttpServer())
      .get(`/api/fulfillment/records/${fulfillmentId}`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .expect(200);

    expect(recordRes.body).toMatchObject({
      id: fulfillmentId,
      tenant_id: tenantAId,
      channel: 'KDS_AND_PRINT',
      delivery_state: 'PENDING',
    });

    // 3. Tenant B cannot access Tenant A's fulfillment record
    await request(app.getHttpServer())
      .get(`/api/fulfillment/records/${fulfillmentId}`)
      .set('Authorization', `Bearer ${ownerBToken}`)
      .expect(404);
  });

  it('runs the application connection under a non-superuser, non-bypassing, non-owner role (issue #429)', async () => {
    const roleAttrs = await appSource.query<
      Array<{
        rolsuper: boolean;
        rolbypassrls: boolean;
        rolcreatedb: boolean;
        rolcreaterole: boolean;
        rolinherit: boolean;
      }>
    >(
      `SELECT r.rolsuper, r.rolbypassrls, r.rolcreatedb, r.rolcreaterole, r.rolinherit
         FROM pg_roles r
        WHERE r.rolname = current_user`,
    );

    expect(roleAttrs).toHaveLength(1);
    expect(roleAttrs[0].rolsuper).toBe(false);
    expect(roleAttrs[0].rolbypassrls).toBe(false);
    expect(roleAttrs[0].rolcreatedb).toBe(false);
    expect(roleAttrs[0].rolcreaterole).toBe(false);
    expect(roleAttrs[0].rolinherit).toBe(false);

    // Non-ownership: the runtime role owns no table, sequence, or the schema
    // itself — the migration role does, which is what keeps FORCE RLS
    // meaningful for the app role and blocks any DDL capability.
    const ownedObjects = await appSource.query<Array<{ count: number }>>(
      `SELECT count(*)::int AS count
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1
          AND c.relowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)`,
      [schema],
    );
    expect(ownedObjects[0].count).toBe(0);

    const schemaOwner = await appSource.query<Array<{ count: number }>>(
      `SELECT count(*)::int AS count
         FROM pg_namespace
        WHERE nspname = $1
          AND nspowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)`,
      [schema],
    );
    expect(schemaOwner[0].count).toBe(0);
  });

  it('holds exactly the least-privilege DML grants ordinary application work needs (issue #429)', async () => {
    const privilege = async (
      objectType: 'table' | 'schema',
      object: string,
      privilege: string,
    ): Promise<boolean> => {
      const rows = await appSource.query<Array<{ allowed: boolean }>>(
        objectType === 'table'
          ? `SELECT has_table_privilege(current_user, $1, $2) AS allowed`
          : `SELECT has_schema_privilege(current_user, $1, $2) AS allowed`,
        [object, privilege],
      );
      return rows[0].allowed;
    };

    // Ordinary DML on application tables: granted.
    expect(await privilege('table', 'invoices', 'SELECT')).toBe(true);
    expect(await privilege('table', 'invoices', 'INSERT')).toBe(true);
    expect(await privilege('table', 'invoices', 'UPDATE')).toBe(true);
    expect(await privilege('table', 'invoices', 'DELETE')).toBe(true);
    expect(
      await privilege('table', 'tenant_fulfillment_records', 'SELECT'),
    ).toBe(true);
    expect(
      await privilege('table', 'tenant_fulfillment_records', 'DELETE'),
    ).toBe(true);

    // Nothing beyond ordinary DML: no TRUNCATE, no DDL, no migrations-ledger
    // access, no cross-schema capabilities.
    expect(await privilege('table', 'invoices', 'TRUNCATE')).toBe(false);
    expect(
      await privilege('table', 'tenant_fulfillment_records', 'TRUNCATE'),
    ).toBe(false);
    expect(await privilege('table', 'invoices', 'REFERENCES')).toBe(false);
    expect(await privilege('table', 'invoices', 'TRIGGER')).toBe(false);
    // Schema-qualified so the probe cannot accidentally resolve a stray
    // `public.migrations` through the pinned search_path instead of the
    // scratch schema's migrations ledger.
    expect(await privilege('table', `${schema}.migrations`, 'SELECT')).toBe(
      false,
    );
    expect(await privilege('table', `${schema}.migrations`, 'INSERT')).toBe(
      false,
    );
    expect(await privilege('schema', schema, 'CREATE')).toBe(false);
    expect(await privilege('schema', schema, 'USAGE')).toBe(true);
    // The public schema is on the search_path only so uuid_generate_v4()
    // resolves; modern default PUBLIC privileges there are USAGE-only, so
    // the runtime role can neither create in public nor DML into it.
    expect(await privilege('schema', 'public', 'CREATE')).toBe(false);

    // Catalog-level proof of that boundary: no table in schema `public`
    // carries any of the seven table privileges for the runtime role or for
    // PUBLIC (aclexplode grantee 0). This holds both on a fresh database,
    // where `public` has zero tables, and on a provisioned one, where
    // `public` may hold tables — any row here would mean an ambient public
    // grant the runtime role could reach through its pinned search_path, so
    // the assertion fails closed rather than silently narrowing the check.
    const publicTableGrants = await appSource.query<
      Array<{ table_name: string; privilege_type: string; grantee: string }>
    >(
      `SELECT c.relname AS table_name, a.privilege_type,
              a.grantee::regrole::text AS grantee
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         CROSS JOIN LATERAL aclexplode(c.relacl) AS a
        WHERE n.nspname = 'public'
          AND c.relkind IN ('r', 'p')
          AND a.grantee IN (0::oid, current_user::regrole::oid)
          AND a.privilege_type IN
              ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
               'REFERENCES', 'TRIGGER')`,
    );
    expect(publicTableGrants).toEqual([]);
  });

  it('carries the production uuid-form tenant policy catalog from the migrations (issue #429)', async () => {
    // The policies come from the migration set only — this spec never
    // authors one. The rebind migrations recreate the invoices policies
    // with the uuid-form predicate; assert the deparsed SELECT half.
    const policyRows = await adminSource.query<
      Array<{
        tablename: string;
        policyname: string;
        cmd: string;
        qual: string | null;
        with_check: string | null;
      }>
    >(
      `SELECT tablename, policyname, cmd, qual, with_check
         FROM pg_policies
        WHERE schemaname = $1 AND tablename IN ('invoices', 'invoice_items')`,
      [schema],
    );

    const invoiceSelect = policyRows.find(
      (r) =>
        r.tablename === 'invoices' &&
        r.policyname === 'credit_note_invoices_tenant_select',
    );
    expect(invoiceSelect).toBeDefined();
    expect(invoiceSelect?.cmd).toBe('SELECT');
    expect(invoiceSelect?.qual).toContain(
      "tenant_id = (current_setting('app.tenant_id'::text, true))::uuid",
    );

    const invoiceInsert = policyRows.find(
      (r) =>
        r.tablename === 'invoices' &&
        r.policyname === 'credit_note_invoices_tenant_insert',
    );
    expect(invoiceInsert).toBeDefined();
    expect(invoiceInsert?.with_check).toContain('::uuid');

    const invoiceDelete = policyRows.find(
      (r) =>
        r.tablename === 'invoices' &&
        r.policyname === 'credit_note_invoices_tenant_delete',
    );
    expect(invoiceDelete).toBeDefined();
    expect(invoiceDelete?.qual).toContain('::uuid');

    // invoices is FORCED row-level security (from the migrations), so even
    // the owner would be subject to these policies.
    const rlsFlags = await adminSource.query<
      Array<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>
    >(
      `SELECT relrowsecurity, relforcerowsecurity
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND c.relname = 'invoices'`,
      [schema],
    );
    expect(rlsFlags).toHaveLength(1);
    expect(rlsFlags[0].relrowsecurity).toBe(true);
    expect(rlsFlags[0].relforcerowsecurity).toBe(true);
  });

  it('executes 90-day retention purge on real PostgreSQL while preserving invoices and recent records', async () => {
    const seedRunner = adminSource.createQueryRunner();
    await seedRunner.connect();

    const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
    const recentDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

    const oldFulfillmentId = `f-old-${randomUUID()}`;
    const recentFulfillmentId = `f-recent-${randomUUID()}`;

    // Seed old & recent fulfillment records (admin seeding; the app role
    // must not own fixture provisioning).
    await seedRunner.query(
      `INSERT INTO tenant_fulfillment_records (id, tenant_id, channel, route_state, delivery_state, created_at) VALUES
       ($1, $2, 'PRINT_ONLY', 'PRINTED', 'PENDING', $3),
       ($4, $2, 'KDS_ONLY', 'ROUTED', 'PENDING', $5)`,
      [oldFulfillmentId, tenantAId, oldDate, recentFulfillmentId, recentDate],
    );

    // The migrated invoices table: uuid id/tenant_id/user_id and the
    // invoice_number column (DGI sequential number), NOT NULL totals.
    const oldInvoiceId = randomUUID();
    await seedRunner.query(
      `INSERT INTO invoices (id, tenant_id, invoice_number, user_id, subtotal, total_tax, total, created_at) VALUES
       ($1, $2, 'FAC-00000001', $3, 100, 15, 115, $4)`,
      [oldInvoiceId, tenantAId, ownerAId, oldDate],
    );

    // A Tenant B row proves the purge is tenant-scoped at the database level
    // under the app role: it must survive Tenant A's purge untouched.
    const tenantBOldFulfillmentId = `f-old-b-${randomUUID()}`;
    await seedRunner.query(
      `INSERT INTO tenant_fulfillment_records (id, tenant_id, channel, route_state, delivery_state, created_at) VALUES
       ($1, $2, 'PRINT_ONLY', 'PRINTED', 'PENDING', $3)`,
      [tenantBOldFulfillmentId, tenantBId, oldDate],
    );

    await seedRunner.release();

    // Trigger Purge via HTTP Endpoint (runs as the restricted runtime role
    // inside a transaction that binds Tenant A's RLS context)
    const purgeRes = await request(app.getHttpServer())
      .post('/api/fulfillment/retention/purge')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({ daysOld: 90 })
      .expect(200);

    const purgeBody = purgeRes.body as Record<string, unknown>;
    expect(Number(purgeBody['purgedFulfillments'])).toBeGreaterThanOrEqual(1);
    expect(Number(purgeBody['excludedInvoices'])).toBeGreaterThanOrEqual(1);

    // Verify old fulfillment record was purged
    await request(app.getHttpServer())
      .get(`/api/fulfillment/records/${oldFulfillmentId}`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .expect(404);

    // Verify recent fulfillment record was preserved
    const recentRes = await request(app.getHttpServer())
      .get(`/api/fulfillment/records/${recentFulfillmentId}`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .expect(200);

    expect(recentRes.body).toMatchObject({ id: recentFulfillmentId });

    // These verification reads run over the ADMINISTRATOR connection, which
    // bypasses RLS entirely: they prove service-scoped purge behavior and
    // data preservation only — Tenant B's old record survived Tenant A's
    // purge, and the invoice rows were never touched (DGI preservation).
    // They are NOT an RLS proof; the authoritative RLS evidence is the
    // separate restricted-app positive/negative test below, which binds
    // tenant contexts on the non-bypassing runtime-role connection.
    const otherTenantCheck = await adminSource.query<Array<{ id: string }>>(
      `SELECT id FROM tenant_fulfillment_records WHERE id = $1 AND tenant_id = $2`,
      [tenantBOldFulfillmentId, tenantBId],
    );
    expect(otherTenantCheck).toHaveLength(1);

    // Verify old invoice was strictly preserved in the database (DGI: no
    // delete path may ever remove invoice rows)
    const invCheck = await adminSource.query<Array<{ id: string }>>(
      `SELECT id FROM invoices WHERE id = $1 AND tenant_id = $2`,
      [oldInvoiceId, tenantAId],
    );
    expect(invCheck).toHaveLength(1);
  });

  // Issue #429: the production RLS policies must — not the service-level
  // predicates — hide Tenant A rows from the application connection. The
  // same query with Tenant A's context bound must still return the row, so
  // the denial below is attributable to the policy, not to missing data.
  it('hides a Tenant A invoice row after Tenant B context is bound on the application connection (issue #429)', async () => {
    const crossTenantInvoiceId = randomUUID();
    const seedRunner = adminSource.createQueryRunner();
    await seedRunner.connect();
    await seedRunner.query(
      `INSERT INTO invoices (id, tenant_id, invoice_number, user_id, subtotal, total_tax, total, created_at)
       VALUES ($1, $2, 'FAC-00000429', $3, 10, 0, 10, now())`,
      [crossTenantInvoiceId, tenantAId, ownerAId],
    );
    await seedRunner.release();

    // Positive control: with Tenant A's own context bound, the row is
    // visible through the restricted runtime-role connection.
    const ownTenantRows = await appSource.transaction(
      async (manager): Promise<Array<{ id: string }>> => {
        await manager.query("SELECT set_config('app.tenant_id', $1, true)", [
          tenantAId,
        ]);
        return manager.query(`SELECT id FROM invoices WHERE id = $1`, [
          crossTenantInvoiceId,
        ]);
      },
    );
    expect(ownTenantRows).toHaveLength(1);

    // Binding Tenant B's RLS context on the SAME connection shape hides the
    // row: production policy enforcement, not a service predicate.
    const visibleRows = await appSource.transaction(
      async (manager): Promise<Array<{ id: string }>> => {
        await manager.query("SELECT set_config('app.tenant_id', $1, true)", [
          tenantBId,
        ]);
        return manager.query(`SELECT id FROM invoices WHERE id = $1`, [
          crossTenantInvoiceId,
        ]);
      },
    );

    expect(visibleRows).toHaveLength(0);
  });
});
