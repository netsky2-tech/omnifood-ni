import { createHash, randomUUID } from 'crypto';
import { ConflictException, BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  OnboardingIdempotencyRecord,
  OnboardingIdempotencyStatus,
} from '../../src/modules/onboarding/entities/onboarding-idempotency.entity';
import { OnboardingIdempotencyCoordinator } from '../../src/modules/onboarding/services/onboarding-idempotency.coordinator';
import { bindTenantContext, TenantContextRequiredError } from '../../src/core/database/tenant-transaction';
import { createMigrationBuiltSchemaFixture } from '../support/migration-built-schema.helper';

/**
 * Issue #493 T2.S2b: the production `OnboardingIdempotencyCoordinator` exercised
 * against the MIGRATION-BUILT schema (never `synchronize: true`) and the
 * fixture's runtime role — `NOSUPERUSER NOBYPASSRLS`, owner of nothing, holding
 * exactly ordinary DML grants. `onboarding_idempotency_records` has FORCEd
 * row-level security (migration 1809220000000), so every statement the
 * coordinator issues through an unbound pooled connection is subject to the
 * migrated policies and must fail closed; tenant-local behavior is only
 * reachable through the coordinator's tenant-bound transaction/manager path.
 *
 * The superuser connection exists only to seed probe rows and to assert
 * persistence facts that RLS would hide. All tenant ids are synthetic UUIDs
 * (tenant_id is a uuid column and carries no FK to tenants).
 */

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: Number(process.env.DB_PORT?.trim() ?? 5432),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: process.env.DB_PASSWORD?.trim() ?? 'postgres',
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

const poolCleanupExtra = { extra: { allowExitOnIdle: true } };

describe('OnboardingIdempotencyCoordinator under migration-built FORCE RLS (Real PostgreSQL DB, table non-owner role)', () => {
  jest.setTimeout(180000);

  let admin: DataSource;
  let runtime: DataSource;
  let fixture: Awaited<ReturnType<typeof createMigrationBuiltSchemaFixture>>;
  let schema: string;
  let coordinator: OnboardingIdempotencyCoordinator;

  // Tenant A drives the coordinator; tenant B owns a seeded foreign record
  // that A must never see or mutate. C is a fresh tenant for create paths.
  const tenantAId = randomUUID();
  const tenantBId = randomUUID();
  const tenantCId = randomUUID();
  const recordBId = randomUUID();
  const recordBPayloadHash = createHash('sha256')
    .update('tenant-b-seeded-payload')
    .digest('hex');

  /** Raw persisted row (snake_case SQL columns), read through the superuser. */
  interface PersistedRecordRow {
    id: string;
    tenant_id: string;
    idempotency_key: string;
    status: string;
    lease_owner: string | null;
    attempt_count: number;
    result_ref: unknown;
    last_error_code: string | null;
    completed_at: Date | null;
  }

  const adminRowFor = async (
    recordId: string,
  ): Promise<PersistedRecordRow> => {
    const rows = (await admin.query(
      `SELECT * FROM onboarding_idempotency_records WHERE id = $1`,
      [recordId],
    )) as Array<PersistedRecordRow>;
    return rows[0];
  };

  const adminCountForKey = async (key: string): Promise<number> => {
    const rows = (await admin.query(
      `SELECT count(*)::int AS count FROM onboarding_idempotency_records
        WHERE idempotency_key = $1`,
      [key],
    )) as Array<{ count: number }>;
    return rows[0].count;
  };

  const seedRecord = async (record: {
    id: string;
    tenantId: string;
    idempotencyKey: string;
    status: OnboardingIdempotencyStatus;
    leaseOwner: string | null;
    leaseExpiresAt: Date | null;
    attemptCount: number;
  }): Promise<void> => {
    await admin.query(
      `INSERT INTO onboarding_idempotency_records
         (id, tenant_id, idempotency_key, command_type, payload_hash, status,
          lease_owner, lease_acquired_at, lease_expires_at, attempt_count)
       VALUES ($1, $2, $3, 'SeedCommand', $4, $5, $6, now(), $7, $8)`,
      [
        record.id,
        record.tenantId,
        record.idempotencyKey,
        recordBPayloadHash,
        record.status,
        record.leaseOwner,
        record.leaseExpiresAt,
        record.attemptCount,
      ],
    );
  };

  beforeAll(async () => {
    fixture = await createMigrationBuiltSchemaFixture();
    schema = fixture.schema;

    admin = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      schema,
      ...poolCleanupExtra,
      extra: {
        ...poolCleanupExtra.extra,
        options: `-c search_path=${schema},public`,
      },
    });
    await admin.initialize();

    // Tenant B's foreign record: an active lease on the shared key. If tenant
    // A's coordinator access were unbound, this row would either be disclosed
    // (blocking A's acquire) or silently mutated by a forged completion.
    await seedRecord({
      id: recordBId,
      tenantId: tenantBId,
      idempotencyKey: 'shared-cmd',
      status: OnboardingIdempotencyStatus.IN_PROGRESS,
      leaseOwner: 'worker-b',
      leaseExpiresAt: new Date(Date.now() + 3600000),
      attemptCount: 1,
    });

    // The runtime connection registers only the entity metadata (never
    // `synchronize`): the schema is exclusively the migrations' output, and
    // the repository needs the metadata to exercise the production service.
    runtime = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      username: fixture.runtimeRoleName,
      password: fixture.runtimeRolePassword,
      entities: [OnboardingIdempotencyRecord],
      ...poolCleanupExtra,
    });
    await runtime.initialize();

    coordinator = new OnboardingIdempotencyCoordinator(
      runtime.getRepository(OnboardingIdempotencyRecord),
    );
  });

  afterAll(async () => {
    if (runtime?.isInitialized) await runtime.destroy();
    if (admin?.isInitialized) await admin.destroy();
    if (fixture) await fixture.close();
  });

  it('runs as a NOSUPERUSER, NOBYPASSRLS role that owns none of the tables', async () => {
    const role = (
      await admin.query(
        `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1`,
        [fixture.runtimeRoleName],
      )
    )[0];
    expect(role).toBeDefined();
    expect(role.rolsuper).toBe(false);
    expect(role.rolbypassrls).toBe(false);

    const owned = (await admin.query(
      `SELECT count(*)::int AS count FROM pg_tables
        WHERE schemaname = $1 AND tablename = 'onboarding_idempotency_records'
          AND tableowner = $2`,
      [schema, fixture.runtimeRoleName],
    )) as Array<{ count: number }>;
    expect(owned[0].count).toBe(0);
  });

  it('acquires a tenant-local lease and completes success through a caller-bound transaction, then replays the cached result', async () => {
    const payload = { templateCode: 'CAFETERIA', items: ['latte'] };
    const key = 'cmd-template-apply-001';

    const lease = await coordinator.acquireLease({
      tenantId: tenantAId,
      idempotencyKey: key,
      commandType: 'ApplyTemplate',
      payload,
      leaseOwner: 'worker-primary',
      leaseTtlMs: 20000,
    });

    expect(lease.state).toBe('ACQUIRED');
    if (lease.state === 'ACQUIRED') {
      expect(lease.record.tenantId).toBe(tenantAId);
      expect(lease.record.status).toBe(
        OnboardingIdempotencyStatus.IN_PROGRESS,
      );
      expect(lease.record.attemptCount).toBe(1);
    }
    expect(await adminCountForKey(key)).toBe(1);

    // Caller-owned transaction: the coordinator must bind and mutate through
    // the supplied manager without opening an independent transaction.
    const recordAId =
      lease.state === 'ACQUIRED' ? lease.record.id : 'unreachable';
    await runtime.transaction(async (manager) => {
      await bindTenantContext(manager, tenantAId);
      await coordinator.completeSuccess(
        recordAId,
        { applied: true, productsCreated: 1 },
        manager,
      );
    });

    const persisted = await adminRowFor(recordAId);
    expect(persisted.status).toBe(OnboardingIdempotencyStatus.SUCCEEDED);
    expect(persisted.result_ref).toEqual({
      applied: true,
      productsCreated: 1,
    });
    expect(persisted.completed_at).not.toBeNull();

    const replay = await coordinator.acquireLease({
      tenantId: tenantAId,
      idempotencyKey: key,
      commandType: 'ApplyTemplate',
      payload,
    });
    expect(replay.state).toBe('ALREADY_COMPLETED');
    if (replay.state === 'ALREADY_COMPLETED') {
      expect(replay.result).toEqual({ applied: true, productsCreated: 1 });
      expect(replay.record.id).toBe(recordAId);
    }
  });

  it('isolates the same idempotency key across tenants and never discloses or mutates the foreign record', async () => {
    // Tenant A acquires the SAME key tenant B already holds with an active
    // lease: B's lease must not block A, and A must get its own row.
    const payload = { importSessionId: randomUUID() };

    const leaseA = await coordinator.acquireLease({
      tenantId: tenantAId,
      idempotencyKey: 'shared-cmd',
      commandType: 'CommitImport',
      payload,
      leaseOwner: 'worker-a',
      leaseTtlMs: 20000,
    });

    expect(leaseA.state).toBe('ACQUIRED');
    if (leaseA.state === 'ACQUIRED') {
      expect(leaseA.record.tenantId).toBe(tenantAId);
      expect(leaseA.record.id).not.toBe(recordBId);
    }
    expect(await adminCountForKey('shared-cmd')).toBe(2);

    // A forged completion: a transaction bound to A attempts to complete B's
    // record. The coordinator must reject it and leave B untouched.
    await runtime.transaction(async (manager) => {
      await bindTenantContext(manager, tenantAId);
      await expect(
        coordinator.completeSuccess(
          recordBId,
          { forged: true },
          manager,
        ),
      ).rejects.toThrow(ConflictException);
    });

    const untouched = await adminRowFor(recordBId);
    expect(untouched.status).toBe(OnboardingIdempotencyStatus.IN_PROGRESS);
    expect(untouched.lease_owner).toBe('worker-b');
    expect(untouched.attempt_count).toBe(1);
    expect(untouched.result_ref).toBeNull();
  });

  it('fails closed on blank tenant context and on unbound completion access without touching data', async () => {
    await expect(
      coordinator.acquireLease({
        tenantId: '',
        idempotencyKey: 'blank-cmd',
        commandType: 'ApplyTemplate',
        payload: { a: 1 },
      }),
    ).rejects.toThrow(TenantContextRequiredError);
    await expect(
      coordinator.acquireLease({
        tenantId: '   ',
        idempotencyKey: 'blank-cmd',
        commandType: 'ApplyTemplate',
        payload: { a: 1 },
      }),
    ).rejects.toThrow(TenantContextRequiredError);

    // Unbound completion: no manager, no tenant context. The coordinator must
    // fail closed instead of issuing a blind mutation, and B's row must stay
    // exactly as seeded.
    await expect(
      coordinator.completeSuccess(recordBId, { unbound: true }),
    ).rejects.toThrow(ConflictException);

    const untouched = await adminRowFor(recordBId);
    expect(untouched.status).toBe(OnboardingIdempotencyStatus.IN_PROGRESS);
    expect(untouched.lease_owner).toBe('worker-b');
    expect(untouched.attempt_count).toBe(1);
    expect(untouched.result_ref).toBeNull();
  });

  it('opens its own canonical tenant transaction for completion when no caller manager is supplied', async () => {
    // Fresh acquire for tenant C, then complete with NO manager: the
    // coordinator must open and bind its own tenant transaction.
    const payload = { source: 'no-manager-completion' };
    const lease = await coordinator.acquireLease({
      tenantId: tenantCId,
      idempotencyKey: 'cmd-no-manager-003',
      commandType: 'ApplyTemplate',
      payload,
      leaseOwner: 'worker-solo',
      leaseTtlMs: 20000,
    });
    expect(lease.state).toBe('ACQUIRED');
    const recordCId =
      lease.state === 'ACQUIRED' ? lease.record.id : 'unreachable';

    await coordinator.completeSuccess(
      recordCId,
      { applied: true, via: 'own-transaction' },
      undefined,
      tenantCId,
    );

    const persisted = await adminRowFor(recordCId);
    expect(persisted.status).toBe(OnboardingIdempotencyStatus.SUCCEEDED);
    expect(persisted.result_ref).toEqual({
      applied: true,
      via: 'own-transaction',
    });
    expect(persisted.completed_at).not.toBeNull();

    const replay = await coordinator.acquireLease({
      tenantId: tenantCId,
      idempotencyKey: 'cmd-no-manager-003',
      commandType: 'ApplyTemplate',
      payload,
    });
    expect(replay.state).toBe('ALREADY_COMPLETED');
  });

  it('enforces lease ownership, expiry reclaim, and failure-completion replay semantics', async () => {
    const payload = { scenario: 'leases' };

    // Active lease on the bound tenant's own record: locked out.
    const lease1 = await coordinator.acquireLease({
      tenantId: tenantAId,
      idempotencyKey: 'lease-active',
      commandType: 'ApplyTemplate',
      payload,
      leaseOwner: 'worker-1',
      leaseTtlMs: 20000,
    });
    expect(lease1.state).toBe('ACQUIRED');
    await expect(
      coordinator.acquireLease({
        tenantId: tenantAId,
        idempotencyKey: 'lease-active',
        commandType: 'ApplyTemplate',
        payload,
        leaseOwner: 'worker-2',
      }),
    ).rejects.toThrow(ConflictException);

    // Integrity conflict: same key, different payload.
    await expect(
      coordinator.acquireLease({
        tenantId: tenantAId,
        idempotencyKey: 'lease-active',
        commandType: 'ApplyTemplate',
        payload: { scenario: 'different' },
        leaseOwner: 'worker-3',
      }),
    ).rejects.toThrow(ConflictException);

    // Expired lease: reclaimed with an incremented attempt count.
    const expired = await coordinator.acquireLease({
      tenantId: tenantCId,
      idempotencyKey: 'lease-expired',
      commandType: 'CommitImport',
      payload,
      leaseOwner: 'worker-crashed',
      leaseTtlMs: 20,
    });
    expect(expired.state).toBe('ACQUIRED');
    await new Promise((r) => setTimeout(r, 40));
    const reclaimed = await coordinator.acquireLease({
      tenantId: tenantCId,
      idempotencyKey: 'lease-expired',
      commandType: 'CommitImport',
      payload,
      leaseOwner: 'worker-recovered',
      leaseTtlMs: 20000,
    });
    expect(reclaimed.state).toBe('ACQUIRED');
    if (reclaimed.state === 'ACQUIRED') {
      expect(reclaimed.record.leaseOwner).toBe('worker-recovered');
      expect(reclaimed.record.attemptCount).toBe(2);
    }

    // Retryable failure: replayable with an incremented attempt count.
    const retryableId =
      reclaimed.state === 'ACQUIRED' ? reclaimed.record.id : 'unreachable';
    await runtime.transaction(async (manager) => {
      await bindTenantContext(manager, tenantCId);
      await coordinator.completeFailure(
        retryableId,
        { message: 'IMPORT_STAGING_EMPTY', isRetryable: true },
        manager,
      );
    });
    const retryableRow = await adminRowFor(retryableId);
    expect(retryableRow.status).toBe(
      OnboardingIdempotencyStatus.FAILED_RETRYABLE,
    );
    expect(retryableRow.last_error_code).toBe('IMPORT_STAGING_EMPTY');
    expect(retryableRow.completed_at).not.toBeNull();

    const retried = await coordinator.acquireLease({
      tenantId: tenantCId,
      idempotencyKey: 'lease-expired',
      commandType: 'CommitImport',
      payload,
      leaseOwner: 'worker-retry',
      leaseTtlMs: 20000,
    });
    expect(retried.state).toBe('ACQUIRED');
    if (retried.state === 'ACQUIRED') {
      expect(retried.record.attemptCount).toBe(3);
      expect(retried.record.status).toBe(
        OnboardingIdempotencyStatus.IN_PROGRESS,
      );
    }

    // Final failure: replay is permanently rejected.
    const finalId = retried.state === 'ACQUIRED' ? retried.record.id : 'x';
    await runtime.transaction(async (manager) => {
      await bindTenantContext(manager, tenantCId);
      await coordinator.completeFailure(
        finalId,
        { message: 'SCHEMA_INVALID', isRetryable: false },
        manager,
      );
    });
    const finalRow = await adminRowFor(finalId);
    expect(finalRow.status).toBe(OnboardingIdempotencyStatus.FAILED_FINAL);

    await expect(
      coordinator.acquireLease({
        tenantId: tenantCId,
        idempotencyKey: 'lease-expired',
        commandType: 'CommitImport',
        payload,
        leaseOwner: 'worker-late',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
