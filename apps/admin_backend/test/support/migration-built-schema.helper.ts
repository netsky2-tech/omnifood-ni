import { randomUUID } from 'crypto';
import { resolve } from 'path';
import { DataSource } from 'typeorm';

/**
 * Builds a scratch schema by running the FULL migration set — the same
 * `!(*.spec).{ts,js}` glob the production data source resolves — as a
 * dedicated restricted role, and hands the caller a reader role that cannot
 * bypass RLS.
 *
 * Why this exists (issue #418): DB specs that build their schema with
 * `synchronize: true` construct the schema the ENTITIES describe, so when an
 * entity and the migrated schema disagree the test never sees what production
 * has. Bugs #286, #358 and #412 all shipped through that hole. This helper
 * makes the migrations — not the entities — the schema's source of truth for
 * a spec.
 *
 * Deliberate decisions, following
 * src/modules/identity/human-authorization/runtime/ohac-publication-db.fixture.ts
 * and scripts/verify-schema-build.sh:
 *
 * - A fresh per-run scratch SCHEMA inside the database the runner provides via
 *   DB_DATABASE; cleanup drops the schema and both roles. Random suffixes make
 *   concurrent runs safe, and stale `migbuilt_*` objects from earlier failed
 *   runs are cleaned up before provisioning.
 * - `uuid-ossp` is ensured by the ADMINISTRATOR connection, mirroring
 *   scripts/verify-schema-build.sh: extensions are infrastructure provisioned
 *   ahead of the migrations, so the migration role never needs extension
 *   privileges. LOAD-BEARING DETAIL: `CREATE EXTENSION "uuid-ossp"`
 *   (1759000000003-CreateBootstrapExtensions.ts:28) has no SCHEMA clause, so
 *   the extension lives in `public` and `uuid_generate_v4()` — used by
 *   1788000000000-CreateImportStagingTable.ts — only resolves if `public` is
 *   on the search_path. Both roles therefore pin `"<schema>", public`, and the
 *   `, public` part is NOT cosmetic.
 * - KNOWN NON-IDEMPOTENCE (documented, deliberately not fixed): the bootstrap
 *   enum guards hardcode `n.nspname = 'public'` (1759000000001:58,
 *   1759000000002:72,86,100,119, 1759000000004:54). Under a scratch
 *   search_path the guard never sees the type it just created in the scratch
 *   schema, so it re-issues `CREATE TYPE`: harmless on a first (and only)
 *   run into a fresh schema, but a re-run of the migration set into the SAME
 *   schema fails with `type already exists`. This helper is therefore
 *   one-shot: one fresh schema per call, never re-run into the same schema.
 * - PUBLIC-SCOPED ENUM GUARDS (documented workaround for a verified trap,
 *   not a design): the bootstrap enum guards look only at `public`
 *   (1759000000001:58, 1759000000002:72,86,100,119, 1759000000004:54). In a
 *   PROVISIONED database (the shared local `omnifood`), `public` already
 *   holds the bootstrap enum types, so the guards SKIP creating them and the
 *   scratch schema would have no such type — every unqualified reference then
 *   binds to `public`'s type, which the migration role does not own, and
 *   1802000000000's `ALTER TYPE products_product_type_enum ADD VALUE` fails
 *   with `must be owner of type ...`. In a FRESH database (CI), `public` has
 *   no such types, the guards correctly create them in the scratch schema,
 *   and nothing is needed. The helper therefore mirrors `public`'s enum
 *   types into the scratch schema — same members, owned by the migration
 *   role so the later ADD VALUE succeeds — ONLY for types that exist in
 *   `public` and not yet in the scratch schema: the clone list is empty in a
 *   fresh database and non-empty in a provisioned one. The real fix would be
 *   bootstrap guards that resolve their schema instead of naming `public`.
 * - UP-ONLY: the bootstrap migrations hardcode `public` in their rollback
 *   paths, so `down()` is off limits. The helper runs `up()` only — the
 *   schema is torn down by dropping it, never by rolling back.
 * - The full migration set runs as a dedicated migration role (`LOGIN
 *   NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`) through
 *   TypeORM's own executor (`runMigrations()`), which works under the pinned
 *   search_path: the executor creates its `migrations` ledger inside the
 *   scratch schema because the role-level `search_path` resolves every
 *   unqualified statement there. The role owns what it creates, so no extra
 *   grants are needed for the migrations themselves.
 * - The READER role is a second, separate role — not the migration role — even
 *   though `FORCE ROW LEVEL SECURITY` (set by 1782000000000 and others) would
 *   bind the owner too. The reader must never be able to mutate fixtures: the
 *   table owner could (RLS restricts it tenant-wise, but it remains the
 *   owner), so the reader receives USAGE on the schema and SELECT on every
 *   table, and nothing else. Its role-level search_path is pinned like the
 *   migration role's because raw SQL ignores TypeORM's schema option; pooled
 *   connections resolve unqualified SQL exactly as production does.
 */
export interface MigrationBuiltSchemaFixture {
  readonly schema: string;
  /** Role that ran the migrations; owns the scratch schema's objects. */
  readonly migrationRoleName: string;
  /** Separate SELECT-only role for RLS-bound reads; never a table owner. */
  readonly readerRoleName: string;
  readonly readerRolePassword: string;
  /**
   * Least-privilege DML role for the application under test: non-superuser,
   * non-bypassing, non-owner, scoped to the scratch schema. Ordinary
   * SELECT/INSERT/UPDATE/DELETE plus the sequence USAGE ordinary DML needs;
   * never TRUNCATE, CREATE, ownership, migration-ledger access, role
   * management, or public-schema DML (issue #429).
   */
  readonly runtimeRoleName: string;
  readonly runtimeRolePassword: string;
  /** Measured wall-clock of the whole setup, in milliseconds. */
  readonly setupDurationMs: number;
  /** Measured wall-clock of the migration run alone, in milliseconds. */
  readonly migrationDurationMs: number;
  /**
   * Drops the scratch schema and both roles. Callers MUST destroy their own
   * DataSources (reader and admin) first: sessions block DROP ROLE, and open
   * connections would keep the schema's objects alive.
   */
  close(): Promise<void>;
}

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: Number(process.env.DB_PORT?.trim() ?? 5432),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: process.env.DB_PASSWORD?.trim() ?? 'postgres',
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

const PREFIX = 'migbuilt';

export async function createMigrationBuiltSchemaFixture(): Promise<MigrationBuiltSchemaFixture> {
  const setupStartedAt = Date.now();
  const suffix = randomUUID().replace(/-/g, '');
  const schema = `${PREFIX}_${suffix}`;
  const migrationRoleName = `${PREFIX}_migr_${suffix}`;
  const readerRoleName = `${PREFIX}_read_${suffix}`;
  const runtimeRoleName = `${PREFIX}_app_${suffix}`;
  const migrationRolePassword = randomUUID();
  const readerRolePassword = randomUUID();
  const runtimeRolePassword = randomUUID();

  const admin = new DataSource({
    type: 'postgres',
    ...postgresConnection,
    extra: { max: 2, allowExitOnIdle: true },
  });

  // Stale-run cleanup: earlier runs could leak their roles/schema when
  // provisioning failed partway. Underscores in the prefix are escaped so the
  // pattern matches literally; backends are terminated first so DROP ROLE
  // cannot fail on live sessions.
  const staleCleanup = async (): Promise<void> => {
    await admin.query(`
      DO $stale_cleanup$
      DECLARE
        stale record;
      BEGIN
        PERFORM pg_terminate_backend(pid)
          FROM pg_stat_activity
         WHERE usename LIKE 'migbuilt\\_%' ESCAPE '\\'
           AND pid <> pg_backend_pid();
        FOR stale IN
          SELECT nspname AS name FROM pg_namespace
           WHERE nspname LIKE 'migbuilt\\_%' ESCAPE '\\'
        LOOP
          EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE', stale.name);
        END LOOP;
        FOR stale IN
          SELECT rolname AS name FROM pg_roles
           WHERE rolname LIKE 'migbuilt\\_%' ESCAPE '\\'
             AND rolname <> current_user
        LOOP
          -- CONNECT on the shared database is a database-level dependency
          -- (pg_shdepend) that blocks DROP ROLE; revoke it first. Roles of
          -- earlier failed runs may still carry it.
          EXECUTE format(
            'REVOKE CONNECT ON DATABASE %I FROM %I',
            current_database(), stale.name);
          EXECUTE format('DROP ROLE %I', stale.name);
        END LOOP;
      END
      $stale_cleanup$;
    `);
  };

  const dropAll = async (): Promise<void> => {
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    // CONNECT on the shared database is a pg_shdepend entry that blocks
    // DROP ROLE; the helper never grants it, but revoke defensively before
    // dropping.
    await admin.query(
      `REVOKE CONNECT ON DATABASE "${postgresConnection.database}" FROM "${migrationRoleName}"`,
    );
    await admin.query(
      `REVOKE CONNECT ON DATABASE "${postgresConnection.database}" FROM "${readerRoleName}"`,
    );
    await admin.query(
      `REVOKE CONNECT ON DATABASE "${postgresConnection.database}" FROM "${runtimeRoleName}"`,
    );
    await admin.query(`DROP ROLE IF EXISTS "${migrationRoleName}"`);
    await admin.query(`DROP ROLE IF EXISTS "${readerRoleName}"`);
    await admin.query(`DROP ROLE IF EXISTS "${runtimeRoleName}"`);
  };

  const destroyAdminQuietly = async (): Promise<void> => {
    try {
      await admin.destroy();
    } catch {
      // the original error, if any, takes precedence over cleanup failures
    }
  };

  await admin.initialize();

  let migrationDurationMs = 0;
  try {
    await staleCleanup();
    await admin.query(`CREATE SCHEMA "${schema}"`);

    // Extensions are infrastructure: ensured by the administrator exactly like
    // scripts/verify-schema-build.sh, so the migration's guarded
    // CREATE EXTENSION becomes a no-op and the migration role never needs
    // extension privileges.
    await admin.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await admin.query(
      `CREATE ROLE "${migrationRoleName}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD '${migrationRolePassword}'`,
    );
    // CONNECT is PUBLIC by default; an explicit grant would create a
    // pg_shdepend entry on the shared database that blocks DROP ROLE.
    await admin.query(
      `GRANT USAGE, CREATE ON SCHEMA "${schema}" TO "${migrationRoleName}"`,
    );
    // The ", public" is load-bearing: uuid-ossp was created in public (no
    // SCHEMA clause on CREATE EXTENSION), and uuid_generate_v4() only
    // resolves with public on the path. See the header note.
    await admin.query(
      `ALTER ROLE "${migrationRoleName}" SET search_path TO "${schema}", public`,
    );

    // TypeORM's own executor: it creates its migrations ledger inside the
    // scratch schema (the role-level search_path resolves unqualified SQL
    // there) and applies the exact same set production applies.
    const migrator = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      username: migrationRoleName,
      password: migrationRolePassword,
      synchronize: false,
      migrations: [
        resolve(__dirname, '../../src/migrations', '!(*.spec).{ts,js}'),
      ],
      extra: { max: 2, allowExitOnIdle: true },
    });
    await migrator.initialize();
    // Public-scoped enum guards, see the header note: mirror `public`'s enum
    // types into the scratch schema ONLY where they exist in `public` and not
    // in the scratch schema, owned by the migration role so a later
    // ALTER TYPE ... ADD VALUE succeeds. In a fresh database (CI) the list is
    // empty and the bootstrap guards create everything themselves.
    const publicEnumLabels = await migrator.query<
      Array<{ typname: string; enumlabel: string }>
    >(`
      SELECT t.typname, e.enumlabel
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        JOIN pg_enum e ON e.enumtypid = t.oid
       WHERE n.nspname = 'public'
       ORDER BY t.typname, e.enumsortorder
    `);
    const publicEnums = new Map<string, string[]>();
    for (const { typname, enumlabel } of publicEnumLabels) {
      const members = publicEnums.get(typname) ?? [];
      members.push(enumlabel);
      publicEnums.set(typname, members);
    }
    const scratchEnums = await migrator.query<Array<{ typname: string }>>(`
      SELECT t.typname
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = current_schema()
    `);
    const scratchEnumNames = new Set(scratchEnums.map((e) => e.typname));
    const clonedEnums: string[] = [];
    for (const [typname, members] of publicEnums) {
      if (scratchEnumNames.has(typname)) continue;
      const quoted = typname.replace(/"/g, '""');
      const memberList = members
        .map((m) => `'${m.replace(/'/g, "''")}'`)
        .join(', ');
      await migrator.query(`CREATE TYPE "${quoted}" AS ENUM (${memberList})`);
      clonedEnums.push(typname);
    }
    if (clonedEnums.length > 0) {
      process.stdout.write(
        `[migration-built] cloned ${clonedEnums.length} enum type(s) from public: ${clonedEnums.join(', ')}\n`,
      );
    }
    const migrationStartedAt = Date.now();
    await migrator.runMigrations();
    migrationDurationMs = Date.now() - migrationStartedAt;
    await migrator.destroy();

    // Separate SELECT-only reader role. See the header note for why it is not
    // the migration role even under FORCE ROW LEVEL SECURITY.
    await admin.query(
      `CREATE ROLE "${readerRoleName}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD '${readerRolePassword}'`,
    );
    await admin.query(
      `GRANT USAGE ON SCHEMA "${schema}" TO "${readerRoleName}"`,
    );
    await admin.query(
      `GRANT SELECT ON ALL TABLES IN SCHEMA "${schema}" TO "${readerRoleName}"`,
    );
    await admin.query(
      `ALTER ROLE "${readerRoleName}" SET search_path TO "${schema}", public`,
    );

    // Dedicated application runtime role (issue #429): the Nest application
    // must run with the privileges an ordinary production app role would
    // have — NOSUPERUSER NOBYPASSRLS — so the migrated RLS policies are
    // actually enforced instead of bypassed by a superuser connection. It
    // receives exactly what ordinary DML requires and nothing more:
    // - USAGE on the scratch schema (no CREATE, so it can never add objects);
    // - SELECT/INSERT/UPDATE/DELETE on the schema's tables (never TRUNCATE,
    //   never REFERENCES/TRIGGER);
    // - USAGE/SELECT on the schema's sequences (what nextval/currval need);
    // - NOTHING on the migrations ledger, so it cannot tamper with or drive
    //   the migration set.
    // It owns nothing: every object was created by the migration role, and
    // even under FORCE ROW LEVEL SECURITY a non-owner role is fully subject
    // to the policies. Its role-level search_path is pinned like the other
    // roles' because raw SQL ignores TypeORM's schema option.
    await admin.query(
      `CREATE ROLE "${runtimeRoleName}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD '${runtimeRolePassword}'`,
    );
    await admin.query(
      `GRANT USAGE ON SCHEMA "${schema}" TO "${runtimeRoleName}"`,
    );
    await admin.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "${schema}" TO "${runtimeRoleName}"`,
    );
    // The migrations ledger is infrastructure, not application data: the
    // runtime role must never read or write it (no migration capability).
    await admin.query(
      `REVOKE ALL ON TABLE "${schema}".migrations FROM "${runtimeRoleName}"`,
    );
    await admin.query(
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "${schema}" TO "${runtimeRoleName}"`,
    );
    // The ", public" part is load-bearing for uuid-ossp resolution (see the
    // header note). On PostgreSQL >= 15 (and any database with the modern
    // default) PUBLIC holds only USAGE on `public` — no CREATE — so the
    // runtime role can resolve uuid_generate_v4() but cannot create in, or
    // DML into, the public schema.
    await admin.query(
      `ALTER ROLE "${runtimeRoleName}" SET search_path TO "${schema}", public`,
    );
  } catch (error) {
    // Provisioning failed partway: best-effort cleanup so this run leaks
    // neither its schema nor its roles, then propagate the original error.
    await dropAll().catch(() => undefined);
    await destroyAdminQuietly();
    throw error;
  }

  return {
    schema,
    migrationRoleName,
    readerRoleName,
    readerRolePassword,
    runtimeRoleName,
    runtimeRolePassword,
    setupDurationMs: Date.now() - setupStartedAt,
    migrationDurationMs,
    close: async () => {
      // Best-effort, each step independent, like the OHAC fixture: a failing
      // test never leaks its schema or roles.
      let firstError: unknown = undefined;
      try {
        await dropAll();
      } catch (error) {
        firstError ??= error;
      }
      await destroyAdminQuietly();
      if (firstError !== undefined) throw firstError;
    },
  };
}
