import { QueryResult, type QueryRunner } from 'typeorm';
import { AddHumanAuthorizationAttemptResetGeneration1809030000000 } from './1809030000000-AddHumanAuthorizationAttemptResetGeneration';

describe('AddHumanAuthorizationAttemptResetGeneration1809030000000', () => {
  const migration =
    new AddHumanAuthorizationAttemptResetGeneration1809030000000();

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

  it('adds the per-user attempt_reset_generation column idempotently with a zero default', async () => {
    const sql = await collectSql('up');

    expect(sql).toContain('ALTER TABLE users');
    expect(sql).toContain(
      'ADD COLUMN IF NOT EXISTS attempt_reset_generation bigint NOT NULL DEFAULT 0',
    );
  });

  it('attaches a named non-negative CHECK constraint idempotently', async () => {
    const sql = await collectSql('up');

    // Postgres has no ADD CONSTRAINT IF NOT EXISTS, so the idempotent form is
    // drop-if-exists followed by add: re-running up() converges to one named check.
    expect(sql).toContain(
      'DROP CONSTRAINT IF EXISTS ck_users_attempt_reset_generation_non_negative',
    );
    expect(sql).toContain(
      'ADD CONSTRAINT ck_users_attempt_reset_generation_non_negative CHECK (attempt_reset_generation >= 0)',
    );
  });

  it('edits no other table and adds no entity-owned artifact', async () => {
    const sql = await collectSql('up');

    expect(sql).not.toContain('CREATE TABLE');
    expect(sql).not.toContain('security_profiles');
  });

  it('is convergent under a repeated up() run', async () => {
    // Idempotency must hold by construction, not by accident: a second up() on an already-migrated
    // database must produce the exact same SQL as the first run.
    const first = await collectSql('up');
    const second = await collectSql('up');

    expect(second).toBe(first);
  });

  it('down retains the durable column, its data, and the named constraint', async () => {
    const sql = await collectSql('down');

    // Design §11.2 decision 14 makes this generation durable per-user state, and the slice
    // contract forbids destructive rollback: down() must not remove the column, its rows' values,
    // or the non-negative guard.
    expect(sql).not.toContain('DROP COLUMN');
    expect(sql).not.toContain('DROP CONSTRAINT');
    expect(sql).not.toContain('DROP TABLE');
  });
});
