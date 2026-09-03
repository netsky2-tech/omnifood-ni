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
import { signIdentityJwtAccessToken } from '../support/identity-jwt-test.fixture';
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

    const m1 = new BohInventoryLedgerFoundation1766000000000();
    const m2 = new AddDeterministicSyncSequencing1780000000000();
    const m3 = new CreateTenantFulfillmentRecords1795000000000();
    await m1.up(runner);
    await m2.up(runner);
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
          ],
          schema,
          synchronize: false,
        }),
        IdentityModule,
        InventoryModule,
        SalesModule,
        FulfillmentModule,
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
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (adminSource && adminSource.isInitialized) {
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

    // 1. Post sync batch
    const syncRes = await request(app.getHttpServer())
      .post('/api/v1/sync/batch')
      .set('Authorization', `Bearer ${ownerAToken}`)
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
