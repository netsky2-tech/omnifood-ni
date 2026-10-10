import { QueryResult, type QueryRunner } from 'typeorm';
import { AddDiscountOriginToInvoiceItems1809620000000 } from './1809620000000-AddDiscountOriginToInvoiceItems';

describe('AddDiscountOriginToInvoiceItems1809620000000', () => {
  const migration = new AddDiscountOriginToInvoiceItems1809620000000();

  /**
   * Mocked QueryRunner that records every statement and can be programmed
   * with canned results per statement substring (the migration reads
   * information_schema before deciding what to do).
   */
  const createQueryRunner = (
    columnState: Array<{ udtName: string }> = [],
  ): { queryRunner: QueryRunner; queries: string[] } => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn((sql: string): Promise<QueryResult> => {
        queries.push(sql);
        if (sql.includes('information_schema.columns')) {
          return Promise.resolve(columnState) as never;
        }
        return Promise.resolve(new QueryResult());
      }),
    } as unknown as QueryRunner;

    return { queryRunner, queries };
  };

  it('creates the enum type guarded on pg_type and adds a NULLABLE column with NO default and NO backfill', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);

    const sql = queries.join('\n');
    expect(sql).toContain('CREATE TYPE invoice_items_discount_origin_enum');
    expect(sql).toContain("AS ENUM ('manual', 'promotion', 'loyalty')");
    // Schema-resolved guard, never hardcoded to public (the trap documented
    // by ReconcileEnumColumns and the bootstrap guards).
    expect(sql).toContain('n.nspname = current_schema()');
    expect(sql).toContain('ADD COLUMN discount_origin');
    expect(sql).toContain('discount_origin invoice_items_discount_origin_enum');
    // No fabricated meaning: nullable, no default, no backfill statement.
    expect(sql).not.toContain('SET DEFAULT');
    expect(sql).not.toContain('NOT NULL');
    expect(sql).not.toMatch(/UPDATE\s+invoice_items/i);
  });

  it('is a no-op on the ALTER when the column already has the enum type (idempotent re-run)', async () => {
    const { queryRunner, queries } = createQueryRunner([
      { udtName: 'invoice_items_discount_origin_enum' },
    ]);

    await migration.up(queryRunner);

    expect(queries.join('\n')).not.toContain('ADD COLUMN');
  });

  it('fails closed when the column exists with an unexpected type instead of guessing', async () => {
    const { queryRunner } = createQueryRunner([{ udtName: 'varchar' }]);

    await expect(migration.up(queryRunner)).rejects.toThrow(
      /UNEXPECTED_DISCOUNT_ORIGIN_COLUMN_TYPE/,
    );
  });

  it('drops the column and then the guarded type in down()', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.down(queryRunner);

    const sql = queries.join('\n');
    expect(sql).toContain('DROP COLUMN IF EXISTS discount_origin');
    expect(sql).toContain('DROP TYPE invoice_items_discount_origin_enum');
    // The type is dropped only through the same schema-resolved guard.
    expect(sql.indexOf('DROP COLUMN')).toBeLessThan(
      sql.indexOf('DROP TYPE invoice_items_discount_origin_enum'),
    );
  });
});
