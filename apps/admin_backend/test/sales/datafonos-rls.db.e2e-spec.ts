import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { TENANT_CONTEXT_SET_CONFIG_SQL } from '../../src/core/database/tenant-transaction';
import { createMigrationBuiltSchemaFixture } from '../support/migration-built-schema.helper';
import { normalizeTenantSlug } from '../../src/modules/tenant/tenant-slug';

/**
 * Issue #512 T3 slice 8: tenant isolation for the `datafonos_equipos`
 * table (the card-terminal equipment registry).
 *
 * The schema is built by RUNNING THE FULL MIGRATION SET (via
 * test/support/migration-built-schema.helper.ts), so the RLS shape asserted
 * here is migration 1809320000000's own output — never a hand-written copy.
 * The application-shaped connection is the fixture's runtime role:
 * `NOSUPERUSER NOBYPASSRLS`, owner of nothing, holding exactly ordinary
 * SELECT/INSERT/UPDATE/DELETE on the scratch schema's tables. Under FORCEd
 * row-level security every query it makes is subject to the migrated
 * policies; the superuser connection exists only to seed tenants and the
 * fixture rows.
 *
 * Every runtime-role observation runs inside a transaction that binds the
 * tenant context with the production SQL (TENANT_CONTEXT_SET_CONFIG_SQL,
 * transaction-local) and is then ROLLED BACK: the GUC is discarded with the
 * transaction, so the pool is never left with a defined-and-empty
 * `app.tenant_id` (the issue #358 poisoning), and the runtime role never
 * mutates the fixtures. An insert "success" is proven inside its own
 * transaction — the statement returning a row IS the WITH CHECK passing.
 *
 * Real-schema constraint hygiene (nothing may mask the RLS verdict):
 * - `datafonos_equipos.tenant_id` is `uuid NOT NULL` (born uuid in
 *   1759000000005-CreateBootstrapSalesTables:10) with NO tenant FK — the
 *   policies compare against the transaction-local GUC, and tenant rows are
 *   seeded anyway to mirror every other slice's harness.
 * - The table carries a unique `(tenant_id, terminal_id_banco)` index
 *   (uq_datafonos_equipos_tenant_terminal), so two tenants CAN hold the
 *   same bank terminal id — the identical-terminal cross-tenant case below
 *   is ordinary production data, not a constraint violation.
 * - Every NOT NULL column (nombre, banco_adquirente, numero_afiliacion,
 *   terminal_id_banco) is supplied by the insert proofs, so each proof
 *   fails (or passes) on RLS alone, never on a missing NOT NULL value.
 * - The measured production access surface is empty (the entity is
 *   registered in TypeORM modules but no repository, service, or raw SQL
 *   consumes the table), so this spec is the table's only consumer-shaped
 *   contract: it pins that the policies exist and bind exactly one tenant.
 */

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: Number(process.env.DB_PORT?.trim() ?? 5432),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: process.env.DB_PASSWORD?.trim() ?? 'postgres',
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

const poolCleanupExtra = { extra: { allowExitOnIdle: true } };

/**
 * Runs `assertion` on the runtime role inside a rolled-back transaction,
 * bound to `tenantId` through the production set_config binding (or
 * genuinely unbound when `tenantId` is null).
 */
async function asRuntimeRole<T>(
  runtime: DataSource,
  tenantId: string | null,
  assertion: (
    runner: ReturnType<DataSource['createQueryRunner']>,
  ) => Promise<T>,
): Promise<T> {
  const runner = runtime.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    if (tenantId !== null) {
      await runner.query(TENANT_CONTEXT_SET_CONFIG_SQL, [tenantId]);
    }
    return await assertion(runner);
  } finally {
    await runner.rollbackTransaction();
    await runner.release();
  }
}

/**
 * TypeORM's postgres query runner hands DML-with-RETURNING results back as
 * `[rows, affectedRowCount]` while SELECTs arrive as a plain rows array.
 * Normalizes both shapes to the rows array so assertions read on `id`.
 */
function returningRows(
  result: unknown,
): Array<{ id: string; tenant_id?: string }> {
  if (Array.isArray(result) && Array.isArray(result[0])) {
    return result[0] as Array<{ id: string }>;
  }
  return (Array.isArray(result) ? result : []) as Array<{ id: string }>;
}

describe('datafonos_equipos tenant RLS (Real PostgreSQL DB, migration-built schema)', () => {
  jest.setTimeout(180000);

  let admin: DataSource;
  let runtime: DataSource;
  let schema: string;
  let fixture: Awaited<ReturnType<typeof createMigrationBuiltSchemaFixture>>;

  // A and B own the seeded probes; C and D are fresh synthetic tenant
  // contexts for the INSERT proofs (an own-tenant INSERT bound to A or B
  // would sit next to seeded rows, and C/D keep the WITH CHECK proofs free
  // of interference). Tenants exist as real rows to mirror the harness.
  const tenantAId = randomUUID();
  const tenantBId = randomUUID();
  const tenantCId = randomUUID();
  const tenantDId = randomUUID();

  // Two tenants holding an IDENTICAL bank terminal id: the unique index is
  // per tenant, so this is ordinary production data for a card-terminal
  // registry.
  const SHARED_TERMINAL_ID = 'BAC-TERMINAL-SHARED-0001';

  // Seeded probe rows, one per tenant (A and B).
  const equipoAId = randomUUID();
  const equipoBId = randomUUID();

  beforeAll(async () => {
    fixture = await createMigrationBuiltSchemaFixture();
    schema = fixture.schema;
    process.stdout.write(
      `[timing] migration-built setup = ${fixture.setupDurationMs} ms (migrations alone: ${fixture.migrationDurationMs} ms)\n`,
    );

    // Superuser connection: seeding and catalog facts only. It bypasses the
    // FORCED row-level security, which is what makes cross-tenant seeding
    // possible. search_path is pinned so unqualified SQL lands in the
    // scratch schema.
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

    // Real tenant rows first, mirroring every other slice's harness.
    await admin.query(
      `INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $9), ($3, $4, $10), ($5, $6, $11), ($7, $8, $12)`,
      [
        tenantAId,
        'datafonos-rls-tenant-a',
        tenantBId,
        'datafonos-rls-tenant-b',
        tenantCId,
        'datafonos-rls-tenant-c',
        tenantDId,
        'datafonos-rls-tenant-d',
                normalizeTenantSlug('datafonos-rls-tenant-a'),
        normalizeTenantSlug('datafonos-rls-tenant-b'),
        normalizeTenantSlug('datafonos-rls-tenant-c'),
        normalizeTenantSlug('datafonos-rls-tenant-d'),
      ],
    );

    // Seeded probes, one identical-terminal equipment row per tenant A and B.
    await admin.query(
      `INSERT INTO datafonos_equipos (id, tenant_id, nombre, banco_adquirente, numero_afiliacion, terminal_id_banco)
       VALUES ($1, $2, 'Terminal A', 'BAC', 'AFIL-A', $4),
              ($3, $5, 'Terminal B', 'BAC', 'AFIL-A', $4)`,
      [equipoAId, tenantAId, equipoBId, SHARED_TERMINAL_ID, tenantBId],
    );

    // The fixture's runtime role: NOSUPERUSER NOBYPASSRLS, non-owner, exact
    // ordinary DML grants. Production-shaped for RLS evaluation.
    runtime = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      username: fixture.runtimeRoleName,
      password: fixture.runtimeRolePassword,
      ...poolCleanupExtra,
    });
    await runtime.initialize();
  });

  afterAll(async () => {
    if (runtime?.isInitialized) await runtime.destroy();
    if (admin?.isInitialized) await admin.destroy();
    if (fixture) await fixture.close();
  });

  it('seeds both tenants through the superuser and proves the runtime role is a table non-owner that cannot bypass RLS', async () => {
    const seeded = await admin.query(
      `SELECT (SELECT count(*)::int FROM datafonos_equipos) AS equipo_count`,
    );
    expect(seeded[0]).toEqual({ equipo_count: 2 });

    const role = (
      await admin.query(
        `SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1`,
        [fixture.runtimeRoleName],
      )
    )[0];
    expect(role).toBeDefined();
    expect(role.rolsuper).toBe(false);
    expect(role.rolbypassrls).toBe(false);

    const ownership = await admin.query(
      `SELECT count(*)::int AS count
         FROM pg_tables
        WHERE schemaname = $1
          AND tablename IN ('datafonos_equipos')
          AND tableowner = $2`,
      [schema, fixture.runtimeRoleName],
    );
    expect(ownership[0].count).toBe(0);
  });

  it('enables AND forces row level security with exactly one command-specific policy per command (4 total)', async () => {
    const facts = await admin.query(
      `SELECT c.relname, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1
          AND c.relname IN ('datafonos_equipos')
        ORDER BY c.relname`,
      [schema],
    );

    expect(facts).toEqual([
      { relname: 'datafonos_equipos', rls_enabled: true, rls_forced: true },
    ]);

    const policies = await admin.query(
      `SELECT tablename, policyname, cmd FROM pg_policies
        WHERE schemaname = $1 AND tablename IN ('datafonos_equipos')
        ORDER BY tablename, policyname`,
      [schema],
    );
    // EXACTLY the four command policies: an extra policy would widen access
    // beyond the tenant contract, a missing one narrows it.
    expect(policies).toEqual([
      { tablename: 'datafonos_equipos', policyname: 'datafonos_equipos_tenant_delete', cmd: 'DELETE' },
      { tablename: 'datafonos_equipos', policyname: 'datafonos_equipos_tenant_insert', cmd: 'INSERT' },
      { tablename: 'datafonos_equipos', policyname: 'datafonos_equipos_tenant_select', cmd: 'SELECT' },
      { tablename: 'datafonos_equipos', policyname: 'datafonos_equipos_tenant_update', cmd: 'UPDATE' },
    ]);
  });

  it('denies an unbound runtime role every row of the table', async () => {
    await asRuntimeRole(runtime, null, async (runner) => {
      const equipos = (await runner.query(
        `SELECT count(*)::int AS count FROM datafonos_equipos`,
      )) as Array<{ count: number }>;
      expect(equipos[0].count).toBe(0);
    });
  });

  it('shows tenant A only its own equipment rows, never tenant B’s', async () => {
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      const equipos = (await runner.query(
        `SELECT id FROM datafonos_equipos`,
      )) as Array<{ id: string }>;
      expect(equipos.map((r) => r.id)).toEqual([equipoAId]);
    });
  });

  it('shows tenant B only its own rows (triangulation)', async () => {
    await asRuntimeRole(runtime, tenantBId, async (runner) => {
      const equipos = (await runner.query(
        `SELECT id FROM datafonos_equipos`,
      )) as Array<{ id: string }>;
      expect(equipos.map((r) => r.id)).toEqual([equipoBId]);
    });
  });

  it('accepts a tenant-bound runtime role inserting its own equipment row', async () => {
    // Bound to tenant C: the own-tenant INSERT is the WITH CHECK half
    // passing. Proven inside the rolled-back transaction — the statement
    // returning its row IS the success.
    await asRuntimeRole(runtime, tenantCId, async (runner) => {
      const inserted = returningRows(
        await runner.query(
          `INSERT INTO datafonos_equipos (tenant_id, nombre, banco_adquirente, numero_afiliacion, terminal_id_banco)
           VALUES ($1, 'Insert proof', 'BANPRO', 'AFIL-C', 'BAC-TERMINAL-C-0001') RETURNING id, tenant_id`,
          [tenantCId],
        ),
      );
      expect(inserted).toHaveLength(1);
      expect(inserted[0].tenant_id).toBe(tenantCId);
    });
  });

  it('rejects a tenant-bound runtime role inserting a foreign-tenant equipment row', async () => {
    // Bound to tenant C, inserting tenant D: a fresh synthetic foreign
    // value, so pre-policy the write itself goes through and post-policy
    // the WITH CHECK clause rejects it. One statement per transaction: the
    // RLS rejection aborts the transaction it happens in.
    await asRuntimeRole(runtime, tenantCId, async (runner) => {
      await expect(
        runner.query(
          `INSERT INTO datafonos_equipos (tenant_id, nombre, banco_adquirente, numero_afiliacion, terminal_id_banco)
           VALUES ($1, 'Foreign proof', 'BANPRO', 'AFIL-D', 'BAC-TERMINAL-D-0001') RETURNING id`,
          [tenantDId],
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it('lets tenant A update and delete its own equipment rows', async () => {
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      const updated = returningRows(
        await runner.query(
          `UPDATE datafonos_equipos SET ip_address = '10.0.0.8' WHERE id = $1 RETURNING id`,
          [equipoAId],
        ),
      );
      expect(updated.map((r) => r.id)).toEqual([equipoAId]);

      // Delete of a throwaway own row: insert then delete inside the same
      // transaction, proving DELETE's USING clause admits tenant A's rows.
      const throwaway = returningRows(
        await runner.query(
          `INSERT INTO datafonos_equipos (tenant_id, nombre, banco_adquirente, numero_afiliacion, terminal_id_banco)
           VALUES ($1, 'Delete proof', 'BAC', 'AFIL-A', 'BAC-TERMINAL-A-DEL') RETURNING id`,
          [tenantAId],
        ),
      );
      const deleted = returningRows(
        await runner.query(
          `DELETE FROM datafonos_equipos WHERE id = $1 RETURNING id`,
          [throwaway[0].id],
        ),
      );
      expect(deleted.map((r) => r.id)).toEqual([throwaway[0].id]);
    });
  });

  it('stops tenant A’s UPDATE and DELETE from touching tenant B’s rows', async () => {
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      const updated = returningRows(
        await runner.query(
          `UPDATE datafonos_equipos SET ip_address = '10.0.0.9' WHERE id = $1 RETURNING id`,
          [equipoBId],
        ),
      );
      expect(updated).toEqual([]);

      const deleted = returningRows(
        await runner.query(
          `DELETE FROM datafonos_equipos WHERE id = $1 RETURNING id`,
          [equipoBId],
        ),
      );
      expect(deleted).toEqual([]);
    });
  });

  describe('identical-terminal cross-tenant isolation (issue #512 T3 slice 8)', () => {
    // VACUITY GUARD — what each assertion below would look like if row level
    // security were ABSENT on this table (or bypassed by the role):
    //
    //   SELECT id FROM datafonos_equipos WHERE terminal_id_banco = <shared>
    //     -> TWO rows — both tenants' equipment rows for the identical
    //        terminal id (the unique index is per tenant, so both exist).
    //   UPDATE datafonos_equipos SET ... WHERE terminal_id_banco = <shared>
    //        RETURNING id
    //     -> TWO rows — tenant A would mutate tenant B's equipment registry
    //        entry through the terminal id.
    //   INSERT with tenant_id = tenantAId while bound to tenant C
    //     -> ACCEPTED — a row lands in tenant A's registry without binding.
    //
    // Every `toEqual` below pins EXACTLY ONE id (or zero rows), so a missing
    // or bypassed policy makes these tests fail on the extra foreign row —
    // they cannot pass vacuously.
    it('returns each tenant exactly its own equipment row on a terminal lookup, never the other tenant’s identical terminal', async () => {
      await asRuntimeRole(runtime, tenantAId, async (runner) => {
        const rows = (await runner.query(
          `SELECT id FROM datafonos_equipos WHERE terminal_id_banco = $1`,
          [SHARED_TERMINAL_ID],
        )) as Array<{ id: string }>;
        expect(rows.map((r) => r.id)).toEqual([equipoAId]);
      });

      await asRuntimeRole(runtime, tenantBId, async (runner) => {
        const rows = (await runner.query(
          `SELECT id FROM datafonos_equipos WHERE terminal_id_banco = $1`,
          [SHARED_TERMINAL_ID],
        )) as Array<{ id: string }>;
        expect(rows.map((r) => r.id)).toEqual([equipoBId]);
      });
    });

    it('scopes a terminal-keyed UPDATE to the bound tenant’s own equipment row only', async () => {
      // A terminal-keyed write mirrors a POS device sync updating the
      // terminal's connection details; under an absent policy it would
      // RETURN both tenants' ids and overwrite B's registry entry.
      await asRuntimeRole(runtime, tenantAId, async (runner) => {
        const updated = returningRows(
          await runner.query(
            `UPDATE datafonos_equipos SET ip_address = '10.0.0.10'
              WHERE terminal_id_banco = $1 RETURNING id`,
            [SHARED_TERMINAL_ID],
          ),
        );
        expect(updated.map((r) => r.id)).toEqual([equipoAId]);
      });
    });

    it('rejects a foreign-tenant INSERT carrying the identical terminal id', async () => {
      // Bound to C, writing tenant A's tenant_id with the shared terminal:
      // the values match A's row textually, and only the WITH CHECK half
      // stands between this statement and A's equipment registry. One
      // statement per transaction: the RLS rejection aborts the transaction
      // it happens in.
      await asRuntimeRole(runtime, tenantCId, async (runner) => {
        await expect(
          runner.query(
            `INSERT INTO datafonos_equipos (tenant_id, nombre, banco_adquirente, numero_afiliacion, terminal_id_banco)
             VALUES ($1, 'Hijack proof', 'BAC', 'AFIL-A', $2) RETURNING id`,
            [tenantAId, SHARED_TERMINAL_ID],
          ),
        ).rejects.toThrow(/row-level security/i);
      });
    });
  });
});
