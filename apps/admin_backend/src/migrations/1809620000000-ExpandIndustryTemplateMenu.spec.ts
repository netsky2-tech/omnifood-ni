import { QueryResult, type QueryRunner } from 'typeorm';
import { ExpandIndustryTemplateMenu1809620000000 } from './1809620000000-ExpandIndustryTemplateMenu';

/**
 * T11/F4 — owner-approved menu expansion of the industry template SOURCE
 * rows (NO new template — the 3 existing ones are enriched in place).
 *
 * The migration must:
 * - insert insumos with canonical lowercase UOM codes ('kg','g','l','ml',
 *   'unidad') and purchase/consumption/conversion triplets;
 * - insert prepared products WITH template_recipe_items rows that reference
 *   the insumo NAME, and packaged (reventa) products with NO recipe items
 *   (apply resolves product_type automatically from the row shape);
 * - be idempotent (guard every insert on existing name per template) and
 *   have a working down().
 */
describe('ExpandIndustryTemplateMenu1809620000000 (Unit)', () => {
  const migration = new ExpandIndustryTemplateMenu1809620000000();

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

  it('inserts the CAFETERIA insumo Hielo en Cubos with canonical uom kg/g and conversion 1000', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);

    const sql = queries.join('\n');
    expect(sql).toMatch(
      /INSERT\s+INTO\s+template_insumos[\s\S]*'CAFETERIA'[\s\S]*'Hielo en Cubos'[\s\S]*'kg'[\s\S]*'g'[\s\S]*1000/,
    );
  });

  it('inserts the prepared product Frappé de Café 12oz with a recipe referencing insumo NAMES in canonical component uoms', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);

    const sql = queries.join('\n');
    expect(sql).toMatch(
      /'CAFETERIA'[\s\S]*'Frappé de Café 12oz'[\s\S]*'Bebidas frías'[\s\S]*145/,
    );
    expect(sql).toMatch(
      /template_recipe_items[\s\S]*'Frappé de Café 12oz'[\s\S]*'Hielo en Cubos'[\s\S]*100[\s\S]*'g'/,
    );
    expect(sql).toMatch(
      /template_recipe_items[\s\S]*'Frappé de Café 12oz'[\s\S]*'Vaso Descartable 12oz con Tapa'[\s\S]*'unidad'/,
    );
  });

  it('inserts the reventa product Gaseosa 500ml without any recipe item', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);

    const sql = queries.join('\n');
    // The product row exists…
    expect(sql).toMatch(
      /'BAR_RESTAURANTE'[\s\S]*'Gaseosa 500ml'[\s\S]*'Bebidas'[\s\S]*35/,
    );
    // …but no recipe item is attached to it (packaged goods carry no BOM).
    expect(sql).not.toMatch(
      /template_recipe_items[\s\S]*'Gaseosa 500ml'/,
    );
  });

  it('only ever writes canonical lowercase uom codes', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);

    const sql = queries.join('\n');
    expect(sql).not.toMatch(/'(KG|G|L|ML|UN)'/);
  });

  it('guards every template_insumos and template_products insert on existing name per template (idempotency)', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);

    for (const statement of queries) {
      if (/INSERT\s+INTO\s+template_insumos/i.test(statement)) {
        expect(statement).toMatch(/WHERE\s+NOT\s+EXISTS/i);
        expect(statement).toMatch(/template_id\s*=\s*v\.template_id/i);
        expect(statement).toMatch(/ti\.name\s*=\s*v\.name/i);
      }
      if (/INSERT\s+INTO\s+template_products/i.test(statement)) {
        expect(statement).toMatch(/WHERE\s+NOT\s+EXISTS/i);
        expect(statement).toMatch(/template_id\s*=\s*v\.template_id/i);
        expect(statement).toMatch(/p\.name\s*=\s*v\.name/i);
      }
    }
  });

  it('reuses the pre-existing BAR_RESTAURANTE insumos (Tomate Manzano, Aceite Vegetal) without re-inserting them', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);

    const sql = queries.join('\n');
    // Referenced by name in recipe items…
    expect(sql).toMatch(/'Tomate Manzano'/);
    expect(sql).toMatch(/'Aceite Vegetal'/);
    // …but never re-inserted: the single template_insumos INSERT statement
    // carries none of the pre-existing seed rows (per-statement check — the
    // recipe insert legitimately references those names).
    const insumoInsert = queries.find((q) =>
      /INSERT\s+INTO\s+template_insumos/i.test(q),
    );
    expect(insumoInsert).toBeDefined();
    expect(insumoInsert).not.toContain('Tomate Manzano');
    expect(insumoInsert).not.toContain('Aceite Vegetal');
  });

  it('reverses the inserts on down', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.down(queryRunner);

    const sql = queries.join('\n');
    expect(sql).toMatch(
      /DELETE\s+FROM\s+template_recipe_items[\s\S]*template_products/i,
    );
    expect(sql).toMatch(/DELETE\s+FROM\s+template_products[\s\S]*'Frappé de Café 12oz'/i);
    expect(sql).toMatch(/DELETE\s+FROM\s+template_insumos[\s\S]*'Hielo en Cubos'/i);
  });
});
