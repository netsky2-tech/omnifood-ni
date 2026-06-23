import { QueryResult, type QueryRunner } from 'typeorm';
import { CreateCatalogValues1768000000000 } from './1768000000000-CreateCatalogValues';

describe('CreateCatalogValues1768000000000', () => {
  const migration = new CreateCatalogValues1768000000000();

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

  it('creates catalog_values with tenant indexes and RLS policies', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);

    const sql = queries.join('\n');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS catalog_values');
    expect(sql).toContain('tenant_id varchar NOT NULL');
    expect(sql).toContain('catalog_type varchar NOT NULL');
    expect(sql).toContain('code varchar NOT NULL');
    expect(sql).toContain('label varchar NOT NULL');
    expect(sql).toContain('description varchar');
    expect(sql).toContain('uq_catalog_values_tenant_type_code');
    expect(sql).toContain('tenant_id, catalog_type, code');
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('FORCE ROW LEVEL SECURITY');
    expect(sql).toContain("current_setting('app.tenant_id', true)");
  });

  it('drops policies, indexes, and table in down migration', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.down(queryRunner);

    const sql = queries.join('\n');
    expect(sql).toContain('DROP POLICY IF EXISTS catalog_values_tenant_select');
    expect(sql).toContain(
      'DROP INDEX IF EXISTS uq_catalog_values_tenant_type_code',
    );
    expect(sql).toContain('DROP TABLE IF EXISTS catalog_values');
  });
});
