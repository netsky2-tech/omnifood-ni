import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateIndustryTemplatesAndDefaults1787000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create Tables
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS industry_templates (
        id VARCHAR PRIMARY KEY,
        code VARCHAR UNIQUE NOT NULL,
        name VARCHAR NOT NULL,
        description TEXT NOT NULL,
        icon VARCHAR NOT NULL DEFAULT 'briefcase',
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS template_insumos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        template_id VARCHAR NOT NULL REFERENCES industry_templates(id) ON DELETE CASCADE,
        name VARCHAR NOT NULL,
        purchase_uom VARCHAR NOT NULL,
        consumption_uom VARCHAR NOT NULL,
        conversion_factor NUMERIC(12, 4) NOT NULL DEFAULT 1,
        par_level NUMERIC(14, 4) NULL,
        min_stock NUMERIC(14, 4) NULL,
        is_perishable BOOLEAN NOT NULL DEFAULT false,
        negative_stock_policy VARCHAR NOT NULL DEFAULT 'RESTRICT',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS template_products (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        template_id VARCHAR NOT NULL REFERENCES industry_templates(id) ON DELETE CASCADE,
        name VARCHAR NOT NULL,
        category VARCHAR NOT NULL DEFAULT 'General',
        uom VARCHAR NOT NULL DEFAULT 'UN',
        suggested_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
        is_perishable BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS template_recipe_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        template_product_id UUID NOT NULL REFERENCES template_products(id) ON DELETE CASCADE,
        template_insumo_name VARCHAR NOT NULL,
        gross_quantity NUMERIC(14, 4) NOT NULL,
        technical_shrink_pct NUMERIC(14, 4) NOT NULL DEFAULT 0,
        component_uom VARCHAR NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 2. Seed Templates
    await queryRunner.query(`
      INSERT INTO industry_templates (id, code, name, description, icon, is_active)
      VALUES
        ('CAFETERIA', 'CAFETERIA', 'Cafetería & Coffee Shop', 'Plantilla especializada en café de especialidad, bebidas frías y calientes.', 'coffee', true),
        ('BAR_RESTAURANTE', 'BAR_RESTAURANTE', 'Bar & Restaurante', 'Plantilla para gastronomía, hamburguesas, cortes y coctelería.', 'utensils', true),
        ('RETAIL_MINIMARKET', 'RETAIL_MINIMARKET', 'Retail & Minimarket', 'Plantilla para abarrotes, bebidas embotelladas y snacks sin receta.', 'shopping-cart', true)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        icon = EXCLUDED.icon;
    `);

    // 3. Seed Insumos: CAFETERIA
    await queryRunner.query(`
      INSERT INTO template_insumos (template_id, name, purchase_uom, consumption_uom, conversion_factor, par_level, min_stock, is_perishable, negative_stock_policy)
      VALUES
        ('CAFETERIA', 'Granos de Café Especial', 'KG', 'G', 1000, 10000, 2000, false, 'RESTRICT'),
        ('CAFETERIA', 'Leche Entera', 'L', 'ML', 1000, 20000, 5000, true, 'RESTRICT'),
        ('CAFETERIA', 'Leche de Almendras', 'L', 'ML', 1000, 10000, 2000, true, 'RESTRICT'),
        ('CAFETERIA', 'Azúcar Blanca', 'KG', 'G', 1000, 10000, 2000, false, 'RESTRICT'),
        ('CAFETERIA', 'Vaso Descartable 8oz con Tapa', 'UN', 'UN', 1, 500, 100, false, 'RESTRICT'),
        ('CAFETERIA', 'Vaso Descartable 12oz con Tapa', 'UN', 'UN', 1, 500, 100, false, 'RESTRICT'),
        ('CAFETERIA', 'Servilletas', 'UN', 'UN', 1, 2000, 500, false, 'RESTRICT');
    `);

    // 4. Seed Insumos: BAR_RESTAURANTE
    await queryRunner.query(`
      INSERT INTO template_insumos (template_id, name, purchase_uom, consumption_uom, conversion_factor, par_level, min_stock, is_perishable, negative_stock_policy)
      VALUES
        ('BAR_RESTAURANTE', 'Pan Brioche para Hamburguesa', 'UN', 'UN', 1, 100, 20, true, 'RESTRICT'),
        ('BAR_RESTAURANTE', 'Torta de Carne de Res 150g', 'UN', 'UN', 1, 100, 20, true, 'RESTRICT'),
        ('BAR_RESTAURANTE', 'Queso Cheddar en Láminas', 'KG', 'G', 1000, 5000, 1000, true, 'RESTRICT'),
        ('BAR_RESTAURANTE', 'Lechuga Romana', 'KG', 'G', 1000, 5000, 1000, true, 'RESTRICT'),
        ('BAR_RESTAURANTE', 'Tomate Manzano', 'KG', 'G', 1000, 5000, 1000, true, 'RESTRICT'),
        ('BAR_RESTAURANTE', 'Papas Prefritas Congeladas', 'KG', 'G', 1000, 20000, 5000, true, 'RESTRICT'),
        ('BAR_RESTAURANTE', 'Aceite Vegetal', 'L', 'ML', 1000, 20000, 5000, false, 'RESTRICT'),
        ('BAR_RESTAURANTE', 'Cerveza Nacional Toña 350ml', 'UN', 'UN', 1, 240, 48, false, 'RESTRICT'),
        ('BAR_RESTAURANTE', 'Ron Flor de Caña 7 Años 750ml', 'UN', 'ML', 750, 7500, 1500, false, 'RESTRICT');
    `);

    // 5. Seed Insumos: RETAIL_MINIMARKET
    await queryRunner.query(`
      INSERT INTO template_insumos (template_id, name, purchase_uom, consumption_uom, conversion_factor, par_level, min_stock, is_perishable, negative_stock_policy)
      VALUES
        ('RETAIL_MINIMARKET', 'Bolsa Plástica Biodegradable Mediana', 'UN', 'UN', 1, 1000, 200, false, 'RESTRICT');
    `);

    // 6. Seed Products & Pre-BOMs: CAFETERIA
    await queryRunner.query(`
      DO $$
      DECLARE
        p_espresso_simple UUID;
        p_espresso_doble UUID;
        p_capuchino_8oz UUID;
        p_latte_12oz UUID;
        p_latte_almendra UUID;
      BEGIN
        INSERT INTO template_products (template_id, name, category, uom, suggested_price, is_perishable)
        VALUES ('CAFETERIA', 'Espresso Simple', 'Bebidas Calientes', 'UN', 50.00, false)
        RETURNING id INTO p_espresso_simple;

        INSERT INTO template_recipe_items (template_product_id, template_insumo_name, gross_quantity, technical_shrink_pct, component_uom)
        VALUES (p_espresso_simple, 'Granos de Café Especial', 9, 0, 'G');

        INSERT INTO template_products (template_id, name, category, uom, suggested_price, is_perishable)
        VALUES ('CAFETERIA', 'Espresso Doble', 'Bebidas Calientes', 'UN', 70.00, false)
        RETURNING id INTO p_espresso_doble;

        INSERT INTO template_recipe_items (template_product_id, template_insumo_name, gross_quantity, technical_shrink_pct, component_uom)
        VALUES (p_espresso_doble, 'Granos de Café Especial', 18, 0, 'G');

        INSERT INTO template_products (template_id, name, category, uom, suggested_price, is_perishable)
        VALUES ('CAFETERIA', 'Capuchino 8oz', 'Bebidas Calientes', 'UN', 95.00, false)
        RETURNING id INTO p_capuchino_8oz;

        INSERT INTO template_recipe_items (template_product_id, template_insumo_name, gross_quantity, technical_shrink_pct, component_uom)
        VALUES
          (p_capuchino_8oz, 'Granos de Café Especial', 18, 0, 'G'),
          (p_capuchino_8oz, 'Leche Entera', 150, 0, 'ML'),
          (p_capuchino_8oz, 'Vaso Descartable 8oz con Tapa', 1, 0, 'UN');

        INSERT INTO template_products (template_id, name, category, uom, suggested_price, is_perishable)
        VALUES ('CAFETERIA', 'Latte 12oz', 'Bebidas Calientes', 'UN', 110.00, false)
        RETURNING id INTO p_latte_12oz;

        INSERT INTO template_recipe_items (template_product_id, template_insumo_name, gross_quantity, technical_shrink_pct, component_uom)
        VALUES
          (p_latte_12oz, 'Granos de Café Especial', 18, 0, 'G'),
          (p_latte_12oz, 'Leche Entera', 250, 0, 'ML'),
          (p_latte_12oz, 'Vaso Descartable 12oz con Tapa', 1, 0, 'UN');

        INSERT INTO template_products (template_id, name, category, uom, suggested_price, is_perishable)
        VALUES ('CAFETERIA', 'Latte Almendra 12oz', 'Bebidas Calientes', 'UN', 135.00, false)
        RETURNING id INTO p_latte_almendra;

        INSERT INTO template_recipe_items (template_product_id, template_insumo_name, gross_quantity, technical_shrink_pct, component_uom)
        VALUES
          (p_latte_almendra, 'Granos de Café Especial', 18, 0, 'G'),
          (p_latte_almendra, 'Leche de Almendras', 250, 0, 'ML'),
          (p_latte_almendra, 'Vaso Descartable 12oz con Tapa', 1, 0, 'UN');
      END $$;
    `);

    // 7. Seed Products & Pre-BOMs: BAR_RESTAURANTE
    await queryRunner.query(`
      DO $$
      DECLARE
        p_burger UUID;
        p_tona UUID;
        p_ron UUID;
      BEGIN
        INSERT INTO template_products (template_id, name, category, uom, suggested_price, is_perishable)
        VALUES ('BAR_RESTAURANTE', 'Hamburguesa Clásica con Papas', 'Comida', 'UN', 220.00, false)
        RETURNING id INTO p_burger;

        INSERT INTO template_recipe_items (template_product_id, template_insumo_name, gross_quantity, technical_shrink_pct, component_uom)
        VALUES
          (p_burger, 'Pan Brioche para Hamburguesa', 1, 0, 'UN'),
          (p_burger, 'Torta de Carne de Res 150g', 1, 0, 'UN'),
          (p_burger, 'Queso Cheddar en Láminas', 25, 0, 'G'),
          (p_burger, 'Lechuga Romana', 20, 0, 'G'),
          (p_burger, 'Tomate Manzano', 30, 0, 'G'),
          (p_burger, 'Papas Prefritas Congeladas', 150, 0, 'G'),
          (p_burger, 'Aceite Vegetal', 30, 0, 'ML');

        INSERT INTO template_products (template_id, name, category, uom, suggested_price, is_perishable)
        VALUES ('BAR_RESTAURANTE', 'Cerveza Toña 350ml', 'Bebidas Alcohólicas', 'UN', 65.00, false)
        RETURNING id INTO p_tona;

        INSERT INTO template_recipe_items (template_product_id, template_insumo_name, gross_quantity, technical_shrink_pct, component_uom)
        VALUES
          (p_tona, 'Cerveza Nacional Toña 350ml', 1, 0, 'UN');

        INSERT INTO template_products (template_id, name, category, uom, suggested_price, is_perishable)
        VALUES ('BAR_RESTAURANTE', 'Trago Ron FDC 7 Años', 'Bebidas Alcohólicas', 'UN', 90.00, false)
        RETURNING id INTO p_ron;

        INSERT INTO template_recipe_items (template_product_id, template_insumo_name, gross_quantity, technical_shrink_pct, component_uom)
        VALUES
          (p_ron, 'Ron Flor de Caña 7 Años 750ml', 45, 0, 'ML');
      END $$;
    `);

    // 8. Seed Products: RETAIL_MINIMARKET
    await queryRunner.query(`
      INSERT INTO template_products (template_id, name, category, uom, suggested_price, is_perishable)
      VALUES
        ('RETAIL_MINIMARKET', 'Gaseosa Coca Cola 500ml', 'Bebidas', 'UN', 35.00, false),
        ('RETAIL_MINIMARKET', 'Agua Purificada Fuente Pura 1L', 'Bebidas', 'UN', 25.00, false),
        ('RETAIL_MINIMARKET', 'Papas Tosty Clásicas 45g', 'Snacks', 'UN', 20.00, false),
        ('RETAIL_MINIMARKET', 'Galletas Oreo 6pk', 'Snacks', 'UN', 25.00, false);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS template_recipe_items;`);
    await queryRunner.query(`DROP TABLE IF EXISTS template_products;`);
    await queryRunner.query(`DROP TABLE IF EXISTS template_insumos;`);
    await queryRunner.query(`DROP TABLE IF EXISTS industry_templates;`);
  }
}
