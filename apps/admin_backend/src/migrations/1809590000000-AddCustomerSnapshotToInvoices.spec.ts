import { QueryResult, type QueryRunner } from 'typeorm';
import { AddCustomerSnapshotToInvoices1809590000000 } from './1809590000000-AddCustomerSnapshotToInvoices';

describe('AddCustomerSnapshotToInvoices1809590000000', () => {
  const migration = new AddCustomerSnapshotToInvoices1809590000000();

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

  it('adds nullable customer_name (varchar) and customer_tax_id (varchar) to invoices', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);

    const sql = queries.join('\n');
    expect(sql).toContain('ALTER TABLE invoices');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS customer_name varchar');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS customer_tax_id varchar');
    expect(sql).not.toMatch(/customer_name varchar NOT NULL/);
    expect(sql).not.toMatch(/customer_tax_id varchar NOT NULL/);
  });

  it('is idempotent when re-applied', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);
    await migration.up(queryRunner);

    const sql = queries.join('\n');
    expect(sql).toContain('IF NOT EXISTS');
  });

  it('preserves the fiscal columns on rollback (fiscal facts are never deleted)', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.down(queryRunner);

    const sql = queries.join('\n');
    expect(sql).not.toContain('DROP COLUMN');
    expect(sql).toContain('SELECT 1');
  });
});
