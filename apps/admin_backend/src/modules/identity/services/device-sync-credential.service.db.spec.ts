import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';

import { createMigrationBuiltSchemaFixture } from '../../../../test/support/migration-built-schema.helper';
import { JwtService } from '@nestjs/jwt';
import {
  ActivationAttempt,
  ActivationAttemptStatus,
} from '../../onboarding/entities/activation-attempt.entity';
import {
  DeviceSyncCredential,
  DeviceSyncCredentialStatus,
} from '../entities/device-sync-credential.entity';
import { DeviceSyncCredentialEvent } from '../entities/device-sync-credential-event.entity';
import type { DeviceSyncJwtConfig } from '../config/device-sync-jwt.config';
import { DeviceSyncCredentialService } from './device-sync-credential.service';
import { SyncHealthService } from '../../sales/sync-health/sync-health.service';

/**
 * DB-backed proof for the terminal registry read model (issue #832 / AG-03,
 * Batch 17 Task 3) and its sync-health cross-check.
 *
 * Unlike device-sync-credential.service.spec.ts (mocked repositories), this
 * suite drives the REAL DeviceSyncCredentialService.listTenantTerminals and
 * the REAL SyncHealthService.getFreshness against a migration-built scratch
 * schema under the production RLS policies: the service runs on a
 * non-superuser, non-bypassing runtime role, so tenant isolation is enforced
 * by PostgreSQL, not by the test's goodwill.
 *
 * Harness: the same createMigrationBuiltSchemaFixture the other service-level
 * db specs use — the full migration set runs into a fresh scratch schema, so
 * the append-only trigger, the stream-sequence unique index and the RLS
 * policies on device_sync_credentials, onboarding_activation_attempts and
 * inventory_sync_receipts are the production ones. Fixtures are built
 * forward only and never cleaned mid-test; every tenant uses fresh random
 * ids, so leftovers can never interfere.
 */

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required for DB-backed service tests`);
  }

  return value;
}

function readPostgresPort(): number {
  const value = process.env.DB_PORT?.trim() ?? '5432';
  const port = Number(value);

  if (!Number.isInteger(port)) {
    throw new Error(
      'DB_PORT must be a valid integer for DB-backed service tests',
    );
  }

  return port;
}

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: readPostgresPort(),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: getRequiredEnv('DB_PASSWORD'),
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

interface SeededTerminal {
  readonly deviceId: string;
  readonly attemptId: string;
  readonly credentialId: string;
  readonly status: DeviceSyncCredentialStatus;
}

interface SeededTenant {
  readonly tenantId: string;
  readonly sessionId: string;
  readonly terminals: Map<string, SeededTerminal>;
}

describe('DeviceSyncCredentialService terminal registry (db-backed, real Postgres RLS)', () => {
  const TEST_TIMEOUT_MS = 30000;
  const SETUP_TIMEOUT_MS = 600000;

  let fixture: Awaited<
    ReturnType<typeof createMigrationBuiltSchemaFixture>
  > | null = null;
  let admin: DataSource | null = null;
  let runtime: DataSource | null = null;
  let service: DeviceSyncCredentialService;
  let syncHealth: SyncHealthService;

  let tenantA: SeededTenant;
  let tenantB: SeededTenant;

  /** Exact instant of the newest seeded receipt, asserted byte-for-byte. */
  let revokedLastReceiptAt: Date;
  let activeLastReceiptAt: Date;

  const q = (table: string): string =>
    `"${fixture?.schema ?? 'SCHEMA_NOT_READY'}"."${table}"`;

  const seedTenant = async (label: string): Promise<SeededTenant> => {
    if (!admin) throw new Error('admin data source not initialized');
    const tenantId = randomUUID();

    // Tenant row. Seeding runs on the superuser admin connection, which
    // bypasses RLS by definition; the row carries its own uuid so every
    // downstream policy predicate resolves.
    await admin.query(
      `INSERT INTO ${q('tenants')} (id, name, slug) VALUES ($1, $2, $3)`,
      [
        tenantId,
        `dsc-db-spec-tenant-${label}-${tenantId.slice(0, 8)}`,
        `dsc-db-spec-${label}-${tenantId.replace(/-/g, '').slice(0, 20)}`,
      ],
    );

    // One onboarding session per tenant (unique on tenant_id).
    const session = (
      await admin.query(
        `INSERT INTO ${q('onboarding_sessions')} (tenant_id) VALUES ($1) RETURNING id`,
        [tenantId],
      )
    )[0];

    return { tenantId, sessionId: session.id, terminals: new Map() };
  };

  const seedTerminal = async (
    tenant: SeededTenant,
    deviceId: string,
    status: DeviceSyncCredentialStatus,
  ): Promise<SeededTerminal> => {
    if (!admin) throw new Error('admin data source not initialized');

    const attempt = (
      await admin.query(
        `INSERT INTO ${q('onboarding_activation_attempts')} (
           tenant_id, onboarding_session_id, candidate_terminal_id,
           trusted_terminal_id, status, started_by_user_id,
           server_time_anchor_at, required_fiscal_revision,
           required_fiscal_fingerprint, verification_product_id,
           verification_product_fingerprint, pos_build
         ) VALUES ($1, $2, $3, $3, $4, 'dsc-db-spec', now(), 0, 'fp', 'prod', 'fp', 'pos-build-1')
         RETURNING id`,
        [
          tenant.tenantId,
          tenant.sessionId,
          deviceId,
          ActivationAttemptStatus.PASS,
        ],
      )
    )[0];

    const credential = (
      await admin.query(
        `INSERT INTO ${q('device_sync_credentials')} (
           tenant_id, activation_attempt_id, renewal_secret_hash,
           version, status, expires_at, revoked_at, revocation_reason
         ) VALUES ($1, $2, 'dsc-db-spec-hash', 1, $3,
                   now() + interval '1 day', $4, $5)
         RETURNING id`,
        [
          tenant.tenantId,
          attempt.id,
          status,
          status === DeviceSyncCredentialStatus.REVOKED ? new Date() : null,
          status === DeviceSyncCredentialStatus.REVOKED
            ? 'Terminal extraviada en turno'
            : null,
        ],
      )
    )[0];

    const terminal: SeededTerminal = {
      deviceId,
      attemptId: attempt.id,
      credentialId: credential.id,
      status,
    };
    tenant.terminals.set(deviceId, terminal);
    return terminal;
  };

  /**
   * Seeds an ACCEPTED receipt row through the real append-only trigger and
   * the real (tenant_id, source_device_id, flow_type, source_sequence)
   * unique index of the migration-built inventory_sync_receipts.
   */
  const seedAcceptedReceipt = async (
    tenantId: string,
    deviceId: string,
    sequence: number,
    acceptedAt: Date,
  ): Promise<void> => {
    if (!admin) throw new Error('admin data source not initialized');
    await admin.query(
      `INSERT INTO ${q('inventory_sync_receipts')} (
         tenant_id, idempotency_key, source_device_id, flow_type,
         source_sequence, payload_hash, result_status, result_code, accepted_at
       ) VALUES ($1, $2, $3, 'inventory', $4, $5, 'ACCEPTED', 'APPLIED', $6::timestamptz)`,
      [
        tenantId,
        `dsc-db-spec:${deviceId}:${sequence}:${randomUUID()}`,
        deviceId,
        sequence,
        `seed-hash-${sequence}`,
        acceptedAt.toISOString(),
      ],
    );
  };

  beforeAll(async () => {
    fixture = await createMigrationBuiltSchemaFixture();

    // Superuser connection for seeding only (bypasses RLS by definition).
    admin = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      extra: { max: 2, allowExitOnIdle: true },
    });
    await admin.initialize();

    // Application runtime role: non-superuser, non-bypassing, non-owner —
    // the migrated FORCE ROW LEVEL SECURITY policies are fully enforced.
    runtime = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      username: fixture.runtimeRoleName,
      password: fixture.runtimeRolePassword,
      schema: fixture.schema,
      entities: [
        DeviceSyncCredential,
        DeviceSyncCredentialEvent,
        ActivationAttempt,
      ],
    });
    await runtime.initialize();

    // Trivial JWT collaborators: listTenantTerminals never issues tokens.
    const mockJwtService = {
      signAsync: jest.fn().mockResolvedValue('unused-by-list-tenant-terminals'),
    } as unknown as JwtService;
    const mockJwtConfig = {
      secret: 'dsc-db-spec-secret-value-at-least-32-characters-long',
      issuer: 'dsc-db-spec-issuer',
      audience: 'dsc-db-spec-audience',
      accessTokenTtlSeconds: 900,
      renewalTtlSeconds: 900,
      clockToleranceSeconds: 0,
      algorithm: 'HS256',
    } as DeviceSyncJwtConfig;

    service = new DeviceSyncCredentialService(
      runtime,
      runtime.getRepository(DeviceSyncCredential),
      runtime.getRepository(DeviceSyncCredentialEvent),
      runtime.getRepository(ActivationAttempt),
      mockJwtService,
      mockJwtConfig,
    );
    syncHealth = new SyncHealthService(runtime);

    // ---- Fixture build (forward only; append-only tables are never cleaned) ----

    // Tenant A: Terminal-A1 ACTIVE with fresh receipts (1..5),
    //           Terminal-A2 REVOKED with historical receipts (1..3).
    tenantA = await seedTenant('a');
    const terminalA1 = await seedTerminal(
      tenantA,
      'Terminal-A1',
      DeviceSyncCredentialStatus.ACTIVE,
    );
    const terminalA2 = await seedTerminal(
      tenantA,
      'Terminal-A2',
      DeviceSyncCredentialStatus.REVOKED,
    );

    // Tenant B: Terminal-B1 ACTIVE, never synced (no receipts).
    tenantB = await seedTenant('b');
    await seedTerminal(
      tenantB,
      'Terminal-B1',
      DeviceSyncCredentialStatus.ACTIVE,
    );

    // Receipts. Revoked terminal: sequences 1..3 accepted hours ago
    // (historical watermark only; the terminal is excluded from freshness
    // derivation). Active terminal: sequences 1..5, newest accepted 30s ago
    // (inside the 5-minute platform freshness threshold -> COMPLETE).
    const threeHoursAgo = Date.now() - 3 * 60 * 60 * 1000;
    for (let seq = 1; seq <= 3; seq += 1) {
      await seedAcceptedReceipt(
        tenantA.tenantId,
        terminalA2.deviceId,
        seq,
        new Date(threeHoursAgo + seq * 1000),
      );
    }
    revokedLastReceiptAt = new Date(threeHoursAgo + 3 * 1000);

    activeLastReceiptAt = new Date(Date.now() - 30 * 1000);
    for (let seq = 1; seq <= 5; seq += 1) {
      await seedAcceptedReceipt(
        tenantA.tenantId,
        terminalA1.deviceId,
        seq,
        // One distinct instant per receipt; the newest (seq 5) is the
        // asserted watermark.
        new Date(activeLastReceiptAt.getTime() - (5 - seq) * 1000),
      );
    }
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    if (runtime?.isInitialized) {
      await runtime.destroy();
    }
    if (admin?.isInitialized) {
      await admin.destroy();
    }
    await fixture?.close();
  }, SETUP_TIMEOUT_MS);

  it(
    'enforces strict RLS tenant isolation: each tenant sees exactly its own terminals',
    async () => {
      const forA = await service.listTenantTerminals(tenantA.tenantId);
      const forB = await service.listTenantTerminals(tenantB.tenantId);

      const idsA = forA.map((terminal) => terminal.terminalId).sort();
      const idsB = forB.map((terminal) => terminal.terminalId).sort();

      expect(idsA).toEqual(['Terminal-A1', 'Terminal-A2']);
      expect(idsB).toEqual(['Terminal-B1']);

      // Zero cross-tenant leakage in either direction.
      expect(idsA).not.toContain('Terminal-B1');
      expect(idsB).not.toContain('Terminal-A1');
      expect(idsB).not.toContain('Terminal-A2');
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'reports the revoked terminal contract: REVOKED status, revocation evidence, null freshness, historical watermark',
    async () => {
      const forA = await service.listTenantTerminals(tenantA.tenantId);
      const revoked = forA.find(
        (terminal) => terminal.terminalId === 'Terminal-A2',
      );

      expect(revoked).toBeDefined();
      expect(revoked?.status).toBe(DeviceSyncCredentialStatus.REVOKED);
      expect(revoked?.revokedAt).not.toBeNull();
      expect(revoked?.revocationReason).toBe('Terminal extraviada en turno');

      // Excluded from freshness derivation: display freshness is null...
      expect(revoked?.freshnessState).toBeNull();
      expect(revoked?.hasDeclaredGaps).toBe(false);
      expect(revoked?.hasInventoryPending).toBe(false);

      // ...but its persisted receipt stream still carries the historical
      // accepted cursor and the last receipt instant.
      expect(revoked?.acceptedThroughSequence).toBe(3);
      expect(revoked?.lastReceiptAt).toBe(revokedLastReceiptAt.toISOString());
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'reports the active terminal contract and agrees with SyncHealthService byte-for-byte',
    async () => {
      const forA = await service.listTenantTerminals(tenantA.tenantId);
      const active = forA.find(
        (terminal) => terminal.terminalId === 'Terminal-A1',
      );

      expect(active).toBeDefined();
      expect(active?.status).toBe(DeviceSyncCredentialStatus.ACTIVE);
      expect(active?.revokedAt).toBeNull();
      expect(active?.revocationReason).toBeNull();

      // Fresh receipts 30s ago, contiguous watermark 1..5, no gap evidence.
      expect(active?.freshnessState).toBe('COMPLETE');
      expect(active?.acceptedThroughSequence).toBe(5);
      expect(active?.lastReceiptAt).toBe(activeLastReceiptAt.toISOString());

      // Never-synced tenant B terminal stays display-only PENDING.
      const forB = await service.listTenantTerminals(tenantB.tenantId);
      expect(forB).toHaveLength(1);
      expect(forB[0].freshnessState).toBe('PENDING');
      expect(forB[0].acceptedThroughSequence).toBeNull();
      expect(forB[0].lastReceiptAt).toBeNull();

      // Cross-check: the independent SyncHealthService read path derives the
      // exact same per-terminal freshness for tenant A.
      const freshness = await syncHealth.getFreshness(tenantA.tenantId);
      const healthA1 = freshness.perTerminal.find(
        (terminal) => terminal.terminalId === 'Terminal-A1',
      );
      expect(healthA1).toBeDefined();
      expect(healthA1?.state).toBe(active?.freshnessState);
      expect(healthA1?.acceptedThroughSequence).toBe(
        active?.acceptedThroughSequence,
      );
      expect(healthA1?.lastReceiptAt).toBe(active?.lastReceiptAt);

      // The revoked terminal is not a freshness participant for either read
      // model: SyncHealthService excludes it entirely.
      expect(
        freshness.perTerminal.find(
          (terminal) => terminal.terminalId === 'Terminal-A2',
        ),
      ).toBeUndefined();
    },
    TEST_TIMEOUT_MS,
  );
});
