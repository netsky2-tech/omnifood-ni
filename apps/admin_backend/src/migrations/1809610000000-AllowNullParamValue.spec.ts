import { QueryResult, type QueryRunner } from 'typeorm';
import { AllowNullParamValue1809610000000 } from './1809610000000-AllowNullParamValue';

describe('AllowNullParamValue1809610000000', () => {
  const migration = new AllowNullParamValue1809610000000();

  const createQueryRunner = () => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn((sql: string): Promise<QueryResult> => {
        queries.push(sql);
        return Promise.resolve(new QueryResult());
      }),
    } as unknown as QueryRunner;

    return { queryRunner, queries };
  };

  it('drops the NOT NULL constraint on sys_parametros_config.param_value', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);

    const sql = queries.join('\n');
    expect(sql).toContain('ALTER TABLE sys_parametros_config');
    expect(sql).toContain('ALTER COLUMN param_value DROP NOT NULL');
  });

  it('is idempotent and table-guarded on re-application', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);
    await migration.up(queryRunner);

    const sql = queries.join('\n');
    // Idempotence: the DROP NOT NULL only fires while is_nullable = 'NO'.
    expect(sql).toContain("is_nullable = 'NO'");
    // A partial-ledger re-run without the table must not crash.
    expect(sql).toContain("to_regclass('sys_parametros_config') IS NULL");
  });

  it('never rewrites or deletes rows (the append-only tombstone design stays intact)', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);

    const sql = queries.join('\n');
    expect(sql).not.toMatch(/\bDELETE\b/i);
    expect(sql).not.toMatch(/\bUPDATE\s+sys_parametros_config\b/i);
    expect(sql).not.toContain('DROP TRIGGER');
    expect(sql).not.toContain('DROP TABLE');
  });

  it('restores NOT NULL on rollback ONLY while no null tombstone rows exist', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.down(queryRunner);

    const sql = queries.join('\n');
    expect(sql).toContain('ALTER COLUMN param_value SET NOT NULL');
    // Honest rollback: refuse when tombstones exist instead of silently
    // re-breaking the clear path or destroying rows.
    expect(sql).toContain('param_value IS NULL');
    expect(sql).toContain('RAISE EXCEPTION');
  });

  it('never drops the trigger or deletes tombstones during rollback (fiscal history is never destroyed)', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.down(queryRunner);

    const sql = queries.join('\n');
    expect(sql).not.toContain('DROP TRIGGER');
    expect(sql).not.toMatch(/\bDELETE\b/i);
  });
});
