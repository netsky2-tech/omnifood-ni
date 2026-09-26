import { QueryResult, type QueryRunner } from 'typeorm';
import { AddShiftIdAndLocalIssueDateToInvoices1809400000000 } from './1809400000000-AddShiftIdAndLocalIssueDateToInvoices';

describe('AddShiftIdAndLocalIssueDateToInvoices1809400000000', () => {
  const migration = new AddShiftIdAndLocalIssueDateToInvoices1809400000000();

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

  it('adds nullable shift_id (uuid) and local_issue_date (date) to invoices', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);

    const sql = queries.join('\n');
    expect(sql).toContain('ALTER TABLE invoices');
    // shift_id matches cash_movements.shift_id (uuid): the POS assigns
    // Uuid().v4() cashier session ids at checkout.
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS shift_id uuid');
    // local_issue_date matches the POS ISO YYYY-MM-DD string semantics.
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS local_issue_date date');
    // Both columns are nullable: the facts never existed server-side for
    // legacy invoices (D-9, no backfill).
    expect(sql).not.toMatch(/shift_id uuid NOT NULL/);
    expect(sql).not.toMatch(/local_issue_date date NOT NULL/);
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

    expect(queries.join('\n')).not.toContain('DROP COLUMN');
  });
});
