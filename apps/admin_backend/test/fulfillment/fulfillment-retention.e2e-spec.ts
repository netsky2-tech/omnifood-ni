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
import { BohInventoryLedgerFoundation1766000000000 } from '../../src/migrations/1766000000000-BohInventoryLedgerFoundation';
import { AddDeterministicSyncSequencing1780000000000 } from '../../src/migrations/1780000000000-AddDeterministicSyncSequencing';
import { AddSaleInventoryOutcomeColumns1803000000000 } from '../../src/migrations/1803000000000-AddSaleInventoryOutcomeColumns';
import { AddAcceptedAtToInventorySyncReceipts1805000000000 } from '../../src/migrations/1805000000000-AddAcceptedAtToInventorySyncReceipts';
import { CreateTenantFulfillmentRecords1795000000000 } from '../../src/migrations/1795000000000-CreateTenantFulfillmentRecords';
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
import { ensurePublicAuthTables } from '../support/fulfillment-test-db.helper';
import {
  ensurePublicDeviceSyncTables,
  provisionDeviceSyncCredential,
  signDeviceSyncAccessToken,
  type ProvisionedDeviceSyncCredential,
} from '../support/device-sync-e2e.helper';
import { SyncBatchRecordDto } from '../../src/modules/sales/dto/sync-batch.dto';

describe('FulfillmentRetention (e2e - Real PostgreSQL, No Mocks)', () => {
  let app: INestApplication<App>;
  let adminSource: DataSource;
  let jwtService: JwtService;
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
    schema = `e2e_retention_${randomUUID().replace(/-/g, '')}`;

    adminSource = new DataSource({
      ...postgresConnection,
    });
    await adminSource.initialize();
    const runner = adminSource.createQueryRunner();
    await runner.connect();

    await runner.query(`CREATE SCHEMA "${schema}"`);
    await runner.query(`SET search_path TO "${schema}", public`);

    await runner.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id varchar(128) PRIMARY KEY,
        tenant_id varchar(64) NOT NULL,
        number varchar(64) NOT NULL,
        user_id varchar(64) NOT NULL,
        subtotal numeric(12, 4) NOT NULL DEFAULT 0,
        total_tax numeric(12, 4) NOT NULL DEFAULT 0,
        total numeric(12, 4) NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        status varchar(32) NOT NULL DEFAULT 'COMPLETED',
        is_canceled boolean NOT NULL DEFAULT false
      );
      CREATE TABLE IF NOT EXISTS invoice_items (
        id varchar(128) PRIMARY KEY,
        tenant_id varchar(64) NOT NULL,
        invoice_id varchar(128) NOT NULL
      );
    `);

    const m1 = new BohInventoryLedgerFoundation1766000000000();
    const m2 = new AddDeterministicSyncSequencing1780000000000();
    const m3 = new CreateTenantFulfillmentRecords1795000000000();
    await m1.up(runner);
    await m2.up(runner);
    await new AddSaleInventoryOutcomeColumns1803000000000().up(runner);
    await new AddAcceptedAtToInventorySyncReceipts1805000000000().up(runner);
    await m3.up(runner);

    await runner.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id varchar(128) PRIMARY KEY,
        tenant_id varchar(64) NOT NULL,
        number varchar(64) NOT NULL,
        user_id varchar(64) NOT NULL,
        subtotal numeric(12, 4) NOT NULL DEFAULT 0,
        total_tax numeric(12, 4) NOT NULL DEFAULT 0,
        total numeric(12, 4) NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        status varchar(32) NOT NULL DEFAULT 'COMPLETED',
        is_canceled boolean NOT NULL DEFAULT false
      );
      ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
      ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
      CREATE POLICY invoices_select ON invoices FOR SELECT USING (tenant_id = current_setting('app.tenant_id', true));
      CREATE POLICY invoices_insert ON invoices FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
      CREATE POLICY invoices_delete ON invoices FOR DELETE USING (tenant_id = current_setting('app.tenant_id', true));
    `);

    const tenantAName = `Tenant A Retention ${randomUUID().substring(0, 8)}`;
    const tenantBName = `Tenant B Retention ${randomUUID().substring(0, 8)}`;

    await ensurePublicAuthTables(runner);

    await ensurePublicDeviceSyncTables(runner);

    await runner.query(
      `INSERT INTO tenants (id, name, created_at, updated_at) VALUES
       ($1, $3, now(), now()),
       ($2, $4, now(), now())
       ON CONFLICT (id) DO NOTHING`,
      [tenantAId, tenantBId, tenantAName, tenantBName],
    );

    const ownerAEmail = `owner.a.${randomUUID()}@test.com`;
    const ownerBEmail = `owner.b.${randomUUID()}@test.com`;

    await runner.query(
      `INSERT INTO users (id, tenant_id, name, email, role, is_active, security_version, created_at, updated_at) VALUES
       ($1, $2, 'Owner A', $5, 'OWNER', true, 1, now(), now()),
       ($3, $4, 'Owner B', $6, 'OWNER', true, 1, now(), now())
       ON CONFLICT (id) DO NOTHING`,
      [ownerAId, tenantAId, ownerBId, tenantBId, ownerAEmail, ownerBEmail],
    );

    await runner.release();

    // Provision an ACTIVE device sync credential (plus its PASS activation
    // attempt) for Tenant A: /v1/sync/batch is device-only, so it is bound to
    // the canonical device id the batch record below uses as sourceDeviceId
    // ('terminal-1') and granted only the sync:push scope the batch route
    // requires. Tenant B never touches /v1/sync/* (human-auth endpoints
    // only), so it needs no device credential.
    provisionedDevices.push(
      await provisionDeviceSyncCredential(adminSource, {
        tenantId: tenantAId,
        deviceId: 'terminal-1',
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
          // Every pooled connection must share the isolated-schema search_path:
          // tables created by the migrations above live in the isolated schema,
          // while tenants/users and the device-sync tables provisioned by the
          // helper live in public. A DataSource-level `schema` option would force
          // the SyncTransportGuard's repository reads into the isolated schema and
          // miss the public rows.
          extra: { options: `-c search_path=${schema},public` },
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
      // Device sync rows live in public and device_sync_credentials is FORCE
      // RLS: delete inside a per-tenant transaction that sets the RLS tenant
      // context, credentials before their activation attempts (same as the
      // migrated reference suites).
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
      try {
        await adminSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      } catch {
        // cleanup best effort
      }
      await adminSource.destroy();
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

  it('executes 90-day retention purge on real PostgreSQL while preserving invoices and recent records', async () => {
    const runner = adminSource.createQueryRunner();
    await runner.connect();
    await runner.query(`SET search_path TO "${schema}", public`);

    const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
    const recentDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

    const oldFulfillmentId = `f-old-${randomUUID()}`;
    const recentFulfillmentId = `f-recent-${randomUUID()}`;

    // Seed old & recent fulfillment records
    await runner.query(
      `INSERT INTO tenant_fulfillment_records (id, tenant_id, channel, route_state, delivery_state, created_at) VALUES 
       ($1, $2, 'PRINT_ONLY', 'PRINTED', 'PENDING', $3),
       ($4, $2, 'KDS_ONLY', 'ROUTED', 'PENDING', $5)`,
      [oldFulfillmentId, tenantAId, oldDate, recentFulfillmentId, recentDate],
    );

    const oldInvoiceId = `inv-old-${randomUUID()}`;
    await runner.query(
      `INSERT INTO invoices (id, tenant_id, number, user_id, subtotal, total_tax, total, created_at) VALUES 
       ($1, $2, 'FAC-00000001', $3, 100, 15, 115, $4)`,
      [oldInvoiceId, tenantAId, ownerAId, oldDate],
    );

    await runner.release();

    // Trigger Purge via HTTP Endpoint
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

    // Verify old invoice was strictly preserved in the database
    const verifyRunner = adminSource.createQueryRunner();
    await verifyRunner.connect();
    await verifyRunner.query(`SET search_path TO "${schema}", public`);
    const invCheck = (await verifyRunner.query(
      `SELECT id FROM invoices WHERE id = $1 AND tenant_id = $2`,
      [oldInvoiceId, tenantAId],
    )) as Array<{ id: string }>;
    expect(invCheck).toHaveLength(1);
    await verifyRunner.release();
  });
});
