import { QueryResult, type QueryRunner } from 'typeorm';
import { AddTipsToInvoices1809470000000 } from './1809470000000-AddTipsToInvoices';

describe('AddTipsToInvoices1809470000000', () => {
  const migration = new AddTipsToInvoices1809470000000();

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

  it('adds the four nullable tip columns to invoices', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);

    const sql = queries.join('\n');
    expect(sql).toContain('ALTER TABLE invoices');
    expect(sql).toContain(
      'ADD COLUMN IF NOT EXISTS tip_amount_nio numeric(12, 2)',
    );
    expect(sql).toContain(
      'ADD COLUMN IF NOT EXISTS tip_amount_usd numeric(12, 2)',
    );
    expect(sql).toContain(
      'ADD COLUMN IF NOT EXISTS tip_percentage numeric(5, 2)',
    );
    expect(sql).toContain(
      'ADD COLUMN IF NOT EXISTS tip_eligible_base_nio numeric(12, 2)',
    );
    // All four columns are nullable with no default: AD-10 forbids
    // backfilling historical invoices to 0, so NULL means "unknown /
    // legacy pre-remediation", never an explicit zero tip.
    expect(sql).not.toMatch(/NOT NULL/);
    expect(sql).not.toMatch(/DEFAULT/i);
    expect(sql).not.toContain('UPDATE invoices');
  });

  it('is idempotent when re-applied', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);
    await migration.up(queryRunner);

    const sql = queries.join('\n');
    expect(sql).toContain('IF NOT EXISTS');
  });

  it('drops the tip columns on rollback', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.down(queryRunner);

    const sql = queries.join('\n');
    expect(sql).toContain('ALTER TABLE invoices');
    expect(sql).toContain('DROP COLUMN IF EXISTS tip_amount_nio');
    expect(sql).toContain('DROP COLUMN IF EXISTS tip_amount_usd');
    expect(sql).toContain('DROP COLUMN IF EXISTS tip_percentage');
    expect(sql).toContain('DROP COLUMN IF EXISTS tip_eligible_base_nio');
  });
});
