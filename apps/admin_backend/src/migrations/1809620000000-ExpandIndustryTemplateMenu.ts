import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * T11/F4 — insert the owner-approved menu into the industry template SOURCE
 * rows. NO new template is created: the 3 existing templates (CAFETERIA,
 * BAR_RESTAURANTE, RETAIL_MINIMARKET — seed 1787000000000) are enriched in
 * place.
 *
 * Data rules:
 * - ALL uom codes are platform-canonical lowercase ('kg','g','l','ml',
 *   'unidad') — consistent with the F2a canonicalization of the pre-existing
 *   seed rows (1809610000000-CanonicalizeTemplateUomCodes).
 * - Insumos carry purchase_uom/consumption_uom/conversion_factor (kg↔g and
 *   l↔ml use 1000, same-unit uses 1) plus sensible par_level/min_stock.
 * - Prepared products carry template_recipe_items rows referencing the
 *   insumo NAME; packaged (reventa) goods are plain products with NO recipe
 *   items — the apply resolves product_type automatically from the row shape
 *   (resolveTemplateProductType).
 * - Recipe ingredients that already exist for the template (Tomate Manzano,
 *   Lechuga Romana, Aceite Vegetal, the 12oz vaso…) are REUSED by name, never
 *   re-inserted. The CAFETERIA-borrowed insumos the BAR_RESTAURANTE Refresco
 *   and the CAFETERIA Sándwich need (Hielo en Cubos, Vaso Descartable 12oz,
 *   Fruta de Estación Picada, Azúcar Blanca, Lechuga Romana) are duplicated
 *   per template because template recipe items resolve ingredients within
 *   their OWN template's insumo list (applyTemplate integrity check).
 *
 * Idempotency: every insert is guarded on existing (template_id, name) —
 * re-running inserts nothing. down() removes exactly the rows this migration
 * can have inserted (guarded by the same name lists).
 */
export class ExpandIndustryTemplateMenu1809620000000 implements MigrationInterface {
  name = 'ExpandIndustryTemplateMenu1809620000000';

  /** (template_id, name, purchase_uom, consumption_uom, factor, par, min, perishable) */
  private static readonly INSUMOS: ReadonlyArray<
    readonly [string, string, string, string, number, number, number, boolean]
  > = [
    // CAFETERIA — new insumos for the owner-approved menu.
    ['CAFETERIA', 'Hielo en Cubos', 'kg', 'g', 1000, 20000, 5000, false],
    ['CAFETERIA', 'Fruta de Estación Picada', 'kg', 'g', 1000, 8000, 2000, true],
    ['CAFETERIA', 'Pan de Sándwich', 'unidad', 'unidad', 1, 100, 20, true],
    ['CAFETERIA', 'Jamón', 'kg', 'g', 1000, 3000, 500, true],
    ['CAFETERIA', 'Queso Amarillo', 'kg', 'g', 1000, 3000, 500, true],
    // CAFETERIA — Sándwich uses lechuga; BAR_RESTAURANTE's 'Lechuga Romana'
    // cannot be referenced across templates, so duplicate it here.
    ['CAFETERIA', 'Lechuga Romana', 'kg', 'g', 1000, 5000, 1000, true],

    // BAR_RESTAURANTE — new insumos for the owner-approved menu.
    ['BAR_RESTAURANTE', 'Pollo Entero', 'kg', 'g', 1000, 15000, 3000, true],
    ['BAR_RESTAURANTE', 'Repollo', 'kg', 'g', 1000, 6000, 1500, true],
    ['BAR_RESTAURANTE', 'Zanahoria', 'kg', 'g', 1000, 4000, 1000, true],
    ['BAR_RESTAURANTE', 'Tortilla de Maíz', 'unidad', 'unidad', 1, 200, 50, true],
    [
      'BAR_RESTAURANTE',
      'Carne de Res para Desmenuzar',
      'kg',
      'g',
      1000,
      5000,
      1000,
      true,
    ],
    ['BAR_RESTAURANTE', 'Crema Ácida', 'l', 'ml', 1000, 6000, 1500, true],
    ['BAR_RESTAURANTE', 'Queso Cuajada', 'kg', 'g', 1000, 3000, 800, true],
    ['BAR_RESTAURANTE', 'Cebolla', 'kg', 'g', 1000, 4000, 1000, true],
    ['BAR_RESTAURANTE', 'Arroz Blanco', 'kg', 'g', 1000, 20000, 5000, false],
    ['BAR_RESTAURANTE', 'Frijoles Rojos', 'kg', 'g', 1000, 10000, 2500, false],
    ['BAR_RESTAURANTE', 'Huevo', 'unidad', 'unidad', 1, 180, 36, true],
    ['BAR_RESTAURANTE', 'Queso Fresco', 'kg', 'g', 1000, 3000, 800, true],
    ['BAR_RESTAURANTE', 'Plátano Maduro', 'unidad', 'unidad', 1, 60, 15, true],
    // BAR_RESTAURANTE — CAFETERIA-borrowed insumos the Refresco recipe needs;
    // recipe items resolve within the template's own insumo list, so these
    // are duplicated here with the same canonical fields.
    ['BAR_RESTAURANTE', 'Hielo en Cubos', 'kg', 'g', 1000, 20000, 5000, false],
    [
      'BAR_RESTAURANTE',
      'Vaso Descartable 12oz con Tapa',
      'unidad',
      'unidad',
      1,
      500,
      100,
      false,
    ],
    [
      'BAR_RESTAURANTE',
      'Fruta de Estación Picada',
      'kg',
      'g',
      1000,
      8000,
      2000,
      true,
    ],
    ['BAR_RESTAURANTE', 'Azúcar Blanca', 'kg', 'g', 1000, 10000, 2000, false],
  ];

  /** (template_id, name, category, suggested_price) */
  private static readonly PRODUCTS: ReadonlyArray<
    readonly [string, string, string, number]
  > = [
    // CAFETERIA
    ['CAFETERIA', 'Frappé de Café 12oz', 'Bebidas frías', 145],
    ['CAFETERIA', 'Jugo Natural 12oz', 'Bebidas frías', 85],
    ['CAFETERIA', 'Sándwich Jamón y Queso', 'Comida', 120],
    ['CAFETERIA', 'Croissant de Mantequilla', 'Panadería', 75],
    ['CAFETERIA', 'Queque Holandés rebanada', 'Panadería', 65],
    ['CAFETERIA', 'Agua Embotellada 500ml', 'Bebidas', 25],
    ['CAFETERIA', 'Gaseosa en Lata 355ml', 'Bebidas', 35],

    // BAR_RESTAURANTE
    ['BAR_RESTAURANTE', 'Pollo Asado con Ensalada', 'Comida', 285],
    ['BAR_RESTAURANTE', 'Tacos Nicas 3u', 'Comida', 140],
    ['BAR_RESTAURANTE', 'Quesillo con Tortilla', 'Comida', 90],
    ['BAR_RESTAURANTE', 'Gallopinto', 'Comida', 85],
    ['BAR_RESTAURANTE', 'Desayuno Nica Completo', 'Comida', 150],
    ['BAR_RESTAURANTE', 'Refresco Natural 12oz', 'Bebidas frías', 60],
    ['BAR_RESTAURANTE', 'Gaseosa 500ml', 'Bebidas', 35],
    ['BAR_RESTAURANTE', 'Agua Purificada 500ml', 'Bebidas', 20],
    ['BAR_RESTAURANTE', 'Flan Casero', 'Postres', 80],

    // RETAIL_MINIMARKET — all plain reventa products, no recipe items.
    ['RETAIL_MINIMARKET', 'Arroz Parboiled 5lb', 'Retail', 120],
    ['RETAIL_MINIMARKET', 'Azúcar Estándar 2lb', 'Retail', 45],
    ['RETAIL_MINIMARKET', 'Aceite Vegetal 1L', 'Retail', 95],
    ['RETAIL_MINIMARKET', 'Leche Entera en Polvo 400g', 'Retail', 145],
    ['RETAIL_MINIMARKET', 'Café Molido Nicaragüense 250g', 'Retail', 110],
    ['RETAIL_MINIMARKET', 'Frijoles Rojos 1lb', 'Retail', 55],
    ['RETAIL_MINIMARKET', 'Pan de Guaba', 'Panadería', 15],
    ['RETAIL_MINIMARKET', 'Hielo en Bolsa 5lb', 'Otros', 40],
  ];

  /** (template_id, product_name, insumo_name, gross_quantity, component_uom) */
  private static readonly RECIPE_ITEMS: ReadonlyArray<
    readonly [string, string, string, number, string]
  > = [
    // CAFETERIA — Frappé de Café 12oz
    ['CAFETERIA', 'Frappé de Café 12oz', 'Granos de Café Especial', 18, 'g'],
    ['CAFETERIA', 'Frappé de Café 12oz', 'Leche Entera', 200, 'ml'],
    ['CAFETERIA', 'Frappé de Café 12oz', 'Hielo en Cubos', 100, 'g'],
    ['CAFETERIA', 'Frappé de Café 12oz', 'Vaso Descartable 12oz con Tapa', 1, 'unidad'],
    // CAFETERIA — Jugo Natural 12oz
    ['CAFETERIA', 'Jugo Natural 12oz', 'Fruta de Estación Picada', 150, 'g'],
    ['CAFETERIA', 'Jugo Natural 12oz', 'Azúcar Blanca', 20, 'g'],
    ['CAFETERIA', 'Jugo Natural 12oz', 'Hielo en Cubos', 100, 'g'],
    ['CAFETERIA', 'Jugo Natural 12oz', 'Vaso Descartable 12oz con Tapa', 1, 'unidad'],
    // CAFETERIA — Sándwich Jamón y Queso
    ['CAFETERIA', 'Sándwich Jamón y Queso', 'Pan de Sándwich', 1, 'unidad'],
    ['CAFETERIA', 'Sándwich Jamón y Queso', 'Jamón', 40, 'g'],
    ['CAFETERIA', 'Sándwich Jamón y Queso', 'Queso Amarillo', 30, 'g'],
    ['CAFETERIA', 'Sándwich Jamón y Queso', 'Lechuga Romana', 10, 'g'],

    // BAR_RESTAURANTE — Pollo Asado con Ensalada
    ['BAR_RESTAURANTE', 'Pollo Asado con Ensalada', 'Pollo Entero', 500, 'g'],
    ['BAR_RESTAURANTE', 'Pollo Asado con Ensalada', 'Repollo', 60, 'g'],
    ['BAR_RESTAURANTE', 'Pollo Asado con Ensalada', 'Tomate Manzano', 40, 'g'],
    ['BAR_RESTAURANTE', 'Pollo Asado con Ensalada', 'Zanahoria', 20, 'g'],
    // BAR_RESTAURANTE — Tacos Nicas 3u
    ['BAR_RESTAURANTE', 'Tacos Nicas 3u', 'Tortilla de Maíz', 3, 'unidad'],
    ['BAR_RESTAURANTE', 'Tacos Nicas 3u', 'Carne de Res para Desmenuzar', 150, 'g'],
    ['BAR_RESTAURANTE', 'Tacos Nicas 3u', 'Repollo', 40, 'g'],
    ['BAR_RESTAURANTE', 'Tacos Nicas 3u', 'Crema Ácida', 30, 'ml'],
    // BAR_RESTAURANTE — Quesillo con Tortilla
    ['BAR_RESTAURANTE', 'Quesillo con Tortilla', 'Tortilla de Maíz', 2, 'unidad'],
    ['BAR_RESTAURANTE', 'Quesillo con Tortilla', 'Queso Cuajada', 60, 'g'],
    ['BAR_RESTAURANTE', 'Quesillo con Tortilla', 'Crema Ácida', 20, 'ml'],
    ['BAR_RESTAURANTE', 'Quesillo con Tortilla', 'Cebolla', 15, 'g'],
    // BAR_RESTAURANTE — Gallopinto (Tomate/Aceite reuse existing insumos)
    ['BAR_RESTAURANTE', 'Gallopinto', 'Arroz Blanco', 100, 'g'],
    ['BAR_RESTAURANTE', 'Gallopinto', 'Frijoles Rojos', 80, 'g'],
    ['BAR_RESTAURANTE', 'Gallopinto', 'Aceite Vegetal', 10, 'ml'],
    ['BAR_RESTAURANTE', 'Gallopinto', 'Cebolla', 20, 'g'],
    // BAR_RESTAURANTE — Desayuno Nica Completo
    ['BAR_RESTAURANTE', 'Desayuno Nica Completo', 'Arroz Blanco', 100, 'g'],
    ['BAR_RESTAURANTE', 'Desayuno Nica Completo', 'Frijoles Rojos', 80, 'g'],
    ['BAR_RESTAURANTE', 'Desayuno Nica Completo', 'Huevo', 2, 'unidad'],
    ['BAR_RESTAURANTE', 'Desayuno Nica Completo', 'Queso Fresco', 50, 'g'],
    ['BAR_RESTAURANTE', 'Desayuno Nica Completo', 'Plátano Maduro', 1, 'unidad'],
    // BAR_RESTAURANTE — Refresco Natural 12oz
    ['BAR_RESTAURANTE', 'Refresco Natural 12oz', 'Fruta de Estación Picada', 120, 'g'],
    ['BAR_RESTAURANTE', 'Refresco Natural 12oz', 'Azúcar Blanca', 25, 'g'],
    ['BAR_RESTAURANTE', 'Refresco Natural 12oz', 'Hielo en Cubos', 100, 'g'],
    [
      'BAR_RESTAURANTE',
      'Refresco Natural 12oz',
      'Vaso Descartable 12oz con Tapa',
      1,
      'unidad',
    ],
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    const insumoValues = ExpandIndustryTemplateMenu1809620000000.INSUMOS.map(
      ([tid, name, puom, cuom, factor, par, min, perishable]) =>
        `('${tid}', '${name}', '${puom}', '${cuom}', ${factor}, ${par}, ${min}, ${perishable})`,
    ).join(',\n        ');

    // Idempotent: skip any (template_id, name) that already exists, so
    // re-running (or a partially applied state) inserts nothing twice.
    await queryRunner.query(`
      INSERT INTO template_insumos
        (template_id, name, purchase_uom, consumption_uom, conversion_factor, par_level, min_stock, is_perishable, negative_stock_policy)
      SELECT
        v.template_id, v.name, v.purchase_uom, v.consumption_uom,
        v.conversion_factor, v.par_level, v.min_stock, v.is_perishable,
        'RESTRICT'
      FROM (VALUES
        ${insumoValues}
      ) AS v(template_id, name, purchase_uom, consumption_uom, conversion_factor, par_level, min_stock, is_perishable)
      WHERE NOT EXISTS (
        SELECT 1 FROM template_insumos ti
        WHERE ti.template_id = v.template_id AND ti.name = v.name
      );
    `);

    const productValues =
      ExpandIndustryTemplateMenu1809620000000.PRODUCTS.map(
        ([tid, name, category, price]) =>
          `('${tid}', '${name}', '${category}', 'unidad', ${price})`,
      ).join(',\n        ');

    // Packaged goods are plain products: NO product_type is written — the
    // apply resolves it automatically (no recipe items → SIMPLE; the recipe
    // rows below resolve their product to the recipe branch type).
    await queryRunner.query(`
      INSERT INTO template_products
        (template_id, name, category, uom, suggested_price, is_perishable)
      SELECT
        v.template_id, v.name, v.category, v.uom, v.suggested_price, false
      FROM (VALUES
        ${productValues}
      ) AS v(template_id, name, category, uom, suggested_price)
      WHERE NOT EXISTS (
        SELECT 1 FROM template_products p
        WHERE p.template_id = v.template_id AND p.name = v.name
      );
    `);

    const recipeValues =
      ExpandIndustryTemplateMenu1809620000000.RECIPE_ITEMS.map(
        ([tid, product, insumo, qty, uom]) =>
          `('${tid}', '${product}', '${insumo}', ${qty}, '${uom}')`,
      ).join(',\n        ');

    // Recipe items reference the insumo NAME and attach to the product
    // through (template_id, product_name). Guarded per item so re-running
    // never duplicates a recipe line.
    await queryRunner.query(`
      INSERT INTO template_recipe_items
        (template_product_id, template_insumo_name, gross_quantity, technical_shrink_pct, component_uom)
      SELECT
        p.id, v.insumo_name, v.gross_quantity, 0, v.component_uom
      FROM (VALUES
        ${recipeValues}
      ) AS v(template_id, product_name, insumo_name, gross_quantity, component_uom)
      JOIN template_products p
        ON p.template_id = v.template_id AND p.name = v.product_name
      WHERE NOT EXISTS (
        SELECT 1
        FROM template_recipe_items tri
        JOIN template_products p2 ON p2.id = tri.template_product_id
        WHERE p2.template_id = v.template_id
          AND p2.name = v.product_name
          AND tri.template_insumo_name = v.insumo_name
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const { PRODUCTS, INSUMOS } = ExpandIndustryTemplateMenu1809620000000;

    const productTuples = PRODUCTS.map(
      ([tid, name]) => `('${tid}', '${name}')`,
    ).join(', ');
    const productNamesByTemplate = PRODUCTS.map(
      ([tid, name]) => `(template_id = '${tid}' AND name = '${name}')`,
    ).join(' OR ');
    const insumoTuples = INSUMOS.map(
      ([tid, name]) => `(template_id = '${tid}' AND name = '${name}')`,
    ).join(' OR ');

    // Children first: recipe items of the products this migration owns.
    await queryRunner.query(`
      DELETE FROM template_recipe_items tri
      USING template_products p
      WHERE tri.template_product_id = p.id
        AND (${productNamesByTemplate});
    `);

    await queryRunner.query(`
      DELETE FROM template_products
      WHERE (template_id, name) IN (VALUES ${productTuples});
    `);

    await queryRunner.query(`
      DELETE FROM template_insumos
      WHERE ${insumoTuples};
    `);
  }
}
