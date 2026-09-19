import { QueryResult, type QueryRunner } from 'typeorm';
import { CreateHumanAuthorizationPolicySnapshots1809050000000 } from './1809050000000-CreateHumanAuthorizationPolicySnapshots';

describe('CreateHumanAuthorizationPolicySnapshots1809050000000', () => {
  const migration = new CreateHumanAuthorizationPolicySnapshots1809050000000();

  // The migration resolves the tenant predicate per table through the shared
  // type-aware seam, which reads the tenant_id column's type from
  // information_schema.columns with the table name bound as the first query
  // parameter. Each run must stub the data_type the environment declares;
  // `null` stubs a table without a tenant_id column. The consulted table of
  // every resolver read is recorded so tests can pin one resolution per table.
  let consultedTables: string[] = [];
  const collectSql = async (
    direction: 'up' | 'down' = 'up',
    tenantIdDataType: string | null = 'character varying',
  ) => {
    consultedTables = [];
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn(
        (sql: string, params?: unknown[]): Promise<QueryResult> => {
          queries.push(sql);
          if (sql.includes('information_schema.columns')) {
            const tableParam = params?.[0];
            if (typeof tableParam === 'string') {
              consultedTables.push(tableParam);
            }
            return Promise.resolve(
              tenantIdDataType === null
                ? []
                : [{ data_type: tenantIdDataType }],
            ) as unknown as Promise<QueryResult>;
          }
          return Promise.resolve(new QueryResult());
        },
      ),
    } as unknown as QueryRunner;
    await migration[direction](queryRunner);
    return queries.join('\n').replace(/\s+/g, ' ');
  };

  it('creates one immutable terminal-agnostic snapshot per (tenant_id, sequence) with the scalar publication facts', async () => {
    const sql = await collectSql('up');

    for (const fragment of [
      'CREATE TABLE IF NOT EXISTS human_auth_policy_snapshots',
      'id uuid PRIMARY KEY DEFAULT gen_random_uuid()',
      'tenant_id varchar(128) NOT NULL',
      'sequence bigint NOT NULL CHECK (sequence >= 0)',
      'previous_sequence bigint NOT NULL CHECK (previous_sequence >= 0)',
      'schema varchar(128) NOT NULL',
      "previous_digest varchar(71) NOT NULL CHECK (previous_digest = 'GENESIS' OR previous_digest ~ '^sha256:[0-9a-f]{64}$')",
      'publisher_backend_build varchar(128) NOT NULL',
      'minimum_assertion_schema varchar(128) NOT NULL',
      'cohort_decision varchar(32) NOT NULL',
      "digest varchar(71) NOT NULL CHECK (digest ~ '^sha256:[0-9a-f]{64}$')",
      'payload jsonb NOT NULL',
      'published_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP',
    ]) {
      expect(sql).toContain(fragment);
    }
  });

  it('provisions no per-terminal columns: terminal identity and target build resolve at pull time', async () => {
    const sql = await collectSql('up');

    // Design §11.2 decision 17: the snapshot is terminal-agnostic; terminal_id and target_pos_build
    // are per-terminal facts materialized on the terminal's first pull, never stored here.
    expect(sql).not.toContain('terminal_id');
    expect(sql).not.toContain('target_pos_build');
  });

  it('enforces tenant-scoped uniqueness on sequence and digest and indexes the newest-sequence lookup', async () => {
    const sql = await collectSql('up');

    for (const fragment of [
      'CONSTRAINT uq_human_auth_policy_snapshots_sequence UNIQUE (tenant_id, sequence)',
      'CONSTRAINT uq_human_auth_policy_snapshots_digest UNIQUE (tenant_id, digest)',
      'ON human_auth_policy_snapshots (tenant_id, sequence DESC)',
    ]) {
      expect(sql).toContain(fragment);
    }
  });

  it('provisions exactly one table and no counter or sequence store', async () => {
    const sql = await collectSql('up');

    // The sequence is derived (MAX(sequence) + 1 under the tenant advisory lock), so this migration
    // must not invent a counter table or any other companion store.
    expect(sql.match(/CREATE TABLE /g)).toHaveLength(1);
    expect(sql).toContain(
      'CREATE TABLE IF NOT EXISTS human_auth_policy_snapshots',
    );
  });

  it('documents the tenant-global derived sequence and the absence of a counter table', async () => {
    const sql = await collectSql('up');

    expect(sql).toContain('COMMENT ON TABLE human_auth_policy_snapshots IS');
    for (const fragment of [
      'tenant-global',
      'MAX(sequence) + 1',
      'pg_advisory_xact_lock(hashtext(tenant_id))',
      'no counter table exists',
    ]) {
      expect(sql).toContain(fragment);
    }
  });

  it('enables and forces RLS with tenant select and insert policies but no update or delete policy', async () => {
    const sql = await collectSql('up');

    for (const fragment of [
      'ALTER TABLE human_auth_policy_snapshots ENABLE ROW LEVEL SECURITY',
      'ALTER TABLE human_auth_policy_snapshots FORCE ROW LEVEL SECURITY',
      "current_setting('app.tenant_id', true)",
      'CREATE POLICY human_auth_policy_snapshots_tenant_select ON human_auth_policy_snapshots',
      'CREATE POLICY human_auth_policy_snapshots_tenant_insert ON human_auth_policy_snapshots FOR INSERT WITH CHECK',
    ]) {
      expect(sql).toContain(fragment);
    }

    for (const fragment of [
      'human_auth_policy_snapshots_tenant_update',
      'human_auth_policy_snapshots_tenant_delete',
    ]) {
      expect(sql).not.toContain(fragment);
    }
  });

  it('resolves the tenant predicate per table and emits the uuid form when the stubbed type is uuid', async () => {
    const sql = await collectSql('up', 'uuid');

    // The resolver must be consulted exactly once for the table, with the
    // table name recorded on the lookup, and the emitted form must follow the
    // stubbed column type rather than the form this migration was written for.
    expect(consultedTables).toEqual(['human_auth_policy_snapshots']);

    // The stubbed tenant_id column type is uuid, so every tenant policy must
    // use the index-friendly uuid predicate; the bare text comparison or the
    // column-side text cast would fail or lose the index on a uuid column.
    const uuidPredicate =
      "tenant_id = current_setting('app.tenant_id', true)::uuid";
    expect(sql).toContain(
      `CREATE POLICY human_auth_policy_snapshots_tenant_select ON human_auth_policy_snapshots FOR SELECT USING (${uuidPredicate});`,
    );
    expect(sql).toContain(
      `CREATE POLICY human_auth_policy_snapshots_tenant_insert ON human_auth_policy_snapshots FOR INSERT WITH CHECK (${uuidPredicate});`,
    );
    expect(sql).not.toContain('tenant_id::text');
  });

  it('emits the text-cast predicate when tenant_id is still varchar, never the uuid cast', async () => {
    const sql = await collectSql('up', 'character varying');

    expect(consultedTables).toEqual(['human_auth_policy_snapshots']);

    // The stubbed tenant_id column type is varchar, so a uuid-cast predicate
    // would fail the migration with "operator does not exist: character
    // varying = uuid"; the column-side text cast is the only valid form here.
    const textPredicate =
      "tenant_id::text = current_setting('app.tenant_id', true)";
    expect(sql).toContain(
      `CREATE POLICY human_auth_policy_snapshots_tenant_select ON human_auth_policy_snapshots FOR SELECT USING (${textPredicate});`,
    );
    expect(sql).not.toContain('::uuid');
  });

  it('refuses to emit tenant policies when the table has no tenant_id column', async () => {
    await expect(collectSql('up', null)).rejects.toThrow(
      /'human_auth_policy_snapshots' has no tenant_id column/,
    );
  });

  it('refuses to emit tenant policies for an unsupported tenant_id column type', async () => {
    await expect(collectSql('up', 'integer')).rejects.toThrow(
      /unsupported tenant_id column type 'integer'/,
    );
  });

  it('forbids update and delete through its own append-only row and statement triggers', async () => {
    const sql = await collectSql('up');

    for (const fragment of [
      'CREATE OR REPLACE FUNCTION guard_human_auth_policy_snapshots_append_only() RETURNS trigger AS $$',
      "RAISE EXCEPTION '% is append-only: update and delete are forbidden', TG_TABLE_NAME",
      'DROP TRIGGER IF EXISTS trg_human_auth_policy_snapshots_append_only_row ON human_auth_policy_snapshots',
      'CREATE TRIGGER trg_human_auth_policy_snapshots_append_only_row BEFORE UPDATE OR DELETE ON human_auth_policy_snapshots FOR EACH ROW',
      'DROP TRIGGER IF EXISTS trg_human_auth_policy_snapshots_append_only_stmt ON human_auth_policy_snapshots',
      'CREATE TRIGGER trg_human_auth_policy_snapshots_append_only_stmt BEFORE UPDATE OR DELETE ON human_auth_policy_snapshots FOR EACH STATEMENT',
      'EXECUTE FUNCTION guard_human_auth_policy_snapshots_append_only()',
    ]) {
      expect(sql).toContain(fragment);
    }
  });

  it('owns its enforcement objects and no other OHAC guard or trigger', async () => {
    const sql = await collectSql('up');

    for (const fragment of [
      'guard_human_auth_append_only_mutation',
      'guard_human_auth_ack_floor_monotonic',
      'guard_human_auth_ack_floor_no_delete',
      'guard_human_auth_tenant_publication_state_mutation',
      'trg_human_auth_append_only_epochs',
      'trg_human_auth_append_only_ack_history',
      'trg_human_auth_tenant_publication_state_guard',
    ]) {
      expect(sql).not.toContain(fragment);
    }
  });

  it('declares no foreign keys and registers no other OHAC table', async () => {
    const sql = await collectSql('up');

    expect(sql).not.toContain('FOREIGN KEY');
    expect(sql).not.toContain('REFERENCES');
    for (const fragment of [
      'human_auth_policy_epochs',
      'human_auth_terminal_ack_history',
      'human_auth_terminal_ack_floor',
      'human_auth_tenant_publication_state',
      'human_auth_recovery_tokens',
      'human_auth_recovery_events',
      'human_auth_verification_events',
      'human_auth_rollout_cohorts',
    ]) {
      expect(sql).not.toContain(fragment);
    }
  });

  it('is convergent under a repeated up() run', async () => {
    const first = await collectSql('up');
    const second = await collectSql('up');

    expect(second).toBe(first);
  });

  it('down removes only its own trigger then guard function and retains the table and rows', async () => {
    const sql = await collectSql('down');

    const triggerIndex = sql.indexOf('DROP TRIGGER IF EXISTS');
    const functionIndex = sql.indexOf('DROP FUNCTION IF EXISTS');
    expect(triggerIndex).toBeGreaterThanOrEqual(0);
    expect(functionIndex).toBeGreaterThan(triggerIndex);

    expect(sql).toContain(
      'DROP TRIGGER IF EXISTS trg_human_auth_policy_snapshots_append_only_row ON human_auth_policy_snapshots',
    );
    expect(sql).toContain(
      'DROP TRIGGER IF EXISTS trg_human_auth_policy_snapshots_append_only_stmt ON human_auth_policy_snapshots',
    );
    expect(sql).toContain(
      'DROP FUNCTION IF EXISTS guard_human_auth_policy_snapshots_append_only()',
    );

    // Evidence retention is normative (design §11/§12): down() never drops the snapshot table or its
    // rows, never erases data, and never removes RLS policy protection from the retained table.
    expect(sql).not.toContain('DROP TABLE');
    expect(sql).not.toContain('DROP POLICY');
    expect(sql).not.toContain('DELETE FROM');
    expect(sql).not.toContain('TRUNCATE');
    expect(sql).not.toContain('DISABLE ROW LEVEL SECURITY');
    expect(sql).not.toContain('NO FORCE ROW LEVEL SECURITY');
  });
});
