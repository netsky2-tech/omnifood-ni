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
import { signIdentityJwtAccessToken } from '../support/identity-jwt-test.fixture';
import { ensurePublicAuthTables } from '../support/fulfillment-test-db.helper';
import { SyncBatchRecordDto } from '../../src/modules/sales/dto/sync-batch.dto';

describe('SyncOutboxReplay (e2e - Real PostgreSQL, No Mocks)', () => {
  let app: INestApplication<App>;
  let adminSource: DataSource;
  let jwtService: JwtService;
  let schema: string;

  const tenantAId = randomUUID();
  const tenantBId = randomUUID();
  const cashierAId = randomUUID();
  const cashierBId = randomUUID();

  let cashierAToken: string;
  let cashierBToken: string;

  const postgresConnection = {
    type: 'postgres' as const,
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? '5432'),
    username: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_DATABASE ?? 'omnifood',
  };

  const buildFulfillmentRecord = (
    sequence: number,
    overrides: Partial<SyncBatchRecordDto> = {},
  ): SyncBatchRecordDto => ({
    idempotencyKey: `outbox:terminal-1:fulfillment-${sequence}`,
    sourceDeviceId: 'terminal-1',
    sourceSequence: sequence,
    flowType: 'fulfillment',
    documentType: 'FULFILLMENT',
    aggregateType: 'fulfillment',
    aggregateId: `fulfillment-sale-${sequence}`,
    eventId: `event:fulfillment-sale-${sequence}`,
    topologyRevision: 1,
    fulfillment: {
      id: `fulfillment-sale-${sequence}`,
      saleId: `sale-${sequence}`,
      channel: 'PRINT_ONLY',
      routeState: 'ROUTED',
      deliveryState: 'PENDING',
      topologySnapshotId: 'snap-1',
      topologyRevision: 1,
      linesPayload: JSON.stringify([
        { lineId: `line-${sequence}`, productId: 'prod-1', quantity: 1 },
      ]),
    },
    ...overrides,
  });

  beforeAll(async () => {
    schema = `e2e_outbox_${randomUUID().replace(/-/g, '')}`;

    adminSource = new DataSource({
      ...postgresConnection,
    });
    await adminSource.initialize();
    const runner = adminSource.createQueryRunner();
    await runner.connect();

    // Create isolated schema
    await runner.query(`CREATE SCHEMA "${schema}"`);
    await runner.query(`SET search_path TO "${schema}", public`);

    // Run migrations inside isolated schema
    const m1 = new BohInventoryLedgerFoundation1766000000000();
    const m2 = new AddDeterministicSyncSequencing1780000000000();
    await m1.up(runner);
    await m2.up(runner);

    await ensurePublicAuthTables(runner);

    // Seed tenants and users in public tables for auth & AuthoritativeCurrentUserGuard
    await runner.query(
      `INSERT INTO tenants (id, name, created_at, updated_at) VALUES
       ($1, 'Tenant A', now(), now()),
       ($2, 'Tenant B', now(), now())
       ON CONFLICT (id) DO NOTHING`,
      [tenantAId, tenantBId],
    );

    const cashierAEmail = `cashier.a.${randomUUID()}@test.com`;
    const cashierBEmail = `cashier.b.${randomUUID()}@test.com`;

    await runner.query(
      `INSERT INTO users (id, tenant_id, name, email, role, is_active, security_version, created_at, updated_at) VALUES
       ($1, $2, 'Cashier A', $5, 'CASHIER', true, 1, now(), now()),
       ($3, $4, 'Cashier B', $6, 'CASHIER', true, 1, now(), now())
       ON CONFLICT (id) DO NOTHING`,
      [
        cashierAId,
        tenantAId,
        cashierBId,
        tenantBId,
        cashierAEmail,
        cashierBEmail,
      ],
    );

    await runner.release();

    // Bootstrap Nest testing module with real DB (NO MOCKS)
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
          ],
          synchronize: false,
          extra: { options: `-c search_path=${schema},public` },
        }),
        IdentityModule,
        InventoryModule,
        SalesModule,
      ],
    }).compile();

    jwtService = moduleFixture.get<JwtService>(JwtService);

    cashierAToken = signIdentityJwtAccessToken(jwtService, {
      sub: cashierAId,
      email: 'cashier.a@test.com',
      tenant_id: tenantAId,
      role: UserRole.CASHIER,
      security_version: 1,
    });

    cashierBToken = signIdentityJwtAccessToken(jwtService, {
      sub: cashierBId,
      email: 'cashier.b@test.com',
      tenant_id: tenantBId,
      role: UserRole.CASHIER,
      security_version: 1,
    });

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  }, 45000);

  afterAll(async () => {
    try {
      if (app) await app.close();
      if (adminSource && adminSource.isInitialized) {
        const runner = adminSource.createQueryRunner();
        await runner.connect();
        await runner.query(`DELETE FROM users WHERE id IN ($1, $2)`, [
          cashierAId,
          cashierBId,
        ]);
        await runner.query(`DELETE FROM tenants WHERE id IN ($1, $2)`, [
          tenantAId,
          tenantBId,
        ]);
        await runner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await runner.release();
        await adminSource.destroy();
      }
    } catch {
      // cleanup best effort
    }
  }, 30000);

  describe('POST /api/v1/sync/batch', () => {
    it('rejects unauthenticated requests with 401 Unauthorized', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/sync/batch')
        .send({ records: [buildFulfillmentRecord(1)] })
        .expect(401);
    });

    it('processes in-order fulfillment outbox batch and records receipts with HTTP 201/200', async () => {
      const records = [buildFulfillmentRecord(1), buildFulfillmentRecord(2)];

      const response = await request(app.getHttpServer())
        .post('/api/v1/sync/batch')
        .set('Authorization', `Bearer ${cashierAToken}`)
        .send({ records })
        .expect((res) => {
          expect([200, 201]).toContain(res.status);
        });

      expect(response.body).toMatchObject({
        status: 'success',
        received: 2,
        processed: 2,
        duplicates: 0,
        results: [
          expect.objectContaining({
            idempotencyKey: records[0].idempotencyKey,
            status: 'ACCEPTED',
            code: 'APPLIED',
          }),
          expect.objectContaining({
            idempotencyKey: records[1].idempotencyKey,
            status: 'ACCEPTED',
            code: 'APPLIED',
          }),
        ],
      });
    });

    it('acknowledges immediate duplicate reconnect replay safely with duplicates: 2 and zero new effects', async () => {
      const records = [buildFulfillmentRecord(1), buildFulfillmentRecord(2)];

      // Replay the exact same records sent in the previous test (simulating network dropout reconnect)
      const response = await request(app.getHttpServer())
        .post('/api/v1/sync/batch')
        .set('Authorization', `Bearer ${cashierAToken}`)
        .send({ records })
        .expect((res) => {
          expect([200, 201]).toContain(res.status);
        });

      expect(response.body).toMatchObject({
        status: 'success',
        received: 2,
        processed: 0,
        duplicates: 2,
        results: [
          expect.objectContaining({
            idempotencyKey: records[0].idempotencyKey,
            status: 'DUPLICATE',
            code: 'DUPLICATE_REPLAY',
            retryable: false,
          }),
          expect.objectContaining({
            idempotencyKey: records[1].idempotencyKey,
            status: 'DUPLICATE',
            code: 'DUPLICATE_REPLAY',
            retryable: false,
          }),
        ],
      });
    });

    it('acknowledges duplicate sequence replay with matching payload hash as DUPLICATE_SEQUENCE_REPLAY', async () => {
      const seqRecord = buildFulfillmentRecord(1, {
        idempotencyKey: 'outbox:terminal-1:alternate-key-seq-1',
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/sync/batch')
        .set('Authorization', `Bearer ${cashierAToken}`)
        .send({ records: [seqRecord] })
        .expect((res) => {
          expect([200, 201]).toContain(res.status);
        });

      expect(response.body).toMatchObject({
        status: 'success',
        received: 1,
        processed: 0,
        duplicates: 1,
        results: [
          expect.objectContaining({
            idempotencyKey: 'outbox:terminal-1:alternate-key-seq-1',
            status: 'DUPLICATE',
            code: 'DUPLICATE_SEQUENCE_REPLAY',
            retryable: false,
          }),
        ],
      });
    });

    it('detects payload tampering on reconnect replay and returns IDEMPOTENCY_MISMATCH', async () => {
      const tamperedRecord = buildFulfillmentRecord(1, {
        fulfillment: {
          id: 'fulfillment-sale-1',
          channel: 'KDS_ONLY', // altered channel
          routeState: 'ROUTED',
        },
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/sync/batch')
        .set('Authorization', `Bearer ${cashierAToken}`)
        .send({ records: [tamperedRecord] })
        .expect((res) => {
          expect([200, 201]).toContain(res.status);
        });

      expect(response.body).toMatchObject({
        status: 'success',
        received: 1,
        processed: 0,
        duplicates: 0,
        results: [
          expect.objectContaining({
            idempotencyKey: tamperedRecord.idempotencyKey,
            status: 'IDEMPOTENCY_MISMATCH',
            code: 'CRITICAL_PAYLOAD_MISMATCH',
            retryable: false,
          }),
        ],
      });
    });

    it('stages out-of-order sequence 4, acknowledges duplicate stage replay safely, and drains on sequence 3 arrival', async () => {
      const record4 = buildFulfillmentRecord(4);
      const record3 = buildFulfillmentRecord(3);

      // Sequence 4 sent ahead of sequence 3 -> STAGED_FUTURE
      const res4 = await request(app.getHttpServer())
        .post('/api/v1/sync/batch')
        .set('Authorization', `Bearer ${cashierAToken}`)
        .send({ records: [record4] })
        .expect((res) => {
          expect([200, 201]).toContain(res.status);
        });

      expect(res4.body).toMatchObject({
        status: 'success',
        received: 1,
        processed: 0,
        duplicates: 0,
        results: [
          expect.objectContaining({
            idempotencyKey: record4.idempotencyKey,
            status: 'STAGED_FUTURE',
            code: 'WAITING_FOR_SEQUENCE_3',
            retryable: true,
          }),
        ],
      });

      // Duplicate replay of sequence 4 while staged -> must be safely acknowledged without error
      const res4Replay = await request(app.getHttpServer())
        .post('/api/v1/sync/batch')
        .set('Authorization', `Bearer ${cashierAToken}`)
        .send({ records: [record4] })
        .expect((res) => {
          expect([200, 201]).toContain(res.status);
        });

      expect(res4Replay.body).toMatchObject({
        status: 'success',
        received: 1,
        processed: 0,
        results: [
          expect.objectContaining({
            idempotencyKey: record4.idempotencyKey,
            status: 'STAGED_FUTURE',
            retryable: true,
          }),
        ],
      });

      // Sequence 3 arrives -> applies 3 and automatically drains 4
      const res3 = await request(app.getHttpServer())
        .post('/api/v1/sync/batch')
        .set('Authorization', `Bearer ${cashierAToken}`)
        .send({ records: [record3] })
        .expect((res) => {
          expect([200, 201]).toContain(res.status);
        });

      expect(res3.body).toMatchObject({
        status: 'success',
        received: 1,
        processed: 2, // 3 applied + 4 drained
        duplicates: 0,
        results: [
          expect.objectContaining({
            idempotencyKey: record3.idempotencyKey,
            status: 'ACCEPTED',
            code: 'APPLIED',
          }),
          expect.objectContaining({
            idempotencyKey: record4.idempotencyKey,
            status: 'ACCEPTED',
            code: 'APPLIED',
          }),
        ],
      });
    });

    it('enforces multi-tenant isolation: Tenant B starts at sequence 1 without interference from Tenant A', async () => {
      // Tenant B sends sequence 1 from the same deviceId 'terminal-1'
      const tenantBRecord = buildFulfillmentRecord(1, {
        idempotencyKey: 'outbox:tenant-b:terminal-1:fulfillment-1',
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/sync/batch')
        .set('Authorization', `Bearer ${cashierBToken}`)
        .send({ records: [tenantBRecord] })
        .expect((res) => {
          expect([200, 201]).toContain(res.status);
        });

      expect(response.body).toMatchObject({
        status: 'success',
        received: 1,
        processed: 1,
        duplicates: 0,
        results: [
          expect.objectContaining({
            idempotencyKey: tenantBRecord.idempotencyKey,
            status: 'ACCEPTED',
            code: 'APPLIED',
          }),
        ],
      });
    });
  });
});
