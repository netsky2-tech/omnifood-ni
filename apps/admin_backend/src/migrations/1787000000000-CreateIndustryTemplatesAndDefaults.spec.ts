import { QueryResult, type QueryRunner } from 'typeorm';
import { CreateIndustryTemplatesAndDefaults1787000000000 } from './1787000000000-CreateIndustryTemplatesAndDefaults';

describe('CreateIndustryTemplatesAndDefaults1787000000000 (Unit)', () => {
  const migration = new CreateIndustryTemplatesAndDefaults1787000000000();

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

  it('creates tables and seeds 3 industry archetypes on up', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);

    const sql = queries.join('\n');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS industry_templates');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS template_insumos');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS template_products');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS template_recipe_items');

    expect(sql).toContain("'CAFETERIA'");
    expect(sql).toContain("'BAR_RESTAURANTE'");
    expect(sql).toContain("'RETAIL_MINIMARKET'");

    expect(sql).toContain('Granos de Café Especial');
    expect(sql).toContain('Pan Brioche para Hamburguesa');
    expect(sql).toContain('Gaseosa Coca Cola 500ml');
  });

  it('drops tables on down in reverse dependency order', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.down(queryRunner);

    const sql = queries.join('\n');

    expect(sql).toContain('DROP TABLE IF EXISTS template_recipe_items');
    expect(sql).toContain('DROP TABLE IF EXISTS template_products');
    expect(sql).toContain('DROP TABLE IF EXISTS template_insumos');
    expect(sql).toContain('DROP TABLE IF EXISTS industry_templates');
  });
});
