import { QueryResult, type QueryRunner } from 'typeorm';
import { AddReportIndexes1809530000000 } from './1809530000000-AddReportIndexes';

describe('AddReportIndexes1809530000000', () => {
  const migration = new AddReportIndexes1809530000000();

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

  it('creates the (tenant_id, created_at) index for the invoices report query', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);

    const sql = queries.join('\n');
    expect(sql).toContain(
      'CREATE INDEX IF NOT EXISTS idx_invoices_tenant_created_at',
    );
    expect(sql).toContain('ON invoices (tenant_id, created_at)');
  });

  it('creates the (tenant_id, occurred_at) index for the inventory kardex report query', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);

    const sql = queries.join('\n');
    // The PostgreSQL column is occurred_at (timestamptz); the TypeORM entity
    // property is named timestamp, but DDL must target the physical column.
    expect(sql).toContain(
      'CREATE INDEX IF NOT EXISTS idx_inventory_kardex_tenant_occurred_at',
    );
    expect(sql).toContain('ON inventory_kardex (tenant_id, occurred_at)');
    expect(sql).not.toMatch(/ON inventory_kardex \([^)]*timestamp/);
  });

  it('is idempotent when re-applied', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);
    await migration.up(queryRunner);

    expect(queries.join('\n')).toMatch(/IF NOT EXISTS/g);
  });

  it('drops only the indexes on down (no data mutation)', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.down(queryRunner);

    const sql = queries.join('\n');
    expect(sql).toContain(
      'DROP INDEX IF EXISTS idx_invoices_tenant_created_at',
    );
    expect(sql).toContain(
      'DROP INDEX IF EXISTS idx_inventory_kardex_tenant_occurred_at',
    );
    expect(sql).not.toContain('DROP TABLE');
    expect(sql).not.toContain('DROP COLUMN');
  });
});
