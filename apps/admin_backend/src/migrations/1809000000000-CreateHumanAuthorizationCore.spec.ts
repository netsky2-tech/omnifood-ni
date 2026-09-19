import { QueryResult, type QueryRunner } from 'typeorm';
import { CreateHumanAuthorizationCore1809000000000 } from './1809000000000-CreateHumanAuthorizationCore';

describe('CreateHumanAuthorizationCore1809000000000', () => {
  const migration = new CreateHumanAuthorizationCore1809000000000();

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

  it('creates human_auth_policy_epochs with expected columns, unique constraints, and indexes', async () => {
    const sql = await collectSql('up');

    for (const fragment of [
      'CREATE TABLE IF NOT EXISTS human_auth_policy_epochs',
      'id uuid PRIMARY KEY DEFAULT gen_random_uuid()',
      'tenant_id varchar(128) NOT NULL',
      'terminal_id varchar(128) NOT NULL',
      'schema varchar(128) NOT NULL',
      'sequence bigint NOT NULL CHECK (sequence >= 0)',
      'previous_sequence bigint NOT NULL CHECK (previous_sequence >= 0)',
      "previous_digest varchar(71) NOT NULL CHECK (previous_digest = 'GENESIS' OR previous_digest ~ '^sha256:[0-9a-f]{64}$')",
      'publisher_backend_build varchar(128) NOT NULL',
      'target_pos_build varchar(128) NOT NULL',
      'minimum_assertion_schema varchar(128) NOT NULL',
      'cohort_decision varchar(32) NOT NULL',
      "digest varchar(71) NOT NULL CHECK (digest ~ '^sha256:[0-9a-f]{64}$')",
      'payload jsonb NOT NULL',
      'published_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP',
      'CONSTRAINT uq_human_auth_policy_epochs_sequence UNIQUE (tenant_id, terminal_id, sequence)',
      'CONSTRAINT uq_human_auth_policy_epochs_digest UNIQUE (tenant_id, terminal_id, digest)',
      'CREATE INDEX IF NOT EXISTS idx_human_auth_policy_epochs_tenant',
      'CREATE INDEX IF NOT EXISTS idx_human_auth_policy_epochs_terminal_sequence',
      'ON human_auth_policy_epochs (tenant_id, terminal_id, sequence DESC)',
    ]) {
      expect(sql).toContain(fragment);
    }
  });

  it('enables and forces RLS on human_auth_policy_epochs with select and insert policies only', async () => {
    const sql = await collectSql('up');

    for (const fragment of [
      'ALTER TABLE human_auth_policy_epochs ENABLE ROW LEVEL SECURITY',
      'ALTER TABLE human_auth_policy_epochs FORCE ROW LEVEL SECURITY',
      'CREATE POLICY human_auth_policy_epochs_tenant_select ON human_auth_policy_epochs',
      'CREATE POLICY human_auth_policy_epochs_tenant_insert ON human_auth_policy_epochs',
      "current_setting('app.tenant_id', true)",
    ]) {
      expect(sql).toContain(fragment);
    }

    expect(sql).not.toContain('human_auth_policy_epochs_tenant_delete');
    expect(sql).not.toContain('human_auth_policy_epochs_tenant_update');
  });

  it('resolves the tenant predicate per table and emits the uuid form when the stubbed type is uuid', async () => {
    const sql = await collectSql('up', 'uuid');

    // The resolver must be consulted exactly once per table, with the table
    // name recorded on the lookup, so each table's policies follow that
    // table's own column type instead of one value shared across tables.
    expect(consultedTables).toEqual([
      'human_auth_policy_epochs',
      'human_auth_terminal_ack_history',
      'human_auth_terminal_ack_floor',
    ]);

    // The stubbed tenant_id column type is uuid, so every tenant policy must
    // use the index-friendly uuid predicate; the bare text comparison or the
    // column-side text cast would fail or lose the index on a uuid column.
    const uuidPredicate =
      "tenant_id = current_setting('app.tenant_id', true)::uuid";
    expect(sql).toContain(
      `CREATE POLICY human_auth_policy_epochs_tenant_select ON human_auth_policy_epochs FOR SELECT USING (${uuidPredicate});`,
    );
    expect(sql).toContain(
      `CREATE POLICY human_auth_policy_epochs_tenant_insert ON human_auth_policy_epochs FOR INSERT WITH CHECK (${uuidPredicate});`,
    );
    expect(sql).toContain(
      `CREATE POLICY human_auth_terminal_ack_history_tenant_select ON human_auth_terminal_ack_history FOR SELECT USING (${uuidPredicate});`,
    );
    expect(sql).toContain(
      `CREATE POLICY human_auth_terminal_ack_history_tenant_insert ON human_auth_terminal_ack_history FOR INSERT WITH CHECK (${uuidPredicate});`,
    );
    expect(sql).toContain(
      `CREATE POLICY human_auth_terminal_ack_floor_tenant_select ON human_auth_terminal_ack_floor FOR SELECT USING (${uuidPredicate});`,
    );
    expect(sql).toContain(
      `CREATE POLICY human_auth_terminal_ack_floor_tenant_insert ON human_auth_terminal_ack_floor FOR INSERT WITH CHECK (${uuidPredicate});`,
    );
    expect(sql).toContain(
      `CREATE POLICY human_auth_terminal_ack_floor_tenant_update ON human_auth_terminal_ack_floor FOR UPDATE USING (${uuidPredicate}) WITH CHECK (${uuidPredicate});`,
    );
    expect(sql).not.toContain('tenant_id::text');
  });

  it('emits the text-cast predicate when tenant_id is still varchar, never the uuid cast', async () => {
    const sql = await collectSql('up', 'character varying');

    expect(consultedTables).toEqual([
      'human_auth_policy_epochs',
      'human_auth_terminal_ack_history',
      'human_auth_terminal_ack_floor',
    ]);

    // The stubbed tenant_id column type is varchar, so a uuid-cast predicate
    // would fail the migration with "operator does not exist: character
    // varying = uuid"; the column-side text cast is the only valid form here.
    const textPredicate =
      "tenant_id::text = current_setting('app.tenant_id', true)";
    expect(sql).toContain(
      `CREATE POLICY human_auth_policy_epochs_tenant_select ON human_auth_policy_epochs FOR SELECT USING (${textPredicate});`,
    );
    expect(sql).toContain(
      `CREATE POLICY human_auth_terminal_ack_history_tenant_select ON human_auth_terminal_ack_history FOR SELECT USING (${textPredicate});`,
    );
    expect(sql).toContain(
      `CREATE POLICY human_auth_terminal_ack_floor_tenant_select ON human_auth_terminal_ack_floor FOR SELECT USING (${textPredicate});`,
    );
    expect(sql).not.toContain('::uuid');
  });

  it('refuses to emit tenant policies when the table has no tenant_id column', async () => {
    // The first table resolved is human_auth_policy_epochs, so the error names it.
    await expect(collectSql('up', null)).rejects.toThrow(
      /'human_auth_policy_epochs' has no tenant_id column/,
    );
  });

  it('refuses to emit tenant policies for an unsupported tenant_id column type', async () => {
    await expect(collectSql('up', 'integer')).rejects.toThrow(
      /unsupported tenant_id column type 'integer'/,
    );
  });

  it('creates human_auth_terminal_ack_history with status check and partial unique indexes', async () => {
    const sql = await collectSql('up');

    for (const fragment of [
      'CREATE TABLE IF NOT EXISTS human_auth_terminal_ack_history',
      "status varchar(32) NOT NULL CHECK (status IN ('ACCEPTED', 'REJECTED'))",
      'CREATE UNIQUE INDEX IF NOT EXISTS uq_human_auth_ack_history_accepted_sequence',
      "ON human_auth_terminal_ack_history (tenant_id, terminal_id, sequence) WHERE status = 'ACCEPTED'",
      'CREATE UNIQUE INDEX IF NOT EXISTS uq_human_auth_ack_history_idempotency',
      "ON human_auth_terminal_ack_history (tenant_id, terminal_id, idempotency_key) WHERE status = 'ACCEPTED'",
      'CREATE INDEX IF NOT EXISTS idx_human_auth_ack_history_terminal_received',
      'ON human_auth_terminal_ack_history (tenant_id, terminal_id, received_at DESC)',
    ]) {
      expect(sql).toContain(fragment);
    }
  });

  it('creates human_auth_terminal_ack_floor with composite primary key and full floor-regression trigger', async () => {
    const sql = await collectSql('up');

    for (const fragment of [
      'CREATE TABLE IF NOT EXISTS human_auth_terminal_ack_floor',
      'PRIMARY KEY (tenant_id, terminal_id)',
      'revision bigint NOT NULL DEFAULT 1',
      'NEW.sequence < OLD.sequence',
      'NEW.sequence = OLD.sequence AND NEW.digest <> OLD.digest',
      'NEW.tenant_id IS DISTINCT FROM OLD.tenant_id',
      'NEW.terminal_id IS DISTINCT FROM OLD.terminal_id',
      'BEFORE DELETE ON human_auth_terminal_ack_floor',
    ]) {
      expect(sql).toContain(fragment);
    }
  });

  it('attaches append-only guards to both append-only tables at row and statement level', async () => {
    const sql = await collectSql('up');

    for (const fragment of [
      'guard_human_auth_append_only_mutation',
      'BEFORE UPDATE OR DELETE ON human_auth_policy_epochs FOR EACH ROW',
      'BEFORE UPDATE OR DELETE ON human_auth_policy_epochs FOR EACH STATEMENT',
      'BEFORE UPDATE OR DELETE ON human_auth_terminal_ack_history FOR EACH ROW',
      'BEFORE UPDATE OR DELETE ON human_auth_terminal_ack_history FOR EACH STATEMENT',
      'EXECUTE FUNCTION guard_human_auth_append_only_mutation()',
    ]) {
      expect(sql).toContain(fragment);
    }
  });

  it('down removes enforcement objects and retains every evidence table', async () => {
    const sql = await collectSql('down');

    const triggerIndex = sql.indexOf('DROP TRIGGER IF EXISTS');
    const functionIndex = sql.indexOf('DROP FUNCTION IF EXISTS');
    expect(triggerIndex).toBeGreaterThanOrEqual(0);
    expect(functionIndex).toBeGreaterThan(triggerIndex);

    for (const fragment of [
      'DROP TRIGGER IF EXISTS trg_human_auth_append_only_epochs_row ON human_auth_policy_epochs',
      'DROP TRIGGER IF EXISTS trg_human_auth_append_only_epochs_stmt ON human_auth_policy_epochs',
      'DROP TRIGGER IF EXISTS trg_human_auth_append_only_ack_history_row ON human_auth_terminal_ack_history',
      'DROP TRIGGER IF EXISTS trg_human_auth_append_only_ack_history_stmt ON human_auth_terminal_ack_history',
      'DROP TRIGGER IF EXISTS trg_human_auth_ack_floor_monotonic ON human_auth_terminal_ack_floor',
      'DROP TRIGGER IF EXISTS trg_human_auth_ack_floor_no_delete ON human_auth_terminal_ack_floor',
      'DROP FUNCTION IF EXISTS guard_human_auth_append_only_mutation()',
      'DROP FUNCTION IF EXISTS guard_human_auth_ack_floor_monotonic()',
      'DROP FUNCTION IF EXISTS guard_human_auth_ack_floor_no_delete()',
    ]) {
      expect(sql).toContain(fragment);
    }

    // Design sections 11 and 12 make evidence retention normative: a rollback must not erase
    // epoch or acknowledgement evidence, lower an ack floor, or reactivate an epoch.
    expect(sql).not.toContain('DROP TABLE');
  });

  it('does not create any table outside the three core tables', async () => {
    const sql = await collectSql('up');

    for (const fragment of [
      'human_auth_recovery_tokens',
      'human_auth_recovery_events',
      'human_auth_verification_events',
      'human_auth_rollout_cohorts',
    ]) {
      expect(sql).not.toContain(fragment);
    }
  });
});
