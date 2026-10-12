import { QueryResult, type QueryRunner } from 'typeorm';

/**
 * Shared rebind of a table's tenant columns and tenant RLS policies, used by
 * the Phase 2 units of issue #286 (`tenant_id` varchar -> uuid).
 *
 * Why a single shared emitter
 * ---------------------------
 * PostgreSQL refuses `ALTER COLUMN TYPE` while a policy depends on the
 * column ("cannot alter type of a column used in a policy definition"), so
 * every rebind unit must drop the policies, change the column, and recreate
 * the policies with the new predicate — all inside the caller's single
 * migration transaction. Writing that sequence per policy would duplicate the
 * tenant predicate 94 times across migrations, which is exactly how the Unit
 * 0b predicate gap happened. Here the predicate is defined ONCE and can only
 * be wrong in one place; the schema build check
 * (scripts/verify-schema-build.sh) asserts the resulting predicate form on
 * every uuid tenant column, so a wrong predicate fails CI instead of
 * silently losing the tenant index.
 *
 * Why views are declared, not inferred
 * ------------------------------------
 * A view over the tenant column blocks the `ALTER` exactly like a policy
 * does — its `_RETURN` rewrite rule depends on the column (measured on
 * issue #286: `ERROR: cannot alter type of a column used by a view or rule`,
 * `DETAIL: rule _RETURN on view v_sys_parametros_config_active depends on
 * column "tenant_id"`). `CREATE OR REPLACE VIEW` alone is insufficient:
 * the view's EXISTENCE is what blocks the type change, so the view must be
 * dropped first and recreated after. PostgreSQL has no way to "replace" a
 * dependency away. Each target therefore declares the views over its
 * `tenant_id` column (`views`), carrying the exact recreation DDL — the
 * migration owns the DDL, the emitter only places it in the forced order:
 *
 *   DROP POLICY (every policy) -> DROP VIEW (every view) -> the column
 *   type change -> CREATE VIEW (declared DDL) -> CREATE POLICY (guarded)
 *
 * `down()` mirrors the same shape: drop the views, restore the previous
 * column type, recreate the views, recreate the policies with the previous
 * predicate. The declared `createSql` is type-independent (the reference
 * view selects named columns, not `SELECT *`), so the same DDL serves both
 * directions.
 *
 * Why `using` and `check` are booleans, not inferred from `cmd`
 * ------------------------------------------------------------
 * FOR ALL carries both halves; SELECT/DELETE carry only USING; INSERT carries
 * only WITH CHECK; UPDATE can carry either. The booleans are authored data
 * taken from the catalog's structural columns (which are reliable). They must
 * NEVER be read from `pg_policies.qual` / `with_check` at runtime: those are
 * deparsed expressions that cannot distinguish a bare compare from a written
 * cast.
 */

/** Target predicate: the SETTING is cast to uuid, so the uuid column keeps its index. */
export const TENANT_RLS_PREDICATE =
  "tenant_id = current_setting('app.tenant_id', true)::uuid";

/** The form being replaced: the COLUMN is cast to text, which loses the index on uuid. */
export const PREVIOUS_TENANT_RLS_PREDICATE =
  "tenant_id::text = current_setting('app.tenant_id', true)";

/** Target column type for every Phase 2 rebind. */
export const UUID_TENANT_COLUMN_TYPE = 'uuid';

/** One policy command covered by the tenant policies. */
export type TenantRlsPolicyCommand =
  | 'SELECT'
  | 'INSERT'
  | 'UPDATE'
  | 'DELETE'
  | 'ALL';

/** One authored tenant policy. */
export interface TenantRlsPolicyRow {
  /** Table the policy belongs to; must match the surrounding target's table. */
  table: string;
  policyName: string;
  cmd: TenantRlsPolicyCommand;
  /** Emit `USING (...)` with the predicate. */
  using: boolean;
  /** Emit `WITH CHECK (...)` with the predicate. */
  check: boolean;
}

/**
 * One view whose `_RETURN` rule depends on the target's `tenant_id` column.
 * Declared, never inferred from the catalog: the emitter cannot reconstruct
 * the exact DDL the migration authored, and guessing it would silently
 * change the view.
 */
export interface TenantRlsViewDependency {
  name: string;
  /** The complete `CREATE VIEW` statement that recreates the view, emitted verbatim. */
  createSql: string;
}

/** One table whose tenant column and policies are rebound together. */
export interface TenantRlsTarget {
  table: string;
  /** The column's type before the rebind; needed by `down()` to restore it. */
  previousType: string;
  /**
   * Views over the table's `tenant_id` column, dropped before the column
   * type change and recreated after it. Optional: a target without views
   * omits it and the emitter's output is exactly what it was before this
   * field existed.
   */
  views?: TenantRlsViewDependency[];
  policies: TenantRlsPolicyRow[];
}

/** Column types the rebind accepts as the current state of `tenant_id`. */
const REBINDABLE_COLUMN_TYPES = new Set(['uuid', 'character varying', 'text']);

/** Shape of the information_schema.columns row for a tenant_id column. */
interface TenantColumnRow {
  data_type: string;
  character_maximum_length: number | null;
}

const quoteIdentifier = (identifier: string): string =>
  `"${identifier.replace(/"/g, '""')}"`;

const sqlLiteral = (value: string): string => `'${value.replace(/'/g, "''")}'`;

const canonicalColumnType = (
  dataType: string,
  characterMaximumLength: number | null,
): string =>
  dataType === 'character varying' && characterMaximumLength !== null
    ? `character varying(${characterMaximumLength})`
    : dataType;

/**
 * Privileges PostgreSQL permits on a view, and therefore the only ones this emitter can
 * re-grant after a DROP. An ACL entry outside this set means the emitter has met
 * something it does not understand, so it fails closed instead of quietly dropping a
 * role's access.
 */
const VIEW_GRANTABLE_PRIVILEGES = new Set([
  'SELECT',
  'INSERT',
  'UPDATE',
  'DELETE',
  'REFERENCES',
  'TRIGGER',
  'MAINTAIN',
]);

/**
 * Rebinds each target's tenant column and policies, in this order, inside the
 * caller's transaction:
 *
 *   1. `DROP POLICY IF EXISTS` for every listed policy.
 *   2. `DROP VIEW IF EXISTS` for every declared view: the view's existence
 *      (its `_RETURN` rewrite rule) is what blocks the type change, so it
 *      must go before the `ALTER` — `CREATE OR REPLACE VIEW` cannot lift the
 *      dependency.
 *   3. The column type change, idempotent: the current type is read from
 *      `information_schema.columns` (scoped to `current_schema()`) and the
 *      `ALTER` is skipped when the column already has the target type.
 *   4. The declared `CREATE VIEW` DDL, verbatim, for every view.
 *   5. A catalog-guarded `CREATE POLICY` (PostgreSQL has no
 *      `CREATE POLICY IF NOT EXISTS`) for every row, carrying the predicate
 *      in the `USING` / `WITH CHECK` halves each row declares.
 *
 * `resolveTargetType` decides the column type each target is changed to. The
 * default is `uuid`, the direction every `up()` uses; a `down()` that must
 * restore the pre-migration type passes `(target) => target.previousType`.
 * A `down()` reuses the same declared `createSql`, which is
 * type-independent for a view that selects named columns.
 *
 * Identifiers are quoted; the table name passed to the information_schema
 * lookup is a bound parameter. The predicate is a constant SQL expression, so
 * no tenant id is ever interpolated.
 */
export async function rebindTenantColumns(
  queryRunner: QueryRunner,
  targets: TenantRlsTarget[],
  predicate: string,
  resolveTargetType: (target: TenantRlsTarget) => string = () =>
    UUID_TENANT_COLUMN_TYPE,
): Promise<void> {
  for (const target of targets) {
    const { table } = target;
    for (const policy of target.policies) {
      if (policy.table !== table) {
        throw new Error(
          `TENANT_RLS_POLICY_TABLE_MISMATCH: policy "${policy.policyName}" declares table ` +
            `"${policy.table}" but is listed under target "${table}"`,
        );
      }
    }

    const tableId = quoteIdentifier(table);

    for (const policy of target.policies) {
      await queryRunner.query(
        `DROP POLICY IF EXISTS ${quoteIdentifier(policy.policyName)} ON ${tableId}`,
      );
    }

    // The view must be dropped before the column change: its rewrite rule
    // is what blocks the `ALTER`, the same way a policy does.
    //
    // A `DROP` takes the object's ACL with it, and the recreate leaves the
    // owner-only default, so every privilege granted to another role is silently
    // revoked by this migration. Grants are a provisioning concern in this
    // repository (no migration grants anything), which is exactly why the ACL has to
    // be carried across the drop here instead of being re-established later: whether
    // the role still has access would otherwise depend on whether provisioning ran
    // after this migration, not on the migration being correct.
    const reGrantStatements: string[] = [];
    for (const view of target.views ?? []) {
      // TypeORM returns the raw rows array; a structured QueryResult is what tests and
      // other drivers hand back. Accept both shapes, like the column-type lookup does.
      // Typed `unknown` on purpose: `QueryRunner.query` is typed `any`.
      const aclResult: unknown = await queryRunner.query(
        `SELECT r.rolname AS role, a.privilege_type AS privilege, a.is_grantable AS grantable
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
           CROSS JOIN LATERAL aclexplode(c.relacl) a
           JOIN pg_roles r ON r.oid = a.grantee
          WHERE n.nspname = current_schema()
            AND c.relname = $1
            AND a.grantee <> c.relowner
          ORDER BY r.rolname, a.privilege_type`,
        [view.name],
      );
      const grants: Array<{
        role: string;
        privilege: string;
        grantable: boolean;
      }> = Array.isArray(aclResult)
        ? (aclResult as Array<{
            role: string;
            privilege: string;
            grantable: boolean;
          }>)
        : ((
            aclResult as QueryResult<{
              role: string;
              privilege: string;
              grantable: boolean;
            }>
          ).records ?? []);

      for (const grant of grants) {
        if (!VIEW_GRANTABLE_PRIVILEGES.has(grant.privilege)) {
          throw new Error(
            `TENANT_RLS_VIEW_PRIVILEGE_UNSUPPORTED: view "${view.name}" carries privilege ` +
              `"${grant.privilege}" for role "${grant.role}", which cannot be re-granted on a view. ` +
              'Teach the emitter about it rather than dropping the privilege silently.',
          );
        }
        reGrantStatements.push(
          `GRANT ${grant.privilege} ON ${quoteIdentifier(view.name)} TO ${quoteIdentifier(grant.role)}` +
            (grant.grantable ? ' WITH GRANT OPTION' : ''),
        );
      }

      await queryRunner.query(
        `DROP VIEW IF EXISTS ${quoteIdentifier(view.name)}`,
      );
    }

    const targetType = resolveTargetType(target);
    await changeTenantColumnType(queryRunner, table, targetType);

    // Recreate the view with the migration's own DDL, placed after the
    // column change and before the policies, then restore the privileges the
    // drop revoked.
    for (const view of target.views ?? []) {
      await queryRunner.query(view.createSql);
    }
    for (const statement of reGrantStatements) {
      await queryRunner.query(statement);
    }

    for (const policy of target.policies) {
      const halves = [
        policy.using ? `USING (${predicate})` : null,
        policy.check ? `WITH CHECK (${predicate})` : null,
      ]
        .filter(Boolean)
        .join('\n          ');

      // PostgreSQL has no `CREATE POLICY IF NOT EXISTS`, so guard on the catalog.
      await queryRunner.query(`DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = ${sqlLiteral(table)}
            AND policyname = ${sqlLiteral(policy.policyName)}
        ) THEN
          CREATE POLICY ${quoteIdentifier(policy.policyName)} ON ${tableId}
          FOR ${policy.cmd}
          ${halves};
        END IF;
      END $$;`);
    }
  }
}

/**
 * Reads the tenant_id column's type from `information_schema.columns`, scoped
 * to `current_schema()`, with the table name bound as a parameter. Returns
 * null when the column does not exist. This is the ONE catalog lookup both
 * the type change and the type-aware predicate resolver share, so the column
 * type is never observed twice with two different queries.
 */
async function readTenantIdColumn(
  queryRunner: QueryRunner,
  table: string,
): Promise<TenantColumnRow | null> {
  const result: unknown = await queryRunner.query(
    `SELECT data_type, character_maximum_length
       FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = $1
        AND column_name = $2`,
    [table, 'tenant_id'],
  );

  // TypeORM 0.3.x returns the raw rows array from PostgresQueryRunner.query
  // unless called with useStructuredResult; a structured QueryResult (with a
  // `.records` array) is what tests and other drivers may hand back. Accept
  // both shapes.
  const rows: TenantColumnRow[] = Array.isArray(result)
    ? (result as TenantColumnRow[])
    : ((result as QueryResult<TenantColumnRow>).records ?? []);
  return rows[0] ?? null;
}

/**
 * Resolves the RLS predicate form that is valid AND index-friendly for the
 * tenant_id column the table currently has: the setting is cast to uuid on a
 * uuid column, and the column is cast to text on a varchar/text column.
 *
 * | predicate form                                  | on varchar | on uuid |
 * | ----------------------------------------------- | ---------- | ------- |
 * | tenant_id = current_setting('app.tenant_id', true)  | valid      | ERROR: operator does not exist |
 * | tenant_id = current_setting('app.tenant_id', true)::uuid | ERROR: operator does not exist | valid, keeps the index |
 * | tenant_id::text = current_setting('app.tenant_id', true) | valid      | valid, but the index stops restricting rows |
 *
 * Every migration that (re)creates tenant policies must resolve the predicate
 * through this seam instead of hardcoding a form: a partial-ledger re-run
 * emits the form that matches the column type AS IT IS, not as it was when
 * the migration was written. Missing column and unsupported type fail closed,
 * naming the table (and the type), because guessing could break tenant
 * isolation or silently degrade it to a post-scan Filter.
 */
export async function resolveTenantRlsPredicate(
  queryRunner: QueryRunner,
  table: string,
): Promise<string> {
  const column = await readTenantIdColumn(queryRunner, table);
  if (!column) {
    throw new Error(
      `TENANT_COLUMN_NOT_FOUND: table '${table}' has no tenant_id column; ` +
        'tenant policies must not be emitted without knowing the column type',
    );
  }
  if (column.data_type === UUID_TENANT_COLUMN_TYPE) {
    return TENANT_RLS_PREDICATE;
  }
  if (column.data_type === 'character varying' || column.data_type === 'text') {
    return PREVIOUS_TENANT_RLS_PREDICATE;
  }
  throw new Error(
    `TENANT_COLUMN_TYPE_UNSUPPORTED: table '${table}' has unsupported ` +
      `tenant_id column type '${column.data_type}'; refusing to rebind or to ` +
      'emit tenant policies with a type-inappropriate predicate',
  );
}

/**
 * Changes `tenant_id` on the given table to `targetType`, unless it already
 * has that type. Only uuid / varchar / text are accepted as the current
 * state; anything else is a fail-closed error naming the table and the type,
 * because guessing the cast for an unknown type could corrupt tenant ids.
 */
async function changeTenantColumnType(
  queryRunner: QueryRunner,
  table: string,
  targetType: string,
): Promise<void> {
  const column = await readTenantIdColumn(queryRunner, table);
  if (!column) {
    throw new Error(
      `TENANT_COLUMN_NOT_FOUND: table '${table}' has no tenant_id column; ` +
        'the tenant column rebind must not run without knowing the column type',
    );
  }

  const currentType = canonicalColumnType(
    column.data_type,
    column.character_maximum_length,
  );
  if (currentType === targetType) {
    return;
  }

  if (!REBINDABLE_COLUMN_TYPES.has(column.data_type)) {
    throw new Error(
      `TENANT_COLUMN_TYPE_UNSUPPORTED: table '${table}' has unsupported ` +
        `tenant_id column type '${column.data_type}'; refusing to rebind or to ` +
        'emit tenant policies with a type-inappropriate predicate',
    );
  }

  // uuid is reached with a column-side cast; every string target is reached
  // with a column-side text cast, which PostgreSQL coerces to the target.
  const castSuffix = targetType === UUID_TENANT_COLUMN_TYPE ? 'uuid' : 'text';

  await queryRunner.query(
    `ALTER TABLE ${quoteIdentifier(table)} ` +
      'ALTER COLUMN "tenant_id" ' +
      `TYPE ${targetType} USING "tenant_id"::${castSuffix}`,
  );
}
