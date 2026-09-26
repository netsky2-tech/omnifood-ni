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
import { CreateTenantTopologyRevisions1794000000000 } from '../../src/migrations/1794000000000-CreateTenantTopologyRevisions';
import { AddTenantTopologyRevisionsRls1794000000001 } from '../../src/migrations/1794000000001-AddTenantTopologyRevisionsRls';
import { CreateTenantFulfillmentRecords1795000000000 } from '../../src/migrations/1795000000000-CreateTenantFulfillmentRecords';
import { IdentityModule } from '../../src/modules/identity/identity.module';
import { InventoryModule } from '../../src/modules/inventory/inventory.module';
import { SalesModule } from '../../src/modules/sales/sales.module';
import { FulfillmentModule } from '../../src/modules/fulfillment/fulfillment.module';
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
import { normalizeTenantSlug } from '../../src/modules/tenant/tenant-slug';
import {
  BackfillScanResult,
  RollbackStatus,
  ObservabilityDashboard,
} from '../../src/modules/fulfillment/services/fulfillment-rollout.service';

describe('FulfillmentRolloutPilot (e2e - Real PostgreSQL, Zero Mocks)', () => {
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
    schema = `e2e_rollout_${randomUUID().replace(/-/g, '')}`;

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
        tenant_id varchar(64) NOT NULL
      );
      CREATE TABLE IF NOT EXISTS invoice_items (
        id varchar(128) PRIMARY KEY,
        tenant_id varchar(64) NOT NULL,
        invoice_id varchar(128) NOT NULL
      );
    `);

    await new BohInventoryLedgerFoundation1766000000000().up(runner);
    await new AddDeterministicSyncSequencing1780000000000().up(runner);
    await new AddSaleInventoryOutcomeColumns1803000000000().up(runner);
    await new AddAcceptedAtToInventorySyncReceipts1805000000000().up(runner);
    await new CreateTenantTopologyRevisions1794000000000().up(runner);
    await new AddTenantTopologyRevisionsRls1794000000001().up(runner);
    await new CreateTenantFulfillmentRecords1795000000000().up(runner);

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

      CREATE TABLE IF NOT EXISTS products (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id varchar NOT NULL,
        warehouse_id varchar,
        is_perishable boolean DEFAULT false,
        name varchar NOT NULL,
        uom varchar NOT NULL,
        product_type varchar NOT NULL DEFAULT 'SIMPLE',
        category_code varchar,
        stock numeric(12,4) DEFAULT 0,
        "averageCost" numeric(12,2) DEFAULT 0,
        "sellPrice" numeric(12,2) DEFAULT 0,
        is_active boolean DEFAULT true,
        tax_rate numeric(5,4) NOT NULL DEFAULT 0.15,
        is_tax_exempt boolean NOT NULL DEFAULT false,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS insumos (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id varchar NOT NULL,
        warehouse_id varchar,
        is_perishable boolean DEFAULT false,
        name varchar NOT NULL,
        "consumptionUom" varchar NOT NULL,
        "purchaseUom" varchar NOT NULL,
        "conversionFactor" numeric(12,4) NOT NULL DEFAULT 1,
        stock numeric(14,4) NOT NULL DEFAULT 0,
        existencia_actual numeric(14,4) NOT NULL DEFAULT 0,
        costo_promedio_nio numeric(14,4) NOT NULL DEFAULT 0,
        "parLevel" numeric(14,4),
        min_stock numeric(14,4),
        max_stock numeric(14,4),
        negative_stock_policy varchar NOT NULL DEFAULT 'RESTRICT',
        is_active boolean DEFAULT true,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS recipes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id varchar NOT NULL,
        "productId" uuid NOT NULL,
        "ingredientId" uuid NOT NULL,
        "ingredientType" varchar NOT NULL DEFAULT 'INSUMO',
        quantity numeric(14,4) NOT NULL,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS uom_conversions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id varchar NOT NULL,
        insumo_id uuid NOT NULL,
        unit_name varchar NOT NULL,
        factor numeric(12,4) NOT NULL,
        is_default boolean DEFAULT false,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      );
    `);

    const tenantAName = `Tenant A Pilot ${randomUUID().substring(0, 8)}`;
    const tenantBName = `Tenant B Pilot ${randomUUID().substring(0, 8)}`;

    await ensurePublicAuthTables(runner);

    await ensurePublicDeviceSyncTables(runner);

    await runner.query(
      `INSERT INTO tenants (id, name, slug, created_at, updated_at) VALUES
       ($1, $3, $5, now(), now()),
       ($2, $4, $6, now(), now())
       ON CONFLICT (id) DO NOTHING`,
      [
        tenantAId,
        tenantBId,
        tenantAName,
        tenantBName,
        normalizeTenantSlug(tenantAName),
        normalizeTenantSlug(tenantBName),
      ],
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
    // the canonical device id every batch record below uses as sourceDeviceId
    // ('pos-1') and granted only the sync:push scope the batch route requires.
    // Tenant B never touches /v1/sync/* (human-auth endpoints only), so it
    // needs no device credential.
    provisionedDevices.push(
      await provisionDeviceSyncCredential(adminSource, {
        tenantId: tenantAId,
        deviceId: 'pos-1',
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
          // Every pooled connection must share the isolated-schema search_path
          // (same convention as the migrated sync-outbox-replay reference
          // suite): tables created by the migrations above live in the isolated
          // schema, while tenants/users and the device-sync tables provisioned
          // by the helper live in public. A DataSource-level `schema` option
          // would force the SyncTransportGuard's repository reads into the
          // isolated schema and miss the public rows.
          synchronize: false,
          autoLoadEntities: true,
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
            UomConversion,
            Product,
            Recipe,
            RecipeVersion,
            RecipeDetail,
            Supplier,
            Warehouse,
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
          extra: { options: `-c search_path=${schema},public` },
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
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    await app.init();

    jwtService = moduleFixture.get<JwtService>(JwtService);

    ownerAToken = signIdentityJwtAccessToken(jwtService, {
      sub: ownerAId,
      tenant_id: tenantAId,
      email: ownerAEmail,
      role: UserRole.OWNER,
      security_version: 1,
    });

    ownerBToken = signIdentityJwtAccessToken(jwtService, {
      sub: ownerBId,
      tenant_id: tenantBId,
      email: ownerBEmail,
      role: UserRole.OWNER,
      security_version: 1,
    });

    // Device tokens are minted from the SAME DEVICE_SYNC_JWT_CONFIG the
    // bootstrapped app runs with (read from the container, not duplicated).
    deviceAToken = signDeviceSyncAccessToken(app, provisionedDevices[0]);
  }, 60000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (adminSource && adminSource.isInitialized) {
      const runner = adminSource.createQueryRunner();
      await runner.connect();
      // Device sync rows live in public and device_sync_credentials is FORCE
      // RLS: delete inside a per-tenant transaction that sets the RLS tenant
      // context, credentials before their activation attempts (same as the
      // migrated sync-outbox-replay reference suite).
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
      await runner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await runner.release();
      await adminSource.destroy();
    }
  });

  it('runs complete rollout pilot journey: discrepancy scan, rollback gate toggle, 3-channel execution, replay idempotency, and dashboard telemetry', async () => {
    // 1. Seed products for Tenant A in real DB
    const runner = adminSource.createQueryRunner();
    await runner.connect();
    await runner.query(`SET search_path TO "${schema}", public`);

    const prodA1 = randomUUID();
    const prodA2 = randomUUID();
    await runner.query(
      `INSERT INTO products (id, tenant_id, name, uom, is_perishable, is_active) VALUES
       ($1, $2, 'Asado de Res', 'UND', true, true),
       ($3, $2, 'Refresco de Cacao', 'UND', false, true)`,
      [prodA1, tenantAId, prodA2],
    );
    await runner.release();

    // 2. Query Discrepancies as Tenant A
    const discRes = await request(app.getHttpServer())
      .get('/fulfillment/rollout/discrepancies')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .expect(200);

    const discBody = discRes.body as BackfillScanResult;
    expect(discBody.tenantId).toBe(tenantAId);
    expect(discBody.clean).toBe(false);
    expect(discBody.discrepancies).toHaveLength(1);
    expect(discBody.discrepancies[0].productId).toBe(prodA1);
    expect(discBody.discrepancies[0].type).toBe('MISSING_RECIPE_BOM');
    expect(discBody.unroutedProducts).toHaveLength(1);
    expect(discBody.unroutedProducts[0].productId).toBe(prodA2);
    expect(discBody.unroutedProducts[0].fallbackAction).toBe('DIRECT_HANDOFF');

    // Multi-tenant check: Tenant B sees clean catalog
    const discBRes = await request(app.getHttpServer())
      .get('/fulfillment/rollout/discrepancies')
      .set('Authorization', `Bearer ${ownerBToken}`)
      .expect(200);

    const discBBody = discBRes.body as BackfillScanResult;
    expect(discBBody.tenantId).toBe(tenantBId);
    expect(discBBody.clean).toBe(true);
    expect(discBBody.totalScanned).toBe(0);

    // 3. Rollback Gate Toggle
    // Check initial status
    const statusRes1 = await request(app.getHttpServer())
      .get('/fulfillment/rollout/rollback-status')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .expect(200);

    const statusBody1 = statusRes1.body as RollbackStatus;
    expect(statusBody1.enforcementEnabled).toBe(true);
    expect(statusBody1.isRolledBack).toBe(false);

    // Toggle rollback ON
    const toggleRes = await request(app.getHttpServer())
      .post('/fulfillment/rollout/rollback-toggle')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({
        rollback: true,
        reason: 'Kitchen POS connectivity outage',
        authorizedBy: 'ownerA@test.com',
      })
      .expect(200);

    const toggleBody = toggleRes.body as RollbackStatus;
    expect(toggleBody.enforcementEnabled).toBe(false);
    expect(toggleBody.isRolledBack).toBe(true);

    // Toggle rollback OFF
    const restoreRes = await request(app.getHttpServer())
      .post('/fulfillment/rollout/rollback-toggle')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({
        rollback: false,
        reason: 'Restoring normal operations',
        authorizedBy: 'ownerA@test.com',
      })
      .expect(200);

    const restoreBody = restoreRes.body as RollbackStatus;
    expect(restoreBody.enforcementEnabled).toBe(true);
    expect(restoreBody.isRolledBack).toBe(false);

    // 4. Sync Fulfillment Records Across 3 Channels: PRINT_ONLY, KDS_ONLY, KDS_AND_PRINT
    const fulId1 = randomUUID();
    const fulId2 = randomUUID();
    const fulId3 = randomUUID();

    const batchRecords: SyncBatchRecordDto[] = [
      {
        idempotencyKey: `outbox:${tenantAId}:ful-1`,
        sourceDeviceId: 'pos-1',
        sourceSequence: 1,
        flowType: 'fulfillment',
        documentType: 'FULFILLMENT',
        aggregateType: 'fulfillment',
        aggregateId: fulId1,
        eventId: randomUUID(),
        topologyRevision: 1,
        fulfillment: {
          id: fulId1,
          saleId: randomUUID(),
          topologySnapshotId: randomUUID(),
          topologyRevision: 1,
          channel: 'PRINT_ONLY',
          routeState: 'PRINTED',
          deliveryState: 'PENDING',
          lines: [{ productName: 'Refresco', action: 'DIRECT_HANDOFF' }],
        },
      },
      {
        idempotencyKey: `outbox:${tenantAId}:ful-2`,
        sourceDeviceId: 'pos-1',
        sourceSequence: 2,
        flowType: 'fulfillment',
        documentType: 'FULFILLMENT',
        aggregateType: 'fulfillment',
        aggregateId: fulId2,
        eventId: randomUUID(),
        topologyRevision: 1,
        fulfillment: {
          id: fulId2,
          saleId: randomUUID(),
          topologySnapshotId: randomUUID(),
          topologyRevision: 1,
          channel: 'KDS_ONLY',
          routeState: 'ROUTED',
          deliveryState: 'PENDING',
          lines: [{ productName: 'Hamburguesa', action: 'PREPARE' }],
        },
      },
      {
        idempotencyKey: `outbox:${tenantAId}:ful-3`,
        sourceDeviceId: 'pos-1',
        sourceSequence: 3,
        flowType: 'fulfillment',
        documentType: 'FULFILLMENT',
        aggregateType: 'fulfillment',
        aggregateId: fulId3,
        eventId: randomUUID(),
        topologyRevision: 1,
        fulfillment: {
          id: fulId3,
          saleId: randomUUID(),
          topologySnapshotId: randomUUID(),
          topologyRevision: 1,
          channel: 'KDS_AND_PRINT',
          routeState: 'PRINTED',
          deliveryState: 'DELIVERED',
          lines: [{ productName: 'Plato Mixto', action: 'PREPARE' }],
        },
      },
    ];

    const syncRes = await request(app.getHttpServer())
      .post('/v1/sync/batch')
      .set('Authorization', `Bearer ${deviceAToken}`)
      .send({ records: batchRecords })
      .expect(201);

    const syncBody = syncRes.body as {
      results: Array<{ status: string; code?: string }>;
    };
    expect(syncBody.results).toHaveLength(3);
    expect(
      syncBody.results.every(
        (r) => r.status === 'ACCEPTED' && r.code === 'APPLIED',
      ),
    ).toBe(true);

    // 5. Verify Replay Idempotency
    const replayRes = await request(app.getHttpServer())
      .post('/v1/sync/batch')
      .set('Authorization', `Bearer ${deviceAToken}`)
      .send({ records: batchRecords })
      .expect(201);

    const replayBody = replayRes.body as {
      results: Array<{ status: string; code?: string }>;
    };
    expect(replayBody.results).toHaveLength(3);
    expect(replayBody.results.every((r) => r.status === 'DUPLICATE')).toBe(
      true,
    );

    // 6. Query GET /fulfillment/records/:id for verified state
    const record1Res = await request(app.getHttpServer())
      .get(`/fulfillment/records/${fulId1}`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .expect(200);

    const record1Body = record1Res.body as TenantFulfillmentRecord;
    expect(record1Body.channel).toBe('PRINT_ONLY');
    expect(record1Body.route_state).toBe('PRINTED');
    expect(record1Body.delivery_state).toBe('PENDING');

    // 7. Query Dashboard Telemetry
    const dashRes = await request(app.getHttpServer())
      .get('/fulfillment/rollout/dashboard')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .expect(200);

    const dashBody = dashRes.body as ObservabilityDashboard;
    expect(dashBody.tenantId).toBe(tenantAId);
    expect(dashBody.totalFulfillments).toBe(3);
    expect(dashBody.channelsBreakdown).toEqual({
      PRINT_ONLY: 1,
      KDS_ONLY: 1,
      KDS_AND_PRINT: 1,
    });
    expect(dashBody.enforcementStatus).toBe('ACTIVE');
  });
});
