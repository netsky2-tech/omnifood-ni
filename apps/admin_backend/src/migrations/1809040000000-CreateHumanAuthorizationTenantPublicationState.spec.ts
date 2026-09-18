import { QueryResult, type QueryRunner } from 'typeorm';
import { CreateHumanAuthorizationTenantPublicationState1809040000000 } from './1809040000000-CreateHumanAuthorizationTenantPublicationState';

describe('CreateHumanAuthorizationTenantPublicationState1809040000000', () => {
  const migration =
    new CreateHumanAuthorizationTenantPublicationState1809040000000();

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

  it('creates one mutable marker row per tenant keyed by tenant_id with dirty-by-default state', async () => {
    const sql = await collectSql('up');

    for (const fragment of [
      'CREATE TABLE IF NOT EXISTS human_auth_tenant_publication_state',
      'tenant_id varchar(128) PRIMARY KEY',
      'dirty boolean NOT NULL DEFAULT true',
      'revision bigint NOT NULL DEFAULT 1',
      'CHECK (revision >= 1)',
      'marked_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP',
      'published_at timestamptz NULL',
      'updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP',
    ]) {
      expect(sql).toContain(fragment);
    }
  });

  it('starts every marker dirty so the first signal cannot be silently lost', async () => {
    const sql = await collectSql('up');

    expect(sql).not.toContain('dirty boolean NOT NULL DEFAULT false');
  });

  it('enables and forces RLS with tenant select, insert, and update policies but no delete policy', async () => {
    const sql = await collectSql('up');

    for (const fragment of [
      'ALTER TABLE human_auth_tenant_publication_state ENABLE ROW LEVEL SECURITY',
      'ALTER TABLE human_auth_tenant_publication_state FORCE ROW LEVEL SECURITY',
      "current_setting('app.tenant_id', true)",
      'CREATE POLICY human_auth_tenant_publication_state_tenant_select ON human_auth_tenant_publication_state',
      'CREATE POLICY human_auth_tenant_publication_state_tenant_insert ON human_auth_tenant_publication_state FOR INSERT WITH CHECK',
      'CREATE POLICY human_auth_tenant_publication_state_tenant_update ON human_auth_tenant_publication_state',
    ]) {
      expect(sql).toContain(fragment);
    }

    expect(sql).not.toContain(
      'human_auth_tenant_publication_state_tenant_delete',
    );
  });

  it('guards updates against tenant re-identification and revision regression without append-only semantics', async () => {
    const sql = await collectSql('up');

    for (const fragment of [
      'CREATE OR REPLACE FUNCTION guard_human_auth_tenant_publication_state_mutation() RETURNS trigger AS $$',
      'IF NEW.tenant_id <> OLD.tenant_id THEN',
      'IF NEW.revision < OLD.revision THEN',
      'BEFORE UPDATE ON human_auth_tenant_publication_state FOR EACH ROW',
      'EXECUTE FUNCTION guard_human_auth_tenant_publication_state_mutation()',
    ]) {
      expect(sql).toContain(fragment);
    }

    // The publisher must be able to clear dirty/advance revision, so UPDATE and DELETE must not be
    // forbidden wholesale: no append-only row/statement denial triggers on this table.
    for (const fragment of [
      'BEFORE UPDATE OR DELETE ON human_auth_tenant_publication_state',
      'FOR EACH STATEMENT',
      'append-only',
    ]) {
      expect(sql).not.toContain(fragment);
    }
  });

  it('keeps CAS equality legal and never fabricates marker rows', async () => {
    const sql = await collectSql('up');

    // The guard forbids regression only: NEW.revision = OLD.revision (a same-value marker write)
    // must stay legal, so the comparison is `<` and never `<>`.
    expect(sql).toContain('IF NEW.revision < OLD.revision THEN');
    expect(sql).not.toContain('NEW.revision <> OLD.revision');

    // One row per tenant is a schema property (tenant_id PRIMARY KEY) that the publisher materializes
    // on demand; this migration must not backfill fabricated markers.
    expect(sql).not.toContain(
      'INSERT INTO human_auth_tenant_publication_state',
    );
  });

  it('owns its enforcement function and no other OHAC guard', async () => {
    const sql = await collectSql('up');

    for (const fragment of [
      'CREATE OR REPLACE FUNCTION guard_human_auth_append_only_mutation()',
      'CREATE OR REPLACE FUNCTION guard_human_auth_recovery_append_only_mutation()',
      'CREATE OR REPLACE FUNCTION guard_human_auth_observability_append_only_mutation()',
      'CREATE OR REPLACE FUNCTION guard_human_auth_ack_floor_monotonic()',
      'CREATE OR REPLACE FUNCTION guard_human_auth_ack_floor_no_delete()',
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

  it('down removes only its own enforcement objects and retains the table and rows', async () => {
    const sql = await collectSql('down');

    const triggerIndex = sql.indexOf('DROP TRIGGER IF EXISTS');
    const functionIndex = sql.indexOf('DROP FUNCTION IF EXISTS');
    expect(triggerIndex).toBeGreaterThanOrEqual(0);
    expect(functionIndex).toBeGreaterThan(triggerIndex);

    expect(sql).toContain(
      'DROP TRIGGER IF EXISTS trg_human_auth_tenant_publication_state_guard ON human_auth_tenant_publication_state',
    );
    expect(sql).toContain(
      'DROP FUNCTION IF EXISTS guard_human_auth_tenant_publication_state_mutation()',
    );

    // Evidence/marker retention is normative: down() never drops the marker table or its rows.
    expect(sql).not.toContain('DROP TABLE');
    expect(sql).not.toContain('DROP POLICY');
  });
});
