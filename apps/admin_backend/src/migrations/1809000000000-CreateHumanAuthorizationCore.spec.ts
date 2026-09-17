import { QueryResult, type QueryRunner } from 'typeorm';
import { CreateHumanAuthorizationCore1809000000000 } from './1809000000000-CreateHumanAuthorizationCore';

describe('CreateHumanAuthorizationCore1809000000000', () => {
  const migration = new CreateHumanAuthorizationCore1809000000000();

  const collectSql = async (direction: 'up' | 'down' = 'up') => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn((sql: string): Promise<QueryResult> => {
        queries.push(sql);
        return Promise.resolve(new QueryResult());
      }),
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
