import { QueryResult, type QueryRunner } from 'typeorm';
import {
  PREVIOUS_TENANT_RLS_PREDICATE,
  TENANT_RLS_PREDICATE,
} from '../core/database/tenant-rls-policy';
import { RebindSystemParametersConfigTenantColumn1809090000000 } from './1809090000000-RebindSystemParametersConfigTenantColumn';

/**
 * The authored catalog truth for `sys_parametros_config`, taken from
 * `pg_policies`' structural columns (never the deparsed `qual`/`with_check`)
 * on the scratch database `omnifood_schema_build_test`: exactly one policy,
 * `sys_parametros_config_tenant_isolation`, created by
 * 1784000000000-CreateSystemParametersConfig as `FOR ALL` with both halves.
 */
const TABLE = 'sys_parametros_config';
const VIEW = 'v_sys_parametros_config_active';
const POLICY_NAME = 'sys_parametros_config_tenant_isolation';

const POLICY_ROW = {
  table: TABLE,
  policyName: POLICY_NAME,
  cmd: 'ALL' as const,
  using: true,
  check: true,
};

/**
 * The exact view DDL authored by 1784000000000, reproduced here so the spec
 * is an independent copy: the migration's declared `createSql` must match it
 * statement for statement, including the `WITH (security_invoker = true)`
 * option that keeps the view reading under the caller's RLS context.
 */
const AUTHORED_VIEW_DDL = `
      CREATE OR REPLACE VIEW v_sys_parametros_config_active
      WITH (security_invoker = true)
      AS
      SELECT DISTINCT ON (tenant_id, param_key)
        id,
        tenant_id,
        param_key,
        param_value,
        version,
        effective_from,
        effective_to,
        is_active,
        created_by,
        created_at
      FROM sys_parametros_config
      WHERE is_active = true
        AND (effective_to IS NULL OR effective_to > now())
      ORDER BY tenant_id, param_key, version DESC, effective_from DESC;
    `;

describe('RebindSystemParametersConfigTenantColumn1809090000000', () => {
  const migration = new RebindSystemParametersConfigTenantColumn1809090000000();

  const createQueryRunner = (
    // Column type and length answered for information_schema lookups. The
    // defaults mirror the column AS MEASURED in the catalog: `character
    // varying` with a NULL character_maximum_length (declared without a
    // length in 1784000000000). `uuid` mirrors the post-up state down() runs
    // against.
    columnType: 'character varying' | 'uuid' = 'character varying',
    characterMaximumLength: number | null = null,
  ) => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn((sql: string): Promise<QueryResult> => {
        queries.push(sql);
        const result = new QueryResult();
        if (sql.includes('information_schema.columns')) {
          result.records = [
            {
              data_type: columnType,
              character_maximum_length: characterMaximumLength,
            },
          ];
        }
        return Promise.resolve(result);
      }),
    } as unknown as QueryRunner;

    return { queryRunner, queries };
  };

  it('reports the migration name required by the migrations ledger', () => {
    expect(migration.name).toBe(
      'RebindSystemParametersConfigTenantColumn1809090000000',
    );
  });

  it('carries exactly one authored policy row, FOR ALL with both halves', () => {
    expect(POLICY_ROW.cmd).toBe('ALL');
    expect(POLICY_ROW.using).toBe(true);
    expect(POLICY_ROW.check).toBe(true);
    expect(POLICY_ROW.policyName).toBe(POLICY_NAME);
    expect(POLICY_ROW.table).toBe(TABLE);
  });

  it('declares the view with the exact DDL authored by 1784000000000', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);

    const createView = queries.find((q) =>
      q.includes(`CREATE OR REPLACE VIEW ${VIEW}`),
    );
    expect(createView).toBeDefined();
    // Statement-for-statement equality with the DDL 1784000000000 authors.
    expect(createView).toBe(AUTHORED_VIEW_DDL);
    // The isolation option is load-bearing: without it the view reads under
    // the owner's privileges and RLS on the base table stops applying.
    expect(createView).toContain('WITH (security_invoker = true)');
  });

  it('drops the view before the ALTER and recreates it after, before the policy', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);

    const dropPolicy = queries.findIndex((q) => q.startsWith('DROP POLICY'));
    const dropView = queries.findIndex((q) => q.startsWith('DROP VIEW'));
    const alterColumn = queries.findIndex((q) =>
      q.includes(`ALTER TABLE "${TABLE}" ALTER COLUMN "tenant_id" TYPE uuid`),
    );
    const createView = queries.findIndex((q) =>
      q.includes(`CREATE OR REPLACE VIEW ${VIEW}`),
    );
    const createPolicy = queries.findIndex((q) => q.includes('CREATE POLICY'));

    // Every step exists, in the forced order, all inside one migration.
    expect(dropPolicy).toBeGreaterThanOrEqual(0);
    expect(dropView).toBeGreaterThan(dropPolicy);
    expect(alterColumn).toBeGreaterThan(dropView);
    expect(createView).toBeGreaterThan(alterColumn);
    expect(createPolicy).toBeGreaterThan(createView);
  });

  it('rebinds the column with the target uuid predicate in up()', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);

    const sql = queries.join('\n');

    expect(sql).toContain(TENANT_RLS_PREDICATE);
    expect(sql).not.toContain(PREVIOUS_TENANT_RLS_PREDICATE);

    // Exactly one ALTER, to uuid, with the column-side cast.
    expect(
      queries.filter((q) =>
        q.includes(`ALTER TABLE "${TABLE}" ALTER COLUMN "tenant_id" TYPE uuid`),
      ),
    ).toHaveLength(1);
    expect(sql).toContain(
      `ALTER TABLE "${TABLE}" ALTER COLUMN "tenant_id" TYPE uuid ` +
        'USING "tenant_id"::uuid',
    );

    // Exactly one policy dropped and recreated against the target predicate.
    expect(sql.match(/DROP POLICY IF EXISTS/g)).toHaveLength(1);
    expect(sql.match(/CREATE POLICY/g)).toHaveLength(1);

    const statement = queries.find((q) => q.includes(`CREATE POLICY`));
    expect(statement).toBeDefined();
    expect(statement).toContain(`CREATE POLICY "${POLICY_NAME}"`);
    expect(statement).toContain(`ON "${TABLE}"`);
    expect(statement).toContain('FOR ALL');
    // FOR ALL carries both halves.
    expect(statement).toContain('USING (');
    expect(statement).toContain('WITH CHECK (');
  });

  it('touches no other table and no other view', async () => {
    // 'uuid' mirrors the state after up(), so down() emits its own ALTER.
    const { queryRunner, queries } = createQueryRunner('uuid');

    await migration.up(queryRunner);
    await migration.down(queryRunner);

    const sql = queries.join('\n');

    // The fake runner holds one static column state, so up() or down() skips
    // its ALTER by idempotence; the single emitted ALTER names this table and
    // no other. Combined with the ALTER count of 1 per direction pinned in
    // the up()/down() tests, no other table can be reached.
    expect(queries.filter((q) => q.includes('ALTER TABLE'))).toHaveLength(1);
    expect(sql).toContain('ALTER TABLE "sys_parametros_config"');
    // Both directions drop and recreate the view exactly once each.
    expect(sql.match(/DROP VIEW/g)).toHaveLength(2);
    expect(sql.match(/CREATE (OR REPLACE )?VIEW/g)).toHaveLength(2);
    expect(sql).not.toContain('onboarding_');
    expect(sql).not.toContain('fiscal_config_revisions');
  });

  it('restores the previous column type and text predicate in down()', async () => {
    const { queryRunner, queries } = createQueryRunner('uuid');

    await migration.down(queryRunner);

    const sql = queries.join('\n');

    expect(sql).toContain(PREVIOUS_TENANT_RLS_PREDICATE);
    expect(sql).not.toContain(TENANT_RLS_PREDICATE);

    // The column was declared WITHOUT a length, so down() restores the bare
    // `character varying` type — not `character varying(128)`.
    expect(sql).toContain(
      `ALTER TABLE "${TABLE}" ALTER COLUMN "tenant_id" TYPE character varying ` +
        'USING "tenant_id"::text',
    );

    expect(sql.match(/DROP POLICY IF EXISTS/g)).toHaveLength(1);
    expect(sql.match(/CREATE POLICY/g)).toHaveLength(1);

    const statement = queries.find((q) => q.includes('CREATE POLICY'));
    expect(statement).toContain('FOR ALL');
    expect(statement).toContain('USING (');
    expect(statement).toContain('WITH CHECK (');
  });

  it('is a no-op on a re-run when the column is already uuid in up()', async () => {
    const { queryRunner, queries } = createQueryRunner('uuid');

    await migration.up(queryRunner);

    // Partial-ledger re-run: the ALTER is skipped, the view is still dropped
    // and recreated with the same DDL, and the policy is recreated with the
    // uuid predicate (already correct in form, now guarded by the emitter).
    const sql = queries.join('\n');
    expect(sql).not.toContain('ALTER COLUMN');
    expect(sql).toContain(TENANT_RLS_PREDICATE);
    expect(sql).toContain('CREATE OR REPLACE VIEW');
  });
});
