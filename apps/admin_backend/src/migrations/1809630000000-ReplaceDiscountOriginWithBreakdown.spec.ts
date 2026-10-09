import { QueryResult, type QueryRunner } from 'typeorm';
import { ReplaceDiscountOriginWithBreakdown1809630000000 } from './1809630000000-ReplaceDiscountOriginWithBreakdown';

describe('ReplaceDiscountOriginWithBreakdown1809630000000', () => {
  const migration = new ReplaceDiscountOriginWithBreakdown1809630000000();

  /**
   * Mocked QueryRunner that records every statement and can be programmed
   * with canned results per statement substring (the migration reads
   * information_schema before deciding what to do).
   */
  const createQueryRunner = (
    columnState: Array<{ udtName: string }> = [
      { udtName: 'invoice_items_discount_origin_enum' },
    ],
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

  it('replaces the categorical enum column with a NULLABLE jsonb breakdown column, no default and no backfill', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);

    const sql = queries.join('\n');
    expect(sql).toContain('DROP COLUMN IF EXISTS discount_origin');
    expect(sql).toContain('ADD COLUMN discount_origin jsonb');
    // No fabricated meaning: nullable, no default, no backfill statement.
    expect(sql).not.toContain('SET DEFAULT');
    expect(sql).not.toContain('NOT NULL');
    expect(sql).not.toMatch(/UPDATE\s+invoice_items/i);
    // The replacement (not a rename): the column is dropped BEFORE the jsonb
    // column is added under the same name.
    expect(sql.indexOf('DROP COLUMN')).toBeLessThan(
      sql.indexOf('ADD COLUMN discount_origin jsonb'),
    );
  });

  it('adds the chk_ check constraint enforcing the key whitelist and positive numeric amounts', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);

    const sql = queries.join('\n');
    // Convention source: chk_invoice_items_credit_note_origin and
    // chk_users_security_version_positive — DROP IF EXISTS then ADD CONSTRAINT.
    expect(sql).toContain(
      'DROP CONSTRAINT IF EXISTS chk_invoice_items_discount_origin_breakdown',
    );
    expect(sql).toContain(
      'ADD CONSTRAINT chk_invoice_items_discount_origin_breakdown',
    );
    // Keys must be a subset of the known origins (jsonb `- text[]` emptiness)
    // and values must be positive numbers (jsonpath), guarded to objects.
    // An empty object is refused explicitly (`<> '{}'::jsonb`): an empty key
    // set would otherwise pass the subset rule and create a third state
    // between NULL and a populated breakdown.
    expect(sql).toContain("jsonb_typeof(discount_origin) = 'object'");
    expect(sql).toContain("<> '{}'::jsonb");
    expect(sql).toContain("'manual','promotion','loyalty'");
    expect(sql).toContain('jsonb_path_exists');
  });

  it('drops the now-orphaned enum type through the schema-resolved pg_type guard', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);

    const sql = queries.join('\n');
    expect(sql).toContain('DROP TYPE invoice_items_discount_origin_enum');
    expect(sql).toContain('n.nspname = current_schema()');
    // The column must be gone before the type can be dropped (dependency).
    expect(sql.indexOf('DROP COLUMN IF EXISTS discount_origin')).toBeLessThan(
      sql.indexOf('DROP TYPE invoice_items_discount_origin_enum'),
    );
  });

  it('is a no-op on the column swap when the column is already jsonb (idempotent re-run), but still ensures the constraint', async () => {
    const { queryRunner, queries } = createQueryRunner([{ udtName: 'jsonb' }]);

    await migration.up(queryRunner);

    const sql = queries.join('\n');
    expect(sql).not.toContain('ADD COLUMN');
    expect(sql).not.toContain('DROP COLUMN');
    expect(sql).toContain(
      'ADD CONSTRAINT chk_invoice_items_discount_origin_breakdown',
    );
  });

  it('adds the jsonb column when the enum column is absent (fresh state)', async () => {
    const { queryRunner, queries } = createQueryRunner([]);

    await migration.up(queryRunner);

    const sql = queries.join('\n');
    expect(sql).not.toContain('DROP COLUMN');
    expect(sql).toContain('ADD COLUMN discount_origin jsonb');
  });

  it('fails closed when the column exists with an unexpected type instead of guessing', async () => {
    const { queryRunner } = createQueryRunner([{ udtName: 'varchar' }]);

    await expect(migration.up(queryRunner)).rejects.toThrow(
      /UNEXPECTED_DISCOUNT_ORIGIN_COLUMN_TYPE/,
    );
  });

  it('drops the constraint and the jsonb column, then restores the enum column and type in down() — honestly without the breakdown amounts', async () => {
    const { queryRunner, queries } = createQueryRunner([{ udtName: 'jsonb' }]);

    await migration.down(queryRunner);

    const sql = queries.join('\n');
    expect(sql).toContain(
      'DROP CONSTRAINT IF EXISTS chk_invoice_items_discount_origin_breakdown',
    );
    expect(sql).toContain('DROP COLUMN IF EXISTS discount_origin');
    expect(sql).toContain('CREATE TYPE invoice_items_discount_origin_enum');
    expect(sql).toContain('n.nspname = current_schema()');
    expect(sql).toContain('ADD COLUMN discount_origin');
    expect(sql).toContain('discount_origin invoice_items_discount_origin_enum');
    // The constraint and the jsonb column (with the per-origin amounts it
    // holds) go before the categorical column is rebuilt.
    expect(
      sql.indexOf(
        'DROP CONSTRAINT IF EXISTS chk_invoice_items_discount_origin_breakdown',
      ),
    ).toBeLessThan(sql.indexOf('DROP COLUMN IF EXISTS discount_origin'));
    // No fabricated data: down() never claims to reconstruct the amounts.
    expect(sql).not.toMatch(/UPDATE\s+invoice_items/i);
  });
});
