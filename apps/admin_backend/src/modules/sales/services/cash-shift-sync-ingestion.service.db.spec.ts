import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { createMigrationBuiltSchemaFixture } from '../../../../test/support/migration-built-schema.helper';
import { normalizeTenantSlug } from '../../tenant/tenant-slug';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { CashShiftSession } from '../entities/cash-shift.entity';
import { CashMovement } from '../entities/cash-movement.entity';
import { User } from '../../identity/entities/user.entity';
import { SecurityProfile } from '../../identity/entities/security-profile.entity';
import { CashShiftSyncIngestionService } from './cash-shift-sync-ingestion.service';
import type { CashShiftSessionSyncItemDto } from '../dto/cash-shift-sync.dto';

/**
 * DB-backed integration spec for the cash shift sync ingestion's voucher
 * counts (backlog #68, slice S2). The schema is built by the FULL
 * migration set (never `synchronize: true`), so the `cash_shift_sessions`
 * table carries exactly the columns production runs — including the three
 * nullable `card_vouchers_*` columns added by
 * 1809580000000-AddCardVoucherCountsToCashShiftSessions — plus the FORCE
 * RLS policies from 1809290000000. The service executes through the
 * fixture's dedicated runtime role (NOSUPERUSER, NOBYPASSRLS) inside
 * `runInTenantTransaction`'s transaction-local `app.tenant_id` binding, so
 * the tenant scoping asserted here is enforced by PostgreSQL, not a mock.
 *
 * Row state is always asserted through the bootstrap superuser connection,
 * which bypasses RLS and therefore sees the raw table.
 */

const TEST_TIMEOUT_MS = 180000;

function posSession(
  id: string,
  overrides: Partial<CashShiftSessionSyncItemDto> = {},
): CashShiftSessionSyncItemDto {
  return {
    id,
    terminalId: 'term-1',
    cashierId: 'user-1',
    openedAt: '2026-01-01T12:00:00.000Z',
    status: 'CLOSED',
    closedAt: '2026-01-01T20:00:00.000Z',
    initialFloatNio: 5000,
    initialFloatUsd: 0,
    expectedCashNio: 5000,
    expectedCashUsd: 0,
    finalCountedNio: 5200,
    differenceNio: 200,
    ...overrides,
  } as CashShiftSessionSyncItemDto;
}

interface SessionRowSnapshot {
  status: string;
  card_vouchers_pending: number | null;
  card_vouchers_reconciled: number | null;
  card_vouchers_overridden: number | null;
  final_counted_nio: string | null;
  z_report_sequence: number | null;
}

describe('CashShiftSyncIngestionService (db - Real PostgreSQL, migration-built schema, RLS enforced)', () => {
  jest.setTimeout(TEST_TIMEOUT_MS);
  const tenantAId = randomUUID();
  const tenantBId = randomUUID();

  // Session ids are uuid in the cloud table (the POS local session id is
  // the uuid generated on-device at shift open).
  const sessionA1Id = randomUUID(); // tenant A, closed happy path with counts
  const sessionA2Id = randomUUID(); // tenant A, legacy payload without counts
  const sessionA3Id = randomUUID(); // tenant A, OPEN then CLOSED replay
  const sessionAPreExistingId = randomUUID(); // tenant A, cross-tenant probe

  let fixture: Awaited<ReturnType<typeof createMigrationBuiltSchemaFixture>>;
  /** Superuser connection: seeds fixtures and asserts raw row state. */
  let bootstrap: DataSource;
  /** The application-like connection: NOSUPERUSER, NOBYPASSRLS. */
  let runtime: DataSource;
  let service: CashShiftSyncIngestionService;

  const snapshotSession = async (
    sessionId: string,
  ): Promise<SessionRowSnapshot> => {
    const rows = await bootstrap.query<SessionRowSnapshot[]>(
      `SELECT status::text AS status, card_vouchers_pending,
              card_vouchers_reconciled, card_vouchers_overridden,
              final_counted_nio::text AS final_counted_nio,
              z_report_sequence
         FROM cash_shift_sessions
        WHERE id = $1`,
      [sessionId],
    );
    expect(rows).toHaveLength(1);
    return rows[0];
  };

  beforeAll(async () => {
    fixture = await createMigrationBuiltSchemaFixture();
    process.stdout.write(
      `[timing] migration-built setup = ${fixture.setupDurationMs} ms (migrations alone: ${fixture.migrationDurationMs} ms)\n`,
    );

    bootstrap = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
      port: Number(process.env.DB_PORT?.trim() ?? 5432),
      username: process.env.DB_USERNAME?.trim() ?? 'postgres',
      password: process.env.DB_PASSWORD?.trim() ?? 'postgres',
      database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
      extra: {
        allowExitOnIdle: true,
        max: 2,
        options: `-c search_path=${fixture.schema},public -c statement_timeout=15000`,
      },
    });
    await bootstrap.initialize();

    await bootstrap.query(
      `INSERT INTO tenants (id, name, slug, created_at, updated_at) VALUES
         ($1, 'Tenant A', $3, now(), now()),
         ($2, 'Tenant B', $4, now(), now())`,
      [
        tenantAId,
        tenantBId,
        normalizeTenantSlug('Tenant A'),
        normalizeTenantSlug('Tenant B'),
      ],
    );
    // A pre-existing tenant-A session used as the cross-tenant collision
    // probe: its id is claimed again by tenant B later.
    await bootstrap.query(
      `INSERT INTO cash_shift_sessions (
         id, tenant_id, terminal_id, cashier_id, cashier_name, opened_at,
         status, card_vouchers_pending
       ) VALUES ($1, $2, 'term-1', 'user-1', 'user-1', now(), 'CLOSED', 1)`,
      [sessionAPreExistingId, tenantAId],
    );

    runtime = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
      port: Number(process.env.DB_PORT?.trim() ?? 5432),
      username: fixture.runtimeRoleName,
      password: fixture.runtimeRolePassword,
      database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
      entities: [Tenant, User, SecurityProfile, CashShiftSession, CashMovement],
      extra: {
        allowExitOnIdle: true,
        max: 2,
        options: '-c statement_timeout=15000',
      },
    });
    await runtime.initialize();

    service = new CashShiftSyncIngestionService(
      runtime,
      runtime.getRepository(CashShiftSession),
      runtime.getRepository(CashMovement),
    );
  });

  afterAll(async () => {
    if (runtime?.isInitialized) {
      await runtime.destroy();
    }
    if (bootstrap?.isInitialized) {
      await bootstrap.destroy();
    }
    await fixture?.close();
  });

  it(
    'happy path: a closed session with voucher counts persists them on the real row',
    async () => {
      const result = await service.ingestCashShiftBatch(tenantAId, {
        sessions: [
          posSession(sessionA1Id, {
            cardVouchersPending: 2,
            cardVouchersReconciled: 3,
            cardVouchersOverridden: 1,
            zReportSequence: 7,
          }),
        ],
        movements: [],
      });

      expect(result).toMatchObject({
        received: 1,
        processed: 1,
        failed: 0,
        results: [{ idempotencyKey: sessionA1Id, status: 'ACCEPTED' }],
      });

      const row = await snapshotSession(sessionA1Id);
      expect(row.status).toBe('CLOSED');
      expect(row.card_vouchers_pending).toBe(2);
      expect(row.card_vouchers_reconciled).toBe(3);
      expect(row.card_vouchers_overridden).toBe(1);
      expect(row.final_counted_nio).toBe('5200.0000');
      expect(row.z_report_sequence).toBe(7);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'legacy payload without voucher counts persists NULL columns, never fabricated zeros',
    async () => {
      const result = await service.ingestCashShiftBatch(tenantAId, {
        sessions: [posSession(sessionA2Id)],
        movements: [],
      });

      expect(result.failed).toBe(0);
      const row = await snapshotSession(sessionA2Id);
      expect(row.status).toBe('CLOSED');
      expect(row.card_vouchers_pending).toBeNull();
      expect(row.card_vouchers_reconciled).toBeNull();
      expect(row.card_vouchers_overridden).toBeNull();
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'OPEN -> CLOSED replay: the closed push carries the counts and a genuine zero overwrites NULL',
    async () => {
      const openResult = await service.ingestCashShiftBatch(tenantAId, {
        sessions: [posSession(sessionA3Id, { status: 'OPEN', closedAt: undefined })],
        movements: [],
      });
      expect(openResult.failed).toBe(0);

      // The open push carried no counts: the columns stay NULL.
      const afterOpen = await snapshotSession(sessionA3Id);
      expect(afterOpen.status).toBe('OPEN');
      expect(afterOpen.card_vouchers_pending).toBeNull();

      const closedResult = await service.ingestCashShiftBatch(tenantAId, {
        sessions: [
          posSession(sessionA3Id, {
            cardVouchersPending: 0,
            cardVouchersReconciled: 4,
            cardVouchersOverridden: 0,
          }),
        ],
        movements: [],
      });
      expect(closedResult.failed).toBe(0);

      const afterClose = await snapshotSession(sessionA3Id);
      expect(afterClose.status).toBe('CLOSED');
      // A zero count is data, distinct from the NULL it replaces: the
      // dashboard must see "reconciled everything, nothing pending".
      expect(afterClose.card_vouchers_pending).toBe(0);
      expect(afterClose.card_vouchers_reconciled).toBe(4);
      expect(afterClose.card_vouchers_overridden).toBe(0);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'idempotent replay: the exact same closed-session batch run twice leaves identical persisted counts and never duplicates rows',
    async () => {
      const batch = {
        sessions: [
          posSession(sessionA1Id, {
            cardVouchersPending: 2,
            cardVouchersReconciled: 3,
            cardVouchersOverridden: 1,
          }),
        ],
        movements: [],
      };

      const first = await service.ingestCashShiftBatch(tenantAId, batch);
      const afterFirst = await snapshotSession(sessionA1Id);

      const second = await service.ingestCashShiftBatch(tenantAId, batch);
      const afterSecond = await snapshotSession(sessionA1Id);

      expect(first.failed).toBe(0);
      expect(second.failed).toBe(0);
      // Upsert by id: still exactly one row per session.
      const count = await bootstrap.query<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM cash_shift_sessions WHERE id = $1`,
        [sessionA1Id],
      );
      expect(count).toEqual([{ n: 1 }]);
      expect(afterSecond).toEqual(afterFirst);
      expect(afterFirst.card_vouchers_pending).toBe(2);
      expect(afterFirst.card_vouchers_reconciled).toBe(3);
      expect(afterFirst.card_vouchers_overridden).toBe(1);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'tenant isolation: a session id already recorded by tenant A cannot be rewritten by tenant B, and the row is untouched',
    async () => {
      const before = await snapshotSession(sessionAPreExistingId);

      const result = await service.ingestCashShiftBatch(tenantBId, {
        sessions: [
          posSession(sessionAPreExistingId, {
            cardVouchersPending: 99,
            cardVouchersReconciled: 99,
            cardVouchersOverridden: 99,
          }),
        ],
        movements: [],
      });

      expect(result.received).toBe(1);
      expect(result.processed).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.results[0].idempotencyKey).toBe(sessionAPreExistingId);
      expect(result.results[0].status).toBe('FAILED');

      // Tenant A's row (and its real voucher counts) survived untouched.
      expect(await snapshotSession(sessionAPreExistingId)).toEqual(before);
    },
    TEST_TIMEOUT_MS,
  );
});
