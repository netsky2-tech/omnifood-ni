import { QueryResult, type QueryRunner } from 'typeorm';
import { CreateHumanAuthorizationRecovery1809010000000 } from './1809010000000-CreateHumanAuthorizationRecovery';

describe('CreateHumanAuthorizationRecovery1809010000000', () => {
  const migration = new CreateHumanAuthorizationRecovery1809010000000();

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

  it('creates human_auth_recovery_tokens with columns, checks, indexes, and no plaintext secret column', async () => {
    const sql = await collectSql('up');

    for (const fragment of [
      'CREATE TABLE IF NOT EXISTS human_auth_recovery_tokens',
      'token_id uuid PRIMARY KEY DEFAULT gen_random_uuid()',
      'tenant_id varchar(128) NOT NULL',
      'terminal_id varchar(128) NOT NULL',
      'secret_hmac varchar(64) NOT NULL',
      "status varchar(32) NOT NULL DEFAULT 'ISSUED' CHECK (status IN ('ISSUED', 'REVOKED', 'REDEEMED'))",
      'issued_by_user_id uuid NOT NULL',
      'issuance_reason varchar(255) NOT NULL',
      'issued_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP',
      'expires_at timestamptz NOT NULL CHECK (expires_at > issued_at)',
      'revoked_at timestamptz NULL',
      'revoked_by_user_id uuid NULL',
      'revocation_reason varchar(255) NULL',
      'redeemed_at timestamptz NULL',
      'redemption_credential_id uuid NULL',
      'idempotency_key varchar(128) NULL',
      'redemption_request_hash varchar(128) NULL',
      'CONSTRAINT ck_human_auth_recovery_tokens_redemption CHECK (',
      "status <> 'REDEEMED' OR (redeemed_at IS NOT NULL AND redemption_credential_id IS NOT NULL)",
      'CONSTRAINT ck_human_auth_recovery_tokens_revocation CHECK (',
      "status <> 'REVOKED' OR revoked_at IS NOT NULL",
      'CONSTRAINT fk_human_auth_recovery_tokens_issuer FOREIGN KEY (issued_by_user_id) REFERENCES users(id) ON DELETE RESTRICT',
      'CREATE UNIQUE INDEX IF NOT EXISTS uq_human_auth_recovery_tokens_hmac',
      'ON human_auth_recovery_tokens (tenant_id, secret_hmac)',
      'CREATE INDEX IF NOT EXISTS idx_human_auth_recovery_tokens_tenant_terminal',
      'ON human_auth_recovery_tokens (tenant_id, terminal_id)',
      'CREATE INDEX IF NOT EXISTS idx_human_auth_recovery_tokens_expiry',
      'ON human_auth_recovery_tokens (status, expires_at)',
    ]) {
      expect(sql).toContain(fragment);
    }

    expect(sql).not.toContain('secret varchar');
    expect(sql).not.toContain('secret text');
    expect(sql).not.toContain('plaintext');
  });

  it('enforces recovery token state transitions and evidence retention with dedicated triggers', async () => {
    const sql = await collectSql('up');

    for (const fragment of [
      'CREATE OR REPLACE FUNCTION guard_human_auth_recovery_token_transition() RETURNS trigger AS $$',
      'NEW.token_id IS DISTINCT FROM OLD.token_id',
      'NEW.tenant_id IS DISTINCT FROM OLD.tenant_id',
      'NEW.terminal_id IS DISTINCT FROM OLD.terminal_id',
      'NEW.secret_hmac IS DISTINCT FROM OLD.secret_hmac',
      'NEW.issued_by_user_id IS DISTINCT FROM OLD.issued_by_user_id',
      'NEW.issued_at IS DISTINCT FROM OLD.issued_at',
      "OLD.status = 'REDEEMED'",
      "OLD.status = 'REVOKED'",
      'NEW.redeemed_at IS NULL OR NEW.redemption_credential_id IS NULL',
      'NEW.revoked_at IS NULL',
      'BEFORE UPDATE ON human_auth_recovery_tokens FOR EACH ROW',
      'BEFORE DELETE ON human_auth_recovery_tokens FOR EACH ROW',
      'EXECUTE FUNCTION guard_human_auth_recovery_token_no_delete()',
    ]) {
      expect(sql).toContain(fragment);
    }

    expect(sql).not.toContain("'EXPIRED'");
  });

  it('creates human_auth_recovery_events with the event check, idempotent expiry index, and append-only guards', async () => {
    const sql = await collectSql('up');

    for (const fragment of [
      'CREATE TABLE IF NOT EXISTS human_auth_recovery_events',
      "event_type varchar(32) NOT NULL CHECK (event_type IN ('ISSUANCE', 'DENIAL', 'EXPIRY_OBSERVED', 'REVOCATION', 'REDEMPTION', 'RACE_LOSS'))",
      'CREATE UNIQUE INDEX IF NOT EXISTS uq_human_auth_recovery_events_expiry_observed',
      "ON human_auth_recovery_events (tenant_id, token_id) WHERE event_type = 'EXPIRY_OBSERVED'",
      'CREATE INDEX IF NOT EXISTS idx_human_auth_recovery_events_token',
      'ON human_auth_recovery_events (tenant_id, token_id, occurred_at DESC)',
      'CONSTRAINT fk_human_auth_recovery_events_token FOREIGN KEY (token_id) REFERENCES human_auth_recovery_tokens(token_id) ON DELETE RESTRICT',
      'BEFORE UPDATE OR DELETE ON human_auth_recovery_events FOR EACH ROW',
      'BEFORE UPDATE OR DELETE ON human_auth_recovery_events FOR EACH STATEMENT',
      'EXECUTE FUNCTION guard_human_auth_recovery_append_only_mutation()',
    ]) {
      expect(sql).toContain(fragment);
    }
  });

  it('enables and forces RLS with the correct policies on both tables', async () => {
    const sql = await collectSql('up');

    for (const fragment of [
      "current_setting('app.tenant_id', true)",
      'ALTER TABLE human_auth_recovery_tokens ENABLE ROW LEVEL SECURITY',
      'ALTER TABLE human_auth_recovery_tokens FORCE ROW LEVEL SECURITY',
      'ALTER TABLE human_auth_recovery_events ENABLE ROW LEVEL SECURITY',
      'ALTER TABLE human_auth_recovery_events FORCE ROW LEVEL SECURITY',
      'CREATE POLICY human_auth_recovery_tokens_tenant_select ON human_auth_recovery_tokens',
      'CREATE POLICY human_auth_recovery_tokens_tenant_insert ON human_auth_recovery_tokens FOR INSERT WITH CHECK',
      'CREATE POLICY human_auth_recovery_tokens_tenant_update ON human_auth_recovery_tokens',
      'CREATE POLICY human_auth_recovery_events_tenant_select ON human_auth_recovery_events',
      'CREATE POLICY human_auth_recovery_events_tenant_insert ON human_auth_recovery_events FOR INSERT WITH CHECK',
    ]) {
      expect(sql).toContain(fragment);
    }

    for (const fragment of [
      'human_auth_recovery_events_tenant_update',
      'human_auth_recovery_events_tenant_delete',
    ]) {
      expect(sql).not.toContain(fragment);
    }
  });

  it('down removes enforcement objects in order and retains every table', async () => {
    const sql = await collectSql('down');

    const triggerIndex = sql.indexOf('DROP TRIGGER IF EXISTS');
    const functionIndex = sql.indexOf('DROP FUNCTION IF EXISTS');
    expect(triggerIndex).toBeGreaterThanOrEqual(0);
    expect(functionIndex).toBeGreaterThan(triggerIndex);

    for (const fragment of [
      'DROP TRIGGER IF EXISTS trg_human_auth_recovery_token_transition ON human_auth_recovery_tokens',
      'DROP TRIGGER IF EXISTS trg_human_auth_recovery_token_no_delete ON human_auth_recovery_tokens',
      'DROP TRIGGER IF EXISTS trg_human_auth_append_only_recovery_events_row ON human_auth_recovery_events',
      'DROP TRIGGER IF EXISTS trg_human_auth_append_only_recovery_events_stmt ON human_auth_recovery_events',
      'DROP FUNCTION IF EXISTS guard_human_auth_recovery_token_transition()',
      'DROP FUNCTION IF EXISTS guard_human_auth_recovery_token_no_delete()',
      'DROP FUNCTION IF EXISTS guard_human_auth_recovery_append_only_mutation()',
    ]) {
      expect(sql).toContain(fragment);
    }

    expect(sql).not.toContain('DROP TABLE');
    // The core migration owns guard_human_auth_append_only_mutation() for its own tables;
    // reverting this migration must not unbind those triggers.
    expect(sql).not.toContain(
      'DROP FUNCTION IF EXISTS guard_human_auth_append_only_mutation()',
    );
  });

  it('does not create tables owned by the other OHAC migrations', async () => {
    const sql = await collectSql('up');

    for (const fragment of [
      'human_auth_policy_epochs',
      'human_auth_terminal_ack_history',
      'human_auth_terminal_ack_floor',
      'human_auth_verification_events',
      'human_auth_rollout_cohorts',
    ]) {
      expect(sql).not.toContain(fragment);
    }
  });

  it('defines its own append-only guard so the two migrations stay independently revertible', async () => {
    const sql = await collectSql('up');

    for (const fragment of [
      'CREATE OR REPLACE FUNCTION guard_human_auth_recovery_append_only_mutation() RETURNS trigger AS $$',
      'EXECUTE FUNCTION guard_human_auth_recovery_append_only_mutation()',
    ]) {
      expect(sql).toContain(fragment);
    }

    // Creating or dropping the core migration's guard function from this migration would couple
    // the two reverts together.
    expect(sql).not.toContain(
      'CREATE OR REPLACE FUNCTION guard_human_auth_append_only_mutation()',
    );
  });
});
