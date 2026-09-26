import { QueryResult, type QueryRunner } from 'typeorm';
import { AddChangeLogSeverity1809450000000 } from './1809450000000-AddChangeLogSeverity';

describe('AddChangeLogSeverity1809450000000', () => {
  const migration = new AddChangeLogSeverity1809450000000();

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

  it('adds a nullable severity column and the tenant/severity/created aggregation index', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);

    const sql = queries.join('\n');
    expect(sql).toContain('ALTER TABLE change_log');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS severity varchar(16)');
    // Nullable: historical rows keep NULL and surface as INFO at read time
    // (backfill-free rule, AG-07). Never a NOT NULL widening.
    expect(sql).not.toMatch(/severity varchar\(16\) NOT NULL/);
    expect(sql).toContain(
      'CREATE INDEX IF NOT EXISTS idx_change_log_tenant_severity_created',
    );
    expect(sql).toContain(
      'ON change_log (tenant_id, severity, created_at)',
    );
  });

  it('is idempotent when re-applied', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);
    await migration.up(queryRunner);

    const sql = queries.join('\n');
    expect(sql).toMatch(/IF NOT EXISTS/g);
  });

  it('reverts fully on down (severity is derived data, recomputable from action)', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.down(queryRunner);

    const sql = queries.join('\n');
    expect(sql).toContain('DROP INDEX IF EXISTS idx_change_log_tenant_severity_created');
    expect(sql).toContain('DROP COLUMN IF EXISTS severity');
    // The audit history itself is never touched (DGI: audit entries are
    // never deleted).
    expect(sql).not.toContain('DELETE FROM');
    expect(sql).not.toContain('TRUNCATE');
  });
});
