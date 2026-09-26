import { QueryResult, type QueryRunner } from 'typeorm';
import { AddProductTypeToTemplateProducts1809500000000 } from './1809500000000-AddProductTypeToTemplateProducts';

describe('AddProductTypeToTemplateProducts1809500000000', () => {
  const migration = new AddProductTypeToTemplateProducts1809500000000();

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

  it('adds a nullable product_type varchar WITHOUT a DB default on template_products', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);

    const sql = queries.join('\n');
    expect(sql).toContain('ALTER TABLE template_products');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS product_type varchar');
    // Nullable with NO default, deliberately: "absent" must stay
    // distinguishable from "explicitly SIMPLE". A NOT NULL DEFAULT 'SIMPLE'
    // would silently declare SIMPLE for every row inserted without a type
    // (synchronize-built schemas, future tooling) and turn "not declared"
    // into an apply-time data error instead of an honest shape-based
    // resolution. template_products is a global catalog table (no tenant_id)
    // whose columns are all varchar.
    expect(sql).not.toContain('NOT NULL');
    expect(sql).not.toContain('DEFAULT');
  });

  it('backfills existing rows by row shape: recipe items → COMPOUND, none → SIMPLE', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);

    const sql = queries.join('\n');
    // A seeded template row that carries recipe items must come out as the
    // recipe type: the migration would otherwise create a schema that lies
    // about the data (applyTemplate would read recipe items next to an
    // undeclared type and produce a recipe-branch product without a
    // backfilled declaration).
    expect(sql).toContain("SET product_type = 'COMPOUND'");
    expect(sql).toContain('template_recipe_items');
    expect(sql).toContain('tri.template_product_id = tp.id');
    expect(sql).toContain("SET product_type = 'SIMPLE'");
    // Both backfills only touch rows the column default did not declare:
    // NULL means "never declared", so explicit author values are never
    // clobbered — which is also what makes the migration idempotent.
    expect(sql.match(/tp\.product_type IS NULL/g)?.length).toBe(2);
  });

  it('is idempotent when re-applied (ADD COLUMN IF NOT EXISTS, NULL-guarded backfills)', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);
    await migration.up(queryRunner);

    const sql = queries.join('\n');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS');
    // After the first pass no row is NULL, so both guarded UPDATEs rewrite
    // zero rows on the second pass.
    expect(sql.match(/tp\.product_type IS NULL/g)?.length).toBe(4);
  });

  it('drops only the product_type column on rollback', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.down(queryRunner);

    const sql = queries.join('\n');
    expect(sql).toContain(
      'ALTER TABLE template_products DROP COLUMN IF EXISTS product_type',
    );
    // Neither template_products rows nor the recipe items are touched.
    expect(sql).not.toContain('DELETE');
    expect(sql).not.toContain('DROP TABLE');
  });
});
