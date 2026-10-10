import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { normalizeTenantSlug } from '../../src/modules/tenant/tenant-slug';
import { createMigrationBuiltSchemaFixture } from '../support/migration-built-schema.helper';
import { AuditLog } from '../../src/modules/identity/entities/audit-log.entity';
import { AuditIntegrityAlert } from '../../src/modules/identity/entities/audit-integrity-alert.entity';
import { User } from '../../src/modules/identity/entities/user.entity';
import { SecurityProfile } from '../../src/modules/identity/entities/security-profile.entity';
import { Tenant } from '../../src/modules/tenant/entities/tenant.entity';
import { AuditLogsService } from '../../src/modules/audit/audit-logs.service';

/**
 * S4a — REAL-DATABASE proof for the POS forensic audit ledger read surface
 * (GET /operations/audit/ledger + GET /operations/audit/integrity).
 *
 * The schema is built by RUNNING THE FULL MIGRATION SET (via
 * test/support/migration-built-schema.helper.ts) — never `synchronize: true`
 * — so what is asserted here is the migrated shape, including the partial
 * unique index `uq_audit_stream_sequence_active` and the hash-chain columns.
 * The service under test (AuditLogsService) runs on the fixture's runtime
 * role: `NOSUPERUSER NOBYPASSRLS`, owner of nothing, holding exactly
 * ordinary DML grants, with its role-level search_path pinned to the scratch
 * schema so the service's unqualified entity SQL resolves exactly as
 * production's does.
 *
 * ISOLATION REALITY (read before "fixing" these tests): `audit_logs` and
 * `audit_integrity_alerts` are RLS DEBT entries in
 * scripts/schema-rls-coverage-manifest.txt — the migration set arms NO row
 * level security on them (1809310000000 deliberately scopes change_log and
 * forensic_alerts only). The first test below pins that catalog fact as a
 * tripwire. The isolation the later tests prove is therefore enforced by the
 * SERVICE's explicit `tenant_id` predicate inside the tenant-bound
 * transaction (runInTenantTransaction + WHERE audit.tenant_id = :tenantId),
 * which is the same fail-closed pattern every other debt-table reader in
 * this codebase uses (see AuditTrailService). The fixtures make that proof
 * NON-VACUOUS: both tenants carry rows with IDENTICAL target, device, user
 * stream position and signature, so a dropped tenant predicate turns every
 * isolation assertion into a two-row failure.
 *
 * Every table's NOT NULL columns are supplied by the seed inserts, so a
 * failure is never a missing NOT NULL value masquerading as a service bug.
 */

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: Number(process.env.DB_PORT?.trim() ?? 5432),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: process.env.DB_PASSWORD?.trim() ?? 'postgres',
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

const poolCleanupExtra = { extra: { allowExitOnIdle: true } };

describe('AuditLogsService POS forensic ledger reads (Real PostgreSQL DB, migration-built schema)', () => {
  jest.setTimeout(180000);

  let admin: DataSource;
  let runtime: DataSource;
  let service: AuditLogsService;
  let fixture: Awaited<ReturnType<typeof createMigrationBuiltSchemaFixture>>;

  const tenantAId = randomUUID();
  const tenantBId = randomUUID();

  const userA1Id = randomUUID(); // tenant A cashier — ledger actor
  const userA2Id = randomUUID(); // tenant A second actor — filter probe
  const userB1Id = randomUUID(); // tenant B actor
  const ghostUserId = randomUUID(); // audit_logs row with no users row

  // IDENTICAL forensic coordinates across tenants: same target, same device,
  // same stream position. Pre-filter, both tenants' rows are
  // indistinguishable — this is what makes the isolation tests non-vacuous.
  const SHARED_TARGET_TYPE = 'invoice';
  const SHARED_TARGET_ID = 'inv-shared-001';
  const SHARED_DEVICE_ID = 'POS-1';
  const SHARED_SEQUENCE = 3;
  const SHARED_SIGNATURE = 'sig-shared-gap-41-44';

  const logA1Id = randomUUID(); // A, SALE_VOIDED, shared target
  const logA2Id = randomUUID(); // A, CREDIT_NOTE_CREATED
  const logA3Id = randomUUID(); // A, supervisor override, Aug
  const logA4Id = randomUUID(); // A, drawer open (limit probe)
  const logA5Id = randomUUID(); // A, drawer open (limit probe)
  const logA6Id = randomUUID(); // A, actor with no users row
  const logB1Id = randomUUID(); // B, SALE_VOIDED, shared target

  const alertAId = randomUUID();
  const alertBId = randomUUID();

  beforeAll(async () => {
    fixture = await createMigrationBuiltSchemaFixture();
    process.stdout.write(
      `[timing] migration-built setup = ${fixture.setupDurationMs} ms (migrations alone: ${fixture.migrationDurationMs} ms)\n`,
    );

    // Superuser connection: seeding and catalog facts only. search_path is
    // pinned so unqualified SQL lands in the scratch schema.
    admin = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      schema: fixture.schema,
      ...poolCleanupExtra,
      extra: {
        ...poolCleanupExtra.extra,
        options: `-c search_path=${fixture.schema},public`,
      },
    });
    await admin.initialize();

    await admin.query(
      `INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3), ($4, $5, $6)`,
      [
        tenantAId,
        'ledger-tenant-a',
        normalizeTenantSlug('ledger-tenant-a'),
        tenantBId,
        'ledger-tenant-b',
        normalizeTenantSlug('ledger-tenant-b'),
      ],
    );

    await admin.query(
      `INSERT INTO users (id, tenant_id, name, email, role)
       VALUES ($1, $2, 'Cashier A', $4, 'CASHIER'),
              ($3, $2, 'Supervisor A', $5, 'MANAGER'),
              ($6, $7, 'Cashier B', $8, 'CASHIER')`,
      [
        userA1Id,
        tenantAId,
        userA2Id,
        'cashier@ledger-a.test',
        'supervisor@ledger-a.test',
        userB1Id,
        tenantBId,
        'cashier@ledger-b.test',
      ],
    );

    // POS forensic rows. tenant_id/user_id carry NO foreign key on
    // audit_logs (verified against the migration set), so the ghost-actor
    // row below is ordinary producible data. Forensic columns are supplied
    // explicitly — the read model must survive rows that carry them.
    await admin.query(
      `INSERT INTO audit_logs
         (id, tenant_id, user_id, action, target_type, target_id,
          device_id, sequence_no, prev_hash, entry_hash, hash_version,
          "timestamp", metadata, forensic_status)
       VALUES
         ($1,  $2, $3,  'SALE_VOIDED', 'invoice', 'inv-shared-001',
          'POS-1', ${SHARED_SEQUENCE}, 'prev-a1', 'hash-a1', 'v3',
          '2026-09-10T12:00:00Z', $12, 'ACTIVE'),
         ($4,  $2, $3,  'CREDIT_NOTE_CREATED', 'credit_note', 'cn-9',
          'POS-1', 4, 'prev-a2', 'hash-a2', 'v3',
          '2026-09-11T12:00:00Z', $12, 'ACTIVE'),
         ($5,  $2, $13, 'SUPERVISOR_OVERRIDE_MANUAL_DISCOUNT', 'sale', 'sale-77',
          'POS-2', 1, 'prev-a3', 'hash-a3', 'v3',
          '2026-08-10T12:00:00Z', $12, 'ACTIVE'),
         ($6,  $2, $13, 'DRAWER_OPENED_MANUALLY', 'CASH_DRAWER', 'drawer-1',
          'POS-2', 2, 'prev-a4', 'hash-a4', 'v3',
          '2026-09-12T12:00:00Z', $12, 'ACTIVE'),
         ($7,  $2, $13, 'DRAWER_OPENED_MANUALLY', 'CASH_DRAWER', 'drawer-2',
          'POS-2', 3, 'prev-a5', 'hash-a5', 'v3',
          '2026-09-13T12:00:00Z', $12, 'ACTIVE'),
         ($8,  $2, $14, 'SALE_CANCEL', 'invoice', 'inv-ghost',
          'POS-3', 1, 'prev-a6', 'hash-a6', 'v3',
          '2026-09-14T12:00:00Z', $12, 'ACTIVE'),
         ($9,  $10, $11, 'SALE_VOIDED', 'invoice', 'inv-shared-001',
          'POS-1', ${SHARED_SEQUENCE}, 'prev-b1', 'hash-b1', 'v3',
          '2026-09-10T12:00:00Z', $12, 'ACTIVE')`,
      [
        logA1Id,
        tenantAId,
        userA1Id,
        logA2Id,
        logA3Id,
        logA4Id,
        logA5Id,
        logA6Id,
        logB1Id,
        tenantBId,
        userB1Id,
        JSON.stringify({ reason: 'seed', total: '875.00' }), // $12
        userA2Id, // $13
        ghostUserId, // $14
      ],
    );

    // IDENTICAL integrity alert across tenants (same device, actor stream
    // position and signature): nightly gap detection on two different
    // tenants' chains.
    await admin.query(
      `INSERT INTO audit_integrity_alerts
         (id, tenant_id, device_id, user_id, gap_start, gap_end,
          signature, first_detected_at, last_seen_at)
       VALUES ($1, $2, 'POS-1', $4, 41, 44, $6, '2026-09-01T08:00:00Z', '2026-09-02T08:00:00Z'),
              ($3, $5, 'POS-1', $7, 41, 44, $6, '2026-09-01T08:00:00Z', '2026-09-02T08:00:00Z')`,
      [alertAId, tenantAId, alertBId, userA1Id, tenantBId, SHARED_SIGNATURE, userB1Id],
    );

    // The fixture's runtime role: production-shaped (NOSUPERUSER NOBYPASSRLS,
    // non-owner), role-level search_path pinned to the scratch schema so the
    // service's unqualified entity SQL resolves there.
    runtime = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      username: fixture.runtimeRoleName,
      password: fixture.runtimeRolePassword,
      // Entity metadata ONLY for the query builder (the schema itself was
      // built by the migrations, so synchronize stays off): the ledger
      // service joins audit_logs -> users and resolves metadata for
      // audit_integrity_alerts, so those entity classes (plus AuditLog's
      // ManyToOne target Tenant and User's OneToOne SecurityProfile, whose
      // inverse relation TypeORM requires) must be registered here.
      entities: [AuditLog, AuditIntegrityAlert, User, SecurityProfile, Tenant],
      synchronize: false,
      ...poolCleanupExtra,
    });
    await runtime.initialize();

    service = new AuditLogsService(
      runtime.manager.getRepository(AuditLog),
      runtime.manager.getRepository(AuditIntegrityAlert),
      runtime,
    );
  });

  afterAll(async () => {
    if (runtime?.isInitialized) await runtime.destroy();
    if (admin?.isInitialized) await admin.destroy();
    if (fixture) await fixture.close();
  });

  it('documents the isolation reality: audit_logs and audit_integrity_alerts carry NO row level security in the migrated schema', async () => {
    // RLS debt (scripts/schema-rls-coverage-manifest.txt): the cross-tenant
    // guarantees proven below come from the service's explicit tenant
    // predicate inside the bound transaction, NOT from a policy. If a future
    // slice promotes these tables to direct RLS, this expectation must be
    // flipped WITH that slice — the manifest gate will force the moment.
    const facts = (await admin.query(
      `SELECT c.relname, c.relrowsecurity AS rls_enabled
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1
          AND c.relname IN ('audit_logs', 'audit_integrity_alerts')
        ORDER BY c.relname`,
      [fixture.schema],
    )) as Array<{ relname: string; rls_enabled: boolean }>;

    expect(facts).toEqual([
      { relname: 'audit_integrity_alerts', rls_enabled: false },
      { relname: 'audit_logs', rls_enabled: false },
    ]);
  });

  describe('GET /operations/audit/ledger read model', () => {
    it('returns tenant A rows with the actor resolved to a displayable identity, never the metadata blob or hash columns', async () => {
      const result = await service.getLedger(tenantAId, {});

      // Every seeded tenant A row, none of tenant B's.
      expect(result.entries.map((e) => e.id).sort()).toEqual(
        [logA1Id, logA2Id, logA3Id, logA4Id, logA5Id, logA6Id].sort(),
      );

      const voided = result.entries.find((e) => e.id === logA1Id);
      expect(voided).toEqual({
        id: logA1Id,
        occurredAt: '2026-09-10T12:00:00.000Z',
        actorEmail: 'cashier@ledger-a.test',
        actorUserId: userA1Id,
        action: 'SALE_VOIDED',
        severity: 'CRITICAL',
        targetType: 'invoice',
        targetId: 'inv-shared-001',
        deviceId: SHARED_DEVICE_ID,
        sequenceNo: 3,
      });

      // Ghost actor: audit_logs carries no FK to users, so an unresolvable
      // actor surfaces as a null email without breaking the row.
      const ghost = result.entries.find((e) => e.id === logA6Id);
      expect(ghost).toBeDefined();
      expect(ghost?.actorEmail).toBeNull();
      expect(ghost?.actorUserId).toBe(ghostUserId);

      // Contract shape: identity evidence, action, severity, entity
      // reference, device, timestamp — nothing else.
      const allowedKeys = [
        'action',
        'actorEmail',
        'actorUserId',
        'deviceId',
        'id',
        'occurredAt',
        'sequenceNo',
        'severity',
        'targetId',
        'targetType',
      ];
      for (const entry of result.entries) {
        expect(Object.keys(entry).sort()).toEqual(allowedKeys);
      }

      // The rows in the database DO carry the forensic payload and the hash
      // chain; the read model must drop every trace of it on the wire.
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('hash-a1');
      expect(serialized).not.toContain('prev-a1');
      expect(serialized).not.toContain('v3');
      expect(serialized).not.toContain('"metadata"');
      expect(serialized).not.toContain('875.00');
      expect(serialized).not.toContain('seed');
      expect(serialized).not.toContain('prev_hash');
      expect(serialized).not.toContain('entry_hash');
      expect(serialized).not.toContain('hash_version');

      expect(result.limit).toBe(50);
      expect(result.truncated).toBe(false);
    });

    it('returns tenant B only its own ledger row on the IDENTICAL shared target, never tenant A’s', async () => {
      const result = await service.getLedger(tenantBId, {
        targetType: SHARED_TARGET_TYPE,
        targetId: SHARED_TARGET_ID,
      });

      // VACUITY GUARD: without the service's tenant predicate this filter
      // matches BOTH tenants' rows (identical target). Exactly one row —
      // tenant B's — may come back.
      expect(result.entries.map((e) => e.id)).toEqual([logB1Id]);
      expect(result.entries[0].actorEmail).toBe('cashier@ledger-b.test');
      expect(result.entries[0].actorUserId).toBe(userB1Id);
    });

    it('shows tenant A only its own rows for the same shared-target lookup (triangulation)', async () => {
      const result = await service.getLedger(tenantAId, {
        targetType: SHARED_TARGET_TYPE,
      });

      expect(result.entries.map((e) => e.id).sort()).toEqual(
        [logA1Id, logA6Id].sort(),
      );
    });

    it('restricts by actor, action and date range', async () => {
      const byActor = await service.getLedger(tenantAId, {
        actorUserId: userA2Id,
      });
      expect(byActor.entries.map((e) => e.id).sort()).toEqual(
        [logA3Id, logA4Id, logA5Id].sort(),
      );

      const byAction = await service.getLedger(tenantAId, {
        action: 'CREDIT_NOTE_CREATED',
      });
      expect(byAction.entries.map((e) => e.id)).toEqual([logA2Id]);
      expect(byAction.entries[0].targetType).toBe('credit_note');
      expect(byAction.entries[0].severity).toBe('CRITICAL');

      // Shared reporting bounds: America/Managua local calendar day input.
      // logA3 sits in August, everything else in September 2026.
      const byDate = await service.getLedger(tenantAId, {
        startDate: '2026-09-01',
      });
      expect(byDate.entries.map((e) => e.id)).not.toContain(logA3Id);

      const byRange = await service.getLedger(tenantAId, {
        startDate: '2026-09-10',
        endDate: '2026-09-11',
      });
      // Half-open window [2026-09-10T06:00Z, 2026-09-12T06:00Z).
      expect(byRange.entries.map((e) => e.id).sort()).toEqual(
        [logA1Id, logA2Id].sort(),
      );
    });

    it('enforces the page cap and reports truncation honestly', async () => {
      const twoDrawerRows = await service.getLedger(tenantAId, {
        action: 'DRAWER_OPENED_MANUALLY',
        limitInput: 1,
      });
      expect(twoDrawerRows.entries).toHaveLength(1);
      expect(twoDrawerRows.limit).toBe(1);
      expect(twoDrawerRows.truncated).toBe(true);

      const wholePage = await service.getLedger(tenantAId, {
        action: 'DRAWER_OPENED_MANUALLY',
        limitInput: 2,
      });
      expect(wholePage.entries).toHaveLength(2);
      expect(wholePage.truncated).toBe(false);
      // WARNING via the single classifier: supervised cash exposure.
      for (const entry of wholePage.entries) {
        expect(entry.severity).toBe('WARNING');
      }
      // Unknown-code fallback: SALE_CANCEL is NOT in the classifier table
      // and must degrade to INFO, never be invented into a higher bucket.
      const fallback = await service.getLedger(tenantAId, {
        action: 'SALE_CANCEL',
      });
      expect(fallback.entries.map((e) => e.id)).toEqual([logA6Id]);
      expect(fallback.entries[0].severity).toBe('INFO');
    });
  });

  describe('GET /operations/audit/integrity read model', () => {
    it('returns tenant A only its own nightly gap alert on the identical shared signature', async () => {
      const result = await service.getIntegrityAlerts(tenantAId);

      // VACUITY GUARD: tenant B holds an alert with the SAME device, actor
      // stream coordinates and signature — a dropped tenant predicate
      // returns two alerts here.
      expect(result.alerts.map((a) => a.id)).toEqual([alertAId]);
      expect(result.alerts[0]).toEqual({
        id: alertAId,
        deviceId: SHARED_DEVICE_ID,
        actorUserId: userA1Id,
        gapStart: 41,
        gapEnd: 44,
        firstDetectedAt: '2026-09-01T08:00:00.000Z',
        lastSeenAt: '2026-09-02T08:00:00.000Z',
      });
      // The signature is a hash-derived forensic dedupe key: never on the wire.
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain(SHARED_SIGNATURE);
      expect(serialized).not.toContain('signature');
    });

    it('shows tenant B only its own alert (triangulation)', async () => {
      const result = await service.getIntegrityAlerts(tenantBId);
      expect(result.alerts.map((a) => a.id)).toEqual([alertBId]);
      expect(result.alerts[0].actorUserId).toBe(userB1Id);
    });
  });
});
