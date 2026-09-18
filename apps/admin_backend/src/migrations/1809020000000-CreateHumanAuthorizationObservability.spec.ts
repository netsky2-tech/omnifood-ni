import { QueryResult, type QueryRunner } from 'typeorm';
import { CreateHumanAuthorizationObservability1809020000000 } from './1809020000000-CreateHumanAuthorizationObservability';

describe('CreateHumanAuthorizationObservability1809020000000', () => {
  const migration = new CreateHumanAuthorizationObservability1809020000000();

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

  it('creates human_auth_verification_events without any uniqueness on assertion_id', async () => {
    const sql = await collectSql('up');

    for (const fragment of [
      'CREATE TABLE IF NOT EXISTS human_auth_verification_events',
      'assertion_id uuid NOT NULL',
      'credential_id uuid NOT NULL',
      'credential_version integer NOT NULL',
      'epoch_sequence bigint NOT NULL CHECK (epoch_sequence >= 0)',
      "epoch_digest varchar(71) NOT NULL CHECK (epoch_digest ~ '^sha256:[0-9a-f]{64}$')",
      'authorizer_user_id uuid NOT NULL',
      "operation_digest varchar(71) NOT NULL CHECK (operation_digest ~ '^sha256:[0-9a-f]{64}$')",
      'CONSTRAINT fk_human_auth_verification_events_authorizer FOREIGN KEY (authorizer_user_id) REFERENCES users(id) ON DELETE RESTRICT',
      'trust_level varchar(64) NOT NULL',
      'decision varchar(32) NOT NULL',
      'CREATE INDEX IF NOT EXISTS idx_human_auth_verification_events_assertion',
      'ON human_auth_verification_events (tenant_id, assertion_id)',
      'duplicate verification of an unconsumed assertion is harmless',
    ]) {
      expect(sql).toContain(fragment);
    }

    // The design states duplicate verification of an unconsumed assertion is harmless, and that
    // consumption uniqueness belongs to the consuming table.
    expect(sql).not.toContain('UNIQUE (tenant_id, assertion_id)');
    expect(sql).not.toContain('uq_human_auth_verification_events');
  });

  it('stores no assertion body, PIN material, or verifier material', async () => {
    const sql = await collectSql('up');

    for (const fragment of [
      'assertion_body',
      'pin_hash',
      'pin_verifier',
      'verifier_encoded',
      'secret_hmac',
    ]) {
      expect(sql).not.toContain(fragment);
    }
  });

  it('creates human_auth_rollout_cohorts with build-pair uniqueness and the OWNER acceptance gate', async () => {
    const sql = await collectSql('up');

    for (const fragment of [
      'CREATE TABLE IF NOT EXISTS human_auth_rollout_cohorts',
      'pos_build varchar(128) NOT NULL',
      'backend_build varchar(128) NOT NULL',
      'policy_schema varchar(128) NOT NULL',
      'assertion_schema varchar(128) NOT NULL',
      'enabled boolean NOT NULL DEFAULT false',
      'owner_acceptance_actor_id uuid NULL',
      'owner_acceptance_ref varchar(255) NULL',
      'owner_acceptance_at timestamptz NULL',
      'CONSTRAINT uq_human_auth_rollout_cohorts_build_pair UNIQUE (tenant_id, pos_build, backend_build)',
      'CONSTRAINT ck_human_auth_rollout_cohorts_owner_acceptance CHECK (',
      'enabled = false OR ( owner_acceptance_actor_id IS NOT NULL',
      'AND owner_acceptance_ref IS NOT NULL',
      'AND owner_acceptance_at IS NOT NULL',
      'CREATE INDEX IF NOT EXISTS idx_human_auth_rollout_cohorts_tenant_enabled',
      'ON human_auth_rollout_cohorts (tenant_id, enabled)',
    ]) {
      expect(sql).toContain(fragment);
    }

    // A version bump alone must never enable a cohort, so the default has to be disabled.
    expect(sql).not.toContain('enabled boolean NOT NULL DEFAULT true');
  });

  it('enables and forces RLS with the correct policies on both tables', async () => {
    const sql = await collectSql('up');

    for (const fragment of [
      "current_setting('app.tenant_id', true)",
      'ALTER TABLE human_auth_verification_events ENABLE ROW LEVEL SECURITY',
      'ALTER TABLE human_auth_verification_events FORCE ROW LEVEL SECURITY',
      'ALTER TABLE human_auth_rollout_cohorts ENABLE ROW LEVEL SECURITY',
      'ALTER TABLE human_auth_rollout_cohorts FORCE ROW LEVEL SECURITY',
      'CREATE POLICY human_auth_verification_events_tenant_select ON human_auth_verification_events',
      'CREATE POLICY human_auth_verification_events_tenant_insert ON human_auth_verification_events FOR INSERT WITH CHECK',
      'CREATE POLICY human_auth_rollout_cohorts_tenant_select ON human_auth_rollout_cohorts',
      'CREATE POLICY human_auth_rollout_cohorts_tenant_insert ON human_auth_rollout_cohorts FOR INSERT WITH CHECK',
      'CREATE POLICY human_auth_rollout_cohorts_tenant_update ON human_auth_rollout_cohorts',
    ]) {
      expect(sql).toContain(fragment);
    }

    for (const fragment of [
      'human_auth_verification_events_tenant_update',
      'human_auth_verification_events_tenant_delete',
      'human_auth_rollout_cohorts_tenant_delete',
    ]) {
      expect(sql).not.toContain(fragment);
    }
  });

  it('attaches append-only guards to the verification event table at row and statement level', async () => {
    const sql = await collectSql('up');

    for (const fragment of [
      'CREATE OR REPLACE FUNCTION guard_human_auth_observability_append_only_mutation() RETURNS trigger AS $$',
      'BEFORE UPDATE OR DELETE ON human_auth_verification_events FOR EACH ROW',
      'BEFORE UPDATE OR DELETE ON human_auth_verification_events FOR EACH STATEMENT',
      'EXECUTE FUNCTION guard_human_auth_observability_append_only_mutation()',
    ]) {
      expect(sql).toContain(fragment);
    }
  });

  it('owns its guard function so the three migrations stay independently revertible', async () => {
    const sql = await collectSql('up');

    // Each OHAC migration owns its own enforcement function. Creating or dropping another
    // migration's guard from here would couple the reverts together and could unbind triggers that
    // the other migration still relies on.
    for (const fragment of [
      'CREATE OR REPLACE FUNCTION guard_human_auth_append_only_mutation()',
      'CREATE OR REPLACE FUNCTION guard_human_auth_recovery_append_only_mutation()',
      'CREATE OR REPLACE FUNCTION guard_human_auth_recovery_token_transition()',
      'CREATE OR REPLACE FUNCTION guard_human_auth_recovery_token_no_delete()',
      'CREATE OR REPLACE FUNCTION guard_human_auth_ack_floor_monotonic()',
      'CREATE OR REPLACE FUNCTION guard_human_auth_ack_floor_no_delete()',
    ]) {
      expect(sql).not.toContain(fragment);
    }
  });

  it('down removes enforcement objects in order, drops no table, and touches no other guard', async () => {
    const sql = await collectSql('down');

    const triggerIndex = sql.indexOf('DROP TRIGGER IF EXISTS');
    const functionIndex = sql.indexOf('DROP FUNCTION IF EXISTS');
    expect(triggerIndex).toBeGreaterThanOrEqual(0);
    expect(functionIndex).toBeGreaterThan(triggerIndex);

    for (const fragment of [
      'DROP TRIGGER IF EXISTS trg_human_auth_append_only_verification_events_row ON human_auth_verification_events',
      'DROP TRIGGER IF EXISTS trg_human_auth_append_only_verification_events_stmt ON human_auth_verification_events',
      'DROP FUNCTION IF EXISTS guard_human_auth_observability_append_only_mutation()',
    ]) {
      expect(sql).toContain(fragment);
    }

    expect(sql).not.toContain('DROP TABLE');
    for (const fragment of [
      'DROP FUNCTION IF EXISTS guard_human_auth_append_only_mutation()',
      'DROP FUNCTION IF EXISTS guard_human_auth_recovery_append_only_mutation()',
      'DROP FUNCTION IF EXISTS guard_human_auth_recovery_token_transition()',
      'DROP FUNCTION IF EXISTS guard_human_auth_recovery_token_no_delete()',
    ]) {
      expect(sql).not.toContain(fragment);
    }
  });

  it('does not create tables owned by the other OHAC migrations', async () => {
    const sql = await collectSql('up');

    for (const fragment of [
      'human_auth_policy_epochs',
      'human_auth_terminal_ack_history',
      'human_auth_terminal_ack_floor',
      'human_auth_recovery_tokens',
      'human_auth_recovery_events',
    ]) {
      expect(sql).not.toContain(fragment);
    }
  });
});
