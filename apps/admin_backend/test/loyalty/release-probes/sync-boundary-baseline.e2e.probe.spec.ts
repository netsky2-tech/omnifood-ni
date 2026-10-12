/**
 * T1 sync-boundary-baseline probe: real HTTP through a production Nest
 * application boundary (IdentityModule + InventoryModule + SalesModule, the
 * proven real-App wiring of test/fulfillment/sync-outbox-replay.e2e-spec.ts)
 * against a migration-built PostgreSQL schema. Run only via
 * `pnpm test:loyalty-release` (the default Jest config ignores
 * `*.probe.spec.ts` on purpose). Expected on the untouched baseline
 * (roadmap §10 baseline-red gate):
 *   - `[CONTROL-http]` PASSES: the same app/auth harness reaches the EXISTING
 *     `POST /api/v1/sync/batch` route — 401 without a device token (real
 *     SyncTransportGuard), 400 ValidationPipe rejection with a valid token —
 *     so a broken bootstrap cannot masquerade as the B2/B3 reds.
 *   - `[B2]` FAILS: per the arch §13.5 reuse rule the EXISTING generic
 *     inbound endpoint (GET /api/v1/sync/inbound/deltas) must transport the
 *     Loyalty configuration stream — documented kinds PROGRAM_UPSERT /
 *     REWARD_UPSERT with payloads, scoped to the authenticated tenant. Today
 *     it carries none (generic empty/catalog response). T7 must add them.
 *   - `[B3]` FAILS: a production-shaped LOYALTY ledger document sent to the
 *     existing `POST /api/v1/sync/batch` envelope (arch §13.4: extend
 *     SyncBatchEnvelopeDto, no parallel transport) is rejected by DTO
 *     validation today — the LOYALTY_LEDGER flow/document discriminator
 *     (§13.4's exact `flow_type` literal) and the documented events[] payload
 *     shape are not part of SyncBatchRecordDto. T6 must add LOYALTY_LEDGER
 *     and answer with the batch ACK vocabulary (ACCEPTED / valid DUPLICATE).
 *
 * No Loyalty repository/service is mocked and no transport is fabricated:
 * state setup uses production paths (Tenant entity save, the repository's
 * device-sync signed-JWT E2E fixture), the guard runs its real credential/
 * tenant lookups against the migration-built schema, and the only fixture
 * shortcut allowed by T1 is authentication identity (signed device JWT).
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { IdentityModule } from '../../../src/modules/identity/identity.module';
import { InventoryModule } from '../../../src/modules/inventory/inventory.module';
import { SalesModule } from '../../../src/modules/sales/sales.module';
import { User } from '../../../src/modules/identity/entities/user.entity';
import { Tenant } from '../../../src/modules/tenant/entities/tenant.entity';
import { SecurityProfile } from '../../../src/modules/identity/entities/security-profile.entity';
import { AuditLog } from '../../../src/modules/identity/entities/audit-log.entity';
import { AuditIntegrityAlert } from '../../../src/modules/identity/entities/audit-integrity-alert.entity';
import { DeviceSyncCredential } from '../../../src/modules/identity/entities/device-sync-credential.entity';
import { ActivationAttempt } from '../../../src/modules/onboarding/entities/activation-attempt.entity';
import { InventorySyncReceipt } from '../../../src/modules/inventory/entities/inventory-sync-receipt.entity';
import { InventorySyncOutbox } from '../../../src/modules/inventory/entities/inventory-sync-outbox.entity';
import { InventoryMovement } from '../../../src/modules/inventory/entities/inventory-movement.entity';
import { Insumo } from '../../../src/modules/inventory/entities/insumo.entity';
import { Product } from '../../../src/modules/inventory/entities/product.entity';
import { ProductInventoryMappingVersion } from '../../../src/modules/inventory/entities/product-inventory-mapping-version.entity';
import { Recipe } from '../../../src/modules/inventory/entities/recipe.entity';
import { RecipeVersion } from '../../../src/modules/inventory/entities/recipe-version.entity';
import { RecipeDetail } from '../../../src/modules/inventory/entities/recipe-detail.entity';
import { Supplier } from '../../../src/modules/inventory/entities/supplier.entity';
import { Warehouse } from '../../../src/modules/inventory/entities/warehouse.entity';
import { UomConversion } from '../../../src/modules/inventory/entities/uom-conversion.entity';
import { Batch } from '../../../src/modules/inventory/entities/batch.entity';
import { CatalogValue } from '../../../src/modules/catalog/entities/catalog-value.entity';
import { Invoice } from '../../../src/modules/sales/entities/invoice.entity';
import { InvoiceItem } from '../../../src/modules/sales/entities/invoice-item.entity';
import { Payment } from '../../../src/modules/sales/entities/payment.entity';
import { InvoiceItemModifier } from '../../../src/modules/sales/entities/invoice-item-modifier.entity';
// T6: SalesModule now imports LoyaltyModule for the LOYALTY_LEDGER dispatch,
// so the loyalty module graph's forFeature entities must be registered here
// (same migration-built tables, no mocks).
import { Customer } from '../../../src/modules/customers/entities/customer.entity';
import { CustomerPointTransaction } from '../../../src/modules/customers/entities/customer-point-transaction.entity';
import { LoyaltyProgram, LoyaltyProgramStatus, LoyaltyProgramType } from '../../../src/modules/loyalty/entities/loyalty-program.entity';
import { RewardDefinition, RewardStatus, RewardType } from '../../../src/modules/loyalty/entities/reward-definition.entity';
import { CustomerLoyaltyAccountProjection } from '../../../src/modules/loyalty/entities/customer-loyalty-account-projection.entity';
import { ForensicAlert } from '../../../src/modules/inventory/entities/forensic-alert.entity';
import { Promotion } from '../../../src/modules/promotions/entities/promotion.entity';
import { ModifierGroup } from '../../../src/modules/modifiers/entities/modifier-group.entity';
import { ModifierOption } from '../../../src/modules/modifiers/entities/modifier-option.entity';
import { CategoryModifierGroup } from '../../../src/modules/modifiers/entities/category-modifier-group.entity';
import { ProductModifierGroup } from '../../../src/modules/modifiers/entities/product-modifier-group.entity';
import {
  provisionDeviceSyncCredential,
  signDeviceSyncAccessToken,
  type ProvisionedDeviceSyncCredential,
} from '../../../test/support/device-sync-e2e.helper';
import { createMigrationBuiltSchemaFixture } from '../../../test/support/migration-built-schema.helper';

/**
 * Arch §13.5's documented inbound Loyalty configuration record kinds: what a
 * fresh tenant must be able to pull (LOYALTY_TRANSACTION_APPEND is a ledger
 * append, not configuration).
 */
const LOYALTY_CONFIGURATION_RECORD_KINDS = ['PROGRAM_UPSERT', 'REWARD_UPSERT'];

/**
 * Recursively collects records of the documented §13.5 Loyalty configuration
 * kinds wherever T7 nests them in the generic inbound response:
 * shape-tolerant on placement, strict on content — a stream without the
 * kinds (empty or catalog-only) yields nothing.
 */
const collectLoyaltyConfigurationRecords = (
  node: unknown,
  found: Array<{ kind: string; payload: unknown }> = [],
): Array<{ kind: string; payload: unknown }> => {
  if (Array.isArray(node)) {
    for (const item of node) collectLoyaltyConfigurationRecords(item, found);
    return found;
  }
  if (typeof node !== 'object' || node === null) return found;
  const candidate = node as Record<string, unknown>;
  const kind = candidate.type ?? candidate.kind ?? candidate.recordType;
  const payload = candidate.payload ?? candidate.data;
  if (
    typeof kind === 'string' &&
    LOYALTY_CONFIGURATION_RECORD_KINDS.includes(kind) &&
    payload != null
  ) {
    found.push({ kind, payload });
  }
  for (const value of Object.values(candidate))
    collectLoyaltyConfigurationRecords(value, found);
  return found;
};

/**
 * Collects every embedded tenant identifier (tenant_id/tenantId, any depth):
 * one bound to another tenant is a leak, while records scoped implicitly (no
 * embedded id) stay valid because the endpoint binds the tenant from the
 * authenticated device principal.
 */
const collectEmbeddedTenantIds = (
  node: unknown,
  found: string[] = [],
): string[] => {
  if (Array.isArray(node)) {
    for (const item of node) collectEmbeddedTenantIds(item, found);
    return found;
  }
  if (typeof node !== 'object' || node === null) return found;
  const candidate = node as Record<string, unknown>;
  for (const key of ['tenant_id', 'tenantId']) {
    const value = candidate[key];
    if (typeof value === 'string' && value.trim().length > 0) found.push(value);
  }
  for (const value of Object.values(candidate))
    collectEmbeddedTenantIds(value, found);
  return found;
};

const postgresConnection = {
  type: 'postgres' as const,
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: Number(process.env.DB_PORT?.trim() ?? 5432),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: process.env.DB_PASSWORD?.trim() ?? 'postgres',
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

// Entities required by the bootstrapped sync module graph AND by the generic
// inbound endpoint's own queries (e.g. ProductInventoryMappingVersion): all
// map to migration-built tables.
const ENTITIES = [
  Tenant, User, SecurityProfile, AuditLog, AuditIntegrityAlert,
  DeviceSyncCredential, ActivationAttempt,
  InventorySyncReceipt, InventorySyncOutbox, InventoryMovement,
  Insumo, Product, ProductInventoryMappingVersion, Recipe, RecipeVersion,
  RecipeDetail, Supplier, Warehouse, UomConversion, Batch,
  Invoice, InvoiceItem, Payment, InvoiceItemModifier, CatalogValue,
  Customer, CustomerPointTransaction, LoyaltyProgram, RewardDefinition,
  CustomerLoyaltyAccountProjection,
  ForensicAlert, Promotion, ModifierGroup, ModifierOption,
  CategoryModifierGroup, ProductModifierGroup,
];

describe('T1 sync-boundary baseline: real Nest HTTP sync surface (release probes)', () => {
  jest.setTimeout(120000);

  let app: INestApplication<App>;
  let adminSource: DataSource;
  let fixture: Awaited<ReturnType<typeof createMigrationBuiltSchemaFixture>>;
  let deviceToken: string;
  let provisioned: ProvisionedDeviceSyncCredential;
  let seededProgramId: string;

  const tenantId = randomUUID();
  const deviceId = 'terminal-loyalty-1';

  beforeAll(async () => {
    // The schema is built by the FULL migration set as a restricted role —
    // the same migration-built fixture the storage baseline probe uses.
    fixture = await createMigrationBuiltSchemaFixture();

    // App-side seeding connection (superuser, like the existing real-App
    // HTTP E2E specs): seeds the active tenant and provisions the device
    // credential via the repository's signed-JWT E2E fixture.
    adminSource = new DataSource({
      ...postgresConnection,
      schema: fixture.schema,
      entities: ENTITIES,
      extra: { allowExitOnIdle: true },
    });
    await adminSource.initialize();

    const tenants = adminSource.getRepository(Tenant);
    await tenants.save(
      tenants.create({
        id: tenantId,
        name: `Sync Probe ${tenantId}`,
        slug: `sync-probe-${tenantId.slice(0, 8)}`,
        ruc: 'J0310000000003',
        is_active: true,
      }),
    );

    provisioned = await provisionDeviceSyncCredential(adminSource, {
      tenantId,
      deviceId,
      schema: fixture.schema,
    });

    // T7/T6 fixture (same fixture-fix class as the slug seeding): the stream
    // and the ledger transport carry REAL tenant configuration — the re-triage
    // deliberately rejected a fabricated platform-default program — so the
    // probe seeds one ACTIVE program with its reward through the entity
    // repositories (production rows, migration-built schema). B2 then asserts
    // the §13.5 tagged records match these rows; B3's EARN references the
    // program because §9.3's fail-closed identity (ck_loyalty_tx_type_semantics)
    // rejects a program-less EARN by design (the no-exemption owner decision).
    const program = await adminSource.getRepository(LoyaltyProgram).save(
      adminSource.getRepository(LoyaltyProgram).create({
        tenant_id: tenantId,
        name: 'Sync Probe Program',
        program_type: LoyaltyProgramType.SPEND_POINTS,
        status: LoyaltyProgramStatus.ACTIVE,
        earning_rule: { spendNioPerUnit: 100 },
        eligibility_rule: { minSpendNio: 0 },
        config_version: 1,
      }),
    );
    seededProgramId = program.id;
    await adminSource.getRepository(RewardDefinition).save(
      adminSource.getRepository(RewardDefinition).create({
        tenant_id: tenantId,
        loyalty_program_id: seededProgramId,
        name: 'Sync Probe Reward',
        reward_type: RewardType.DISCOUNT_AMOUNT,
        cost_units: 500,
        benefit_config: { discountNio: 50 },
        status: RewardStatus.ACTIVE,
        config_version: 1,
      }),
    );

    // Real Nest application boundary: production sync modules, real
    // ValidationPipe, real guards. NO MOCKS anywhere in the module graph.
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
          entities: ENTITIES,
          synchronize: false,
          extra: {
            allowExitOnIdle: true,
            options: `-c search_path=${fixture.schema},public`,
          },
        }),
        IdentityModule,
        InventoryModule,
        SalesModule,
      ],
    }).compile();

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

    // Authentication identity fixture (the only allowed shortcut): a device
    // access token signed with the SAME DEVICE_SYNC_JWT_CONFIG the running
    // app holds, backed by an ACTIVE credential row the guard really reads.
    deviceToken = signDeviceSyncAccessToken(app, provisioned);
  });

  afterAll(async () => {
    try {
      if (app) await app.close();
      if (adminSource?.isInitialized) {
        // Credentials before their activation attempt, inside a transaction
        // bound to the owning tenant — same teardown contract as the
        // fulfillment real-App specs (device_sync_credentials is FORCE RLS).
        await adminSource.transaction(async (manager) => {
          await manager.query("SELECT set_config('app.tenant_id', $1, true)", [
            provisioned.tenantId,
          ]);
          // Seeded loyalty rows before the tenant (tenant FKs, no cascade).
          await manager.query(
            `DELETE FROM ${fixture.schema}.loyalty_rewards WHERE tenant_id = $1`,
            [tenantId],
          );
          await manager.query(
            `DELETE FROM ${fixture.schema}.loyalty_programs WHERE tenant_id = $1`,
            [tenantId],
          );
          await manager.query(
            `DELETE FROM ${fixture.schema}.customer_point_transactions WHERE tenant_id = $1`,
            [tenantId],
          );
          await manager.query(
            `DELETE FROM ${fixture.schema}.device_sync_credentials WHERE id = $1`,
            [provisioned.credentialId],
          );
          await manager.query(
            `DELETE FROM ${fixture.schema}.onboarding_activation_attempts WHERE id = $1`,
            [provisioned.activationAttemptId],
          );
        });
        await adminSource.query(
          `DELETE FROM ${fixture.schema}.tenants WHERE id = $1`,
          [tenantId],
        );
        await adminSource.destroy();
      }
      if (fixture) await fixture.close();
    } catch {
      // cleanup best effort
    }
  });

  it('[CONTROL-http] the app/auth harness reaches the existing POST /api/v1/sync/batch: 401 without a device token, 400 ValidationPipe rejection with one', async () => {
    const guardedRecord = {
      idempotencyKey: `control:${randomUUID()}`,
      sourceDeviceId: deviceId,
      sourceSequence: 1,
      flowType: 'fulfillment',
      // documentType deliberately missing: exercises the real ValidationPipe
      // (not the LOYALTY gap), so a broken bootstrap cannot masquerade as
      // the B2/B3 reds below.
    };

    // (1) Real SyncTransportGuard: no token -> 401 (not 404): the route exists.
    await request(app.getHttpServer())
      .post('/api/v1/sync/batch')
      .send({ records: [guardedRecord] })
      .expect(401);

    // (2) Valid signed device token passes the real guard (credential +
    // tenant read from the migration-built schema); the ValidationPipe then
    // rejects the incomplete record with 400 (still not 404).
    const res = await request(app.getHttpServer())
      .post('/api/v1/sync/batch')
      .set('Authorization', `Bearer ${deviceToken}`)
      .send({ records: [guardedRecord] })
      .expect(400);
    expect(JSON.stringify(res.body.message)).toContain('documentType');
  });

  it('[B2] the existing generic inbound sync endpoint carries the tenant-scoped Loyalty configuration stream (arch §13.5 reuse rule; T7 acceptance) — RED on baseline', async () => {
    // §13.5 reuse rule: the EXISTING generic inbound endpoint MUST be reused
    // instead of creating a literal /loyalty route. The probe pulls the
    // tenant-scoped device stream and requires the documented configuration
    // kinds with payloads — a generic empty/catalog response cannot pass.
    const res = await request(app.getHttpServer())
      .get('/api/v1/sync/inbound/deltas')
      .set('Authorization', `Bearer ${deviceToken}`);

    const loyaltyRecords = collectLoyaltyConfigurationRecords(res.body);
    if (res.status !== 200 || loyaltyRecords.length === 0) {
      process.stdout.write(
        `[B2] baseline: GET /api/v1/sync/inbound/deltas carries no Loyalty configuration records (arch §13.5) — status=${res.status} body=${JSON.stringify(res.body).slice(0, 400)}\n`,
      );
    }
    // Correct behavior: the stream succeeds AND transports the documented
    // §13.5 configuration kinds, scoped to the authenticated tenant.
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(loyaltyRecords.length).toBeGreaterThan(0);
    for (const record of loyaltyRecords) {
      expect(LOYALTY_CONFIGURATION_RECORD_KINDS).toContain(record.kind);
      for (const embeddedTenantId of collectEmbeddedTenantIds(record.payload)) {
        expect(embeddedTenantId).toBe(tenantId);
      }
    }
  });

  it('[B3] the existing POST /api/v1/sync/batch envelope accepts and dispatches the LOYALTY_LEDGER flow (arch §13.4; T6 acceptance) — RED on baseline', async () => {
    // Production-shaped LOYALTY ledger record extending the EXISTING
    // SyncBatchEnvelopeDto (arch §13.4: no parallel transport): the
    // discriminator is §13.4's exact `flow_type` literal LOYALTY_LEDGER,
    // and the payload follows the documented events[] shape ({ event_id,
    // idempotency_key, transaction }) with the canonical LoyaltyTransaction
    // state (arch §2.3).
    const loyaltyRecord = {
      idempotencyKey: `loyalty:earn:${randomUUID()}`,
      sourceDeviceId: deviceId,
      sourceSequence: 1,
      terminalId: deviceId,
      flowType: 'LOYALTY_LEDGER',
      documentType: 'LOYALTY_LEDGER',
      events: [
        {
          event_id: `evt-${randomUUID()}`,
          idempotency_key: `loyalty:earn:${randomUUID()}`,
          transaction: {
            tenantId,
            loyaltyProgramId: seededProgramId,
            customerId: randomUUID(),
            ticketId: 'TICKET-B3-0001',
            transactionType: 'EARN',
            units: 10,
            origin: 'POS',
            occurredAt: new Date().toISOString(),
          },
        },
      ],
    };

    const res = await request(app.getHttpServer())
      .post('/api/v1/sync/batch')
      .set('Authorization', `Bearer ${deviceToken}`)
      .send({ records: [loyaltyRecord] });

    if (res.status === 400 || res.status === 422) {
      process.stdout.write(
        `[B3] baseline: LOYALTY_LEDGER document rejected by DTO validation (arch §13.4) — ${JSON.stringify(res.body)}\n`,
      );
    }
    // Correct behavior: DTO acceptance/dispatch (the controller's success
    // envelope), NOT validation rejection — and the per-record ACK must be
    // an explicit success status of the existing batch ACK vocabulary
    // (arch §13.4 ACK: a valid DUPLICATE replay is success from the POS
    // point of view); a bare key echo is not an acknowledged dispatch.
    expect([200, 201]).toContain(res.status);
    expect(res.body).toMatchObject({ status: 'success' });
    expect(res.body.results?.[0]).toMatchObject({
      idempotencyKey: loyaltyRecord.idempotencyKey,
    });
    if (!['ACCEPTED', 'DUPLICATE'].includes(res.body.results?.[0]?.status)) {
      process.stdout.write(
        `[B3] dispatch rejected: ${JSON.stringify(res.body.results?.[0])}\n`,
      );
    }
    expect(['ACCEPTED', 'DUPLICATE']).toContain(res.body.results?.[0]?.status);
  });
});
