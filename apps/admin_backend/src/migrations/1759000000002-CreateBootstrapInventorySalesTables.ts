import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bootstrap the nineteen inventory/sales base tables that the later migration
 * set assumes already exists.
 *
 * Why this exists: no migration ever created these tables. Existing
 * environments were provisioned with TypeORM `synchronize` or manual SQL
 * before the migration history started, so the gap stayed invisible until
 * someone tried to build the schema from an empty database. Without this
 * migration the set fails at 1767000000000 with `relation "insumos" does not
 * exist`. Source material: docs/plans/inventory/00_bootstrap_base_tables.sql.
 *
 * Shape matters, and it is the *pre-migration* shape, because the later
 * migrations are the source of truth for everything added afterwards. Every
 * column below that a later migration introduces has been deliberately
 * omitted so those ALTERs can apply (guarded or not):
 * - `insumos.negative_stock_policy`: added by 1767000000000.
 * - `products.tax_rate` and `products.is_tax_exempt`: added by
 *   1796000000000 with a bare `ALTER TABLE ... ADD COLUMN` (no
 *   `IF NOT EXISTS` guard), so pre-creating them would break that migration.
 *   `products.product_type` and `products.category_code` are the opposite
 *   case: no migration ever creates them, so this bootstrap owns both (the
 *   enum type with a catalog guard, the columns idempotently).
 * - `recipe_versions`: `pos_document_id`, `product_name`, `yield_quantity`,
 *   `technical_shrink_pct`, `version_note`, `published_at`, and
 *   `pos_created_at` are added by 1771000000000; `origin`,
 *   `publication_state`, and `suggestion_state` are added by 1797000000000
 *   through TypeORM `addColumn` (unguarded). The two partial indexes on
 *   `pos_document_id` and `is_active` in the source SQL are omitted too,
 *   because they depend on the omitted columns (1771000000000 and
 *   1772000000000 create their own equivalents).
 * - `recipe_details`: `ingredient_name`, `ingredient_type`,
 *   `component_uom`, and `reference_version_id` are added by
 *   1771000000000. `gross_quantity` and `technical_shrink_pct` stay, since
 *   they predate that migration (its down() never drops them).
 * - `invoices`: `origin_invoice_id`, `refund_reason_code`,
 *   `refund_reason_policy`, `authorized_by_user_id`, and
 *   `authorized_by_role` are added by 1782000000000; the partial index on
 *   `origin_invoice_id` is omitted with them.
 * - `invoice_items`: `tenant_id` is added by 1770000000000 as a nullable
 *   varchar that is backfilled and then set NOT NULL, `recipe_version_id`
 *   by 1769000000000, and `origin_invoice_item_id` by 1782000000000. The
 *   tenant-scoped indexes in the source SQL are omitted because they depend
 *   on the omitted columns (1770000000000 and 1782000000000 create their
 *   own equivalents).
 *
 * Idempotency is mandatory and not optional: existing environments already
 * hold these tables without a ledger row for this timestamp, so TypeORM
 * treats this migration as pending there. Every `CREATE TABLE` uses
 * `IF NOT EXISTS` (its body, including the named foreign keys, is skipped
 * when the table is already present), every index uses `IF NOT EXISTS`, and
 * enum creation is guarded on the catalog.
 *
 * `gen_random_uuid()` is used instead of `uuid_generate_v4()` because no
 * migration in this repository creates an extension, and `gen_random_uuid()`
 * is built into PostgreSQL 13+.
 */
export class CreateBootstrapInventorySalesTables1759000000002 implements MigrationInterface {
  name = 'CreateBootstrapInventorySalesTables1759000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL has no `CREATE TYPE IF NOT EXISTS`, so guard on the catalog.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typname = 'recipe_ingredient_type_enum' AND n.nspname = 'public'
        ) THEN
          CREATE TYPE recipe_ingredient_type_enum AS ENUM ('INSUMO', 'PRODUCT');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typname = 'cash_shift_session_status_enum' AND n.nspname = 'public'
        ) THEN
          CREATE TYPE cash_shift_session_status_enum AS ENUM ('OPEN', 'CLOSED');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typname = 'cash_movement_type_enum' AND n.nspname = 'public'
        ) THEN
          CREATE TYPE cash_movement_type_enum AS ENUM ('CASH_IN', 'CASH_OUT', 'PETTY_CASH', 'SAFE_DROP');
        END IF;
      END
      $$;
    `);

    // `products.product_type` is declared by the Product entity, but no
    // migration in the set creates the column or the type: 1802000000000 only
    // extends the enum with PREPARED when the type already exists. The value
    // list is the full entity list so that guarded extension stays a no-op
    // everywhere, including environments whose ledger already records it.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typname = 'products_product_type_enum' AND n.nspname = 'public'
        ) THEN
          CREATE TYPE products_product_type_enum AS ENUM ('SIMPLE', 'COMPOUND', 'PREPARED', 'VARIANT_PARENT');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS warehouses (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        name varchar NOT NULL,
        description text,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_warehouses_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_warehouses_tenant ON warehouses (tenant_id)',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        name varchar NOT NULL,
        phone varchar,
        contact_person varchar,
        credit_terms text,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_suppliers_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_suppliers_tenant ON suppliers (tenant_id)',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS insumos (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        warehouse_id varchar,
        is_perishable boolean NOT NULL DEFAULT false,
        name varchar NOT NULL,
        "purchaseUom" varchar NOT NULL,
        "consumptionUom" varchar NOT NULL,
        "conversionFactor" numeric(12,4) NOT NULL DEFAULT 1,
        stock numeric(14,4) NOT NULL DEFAULT 0,
        existencia_actual numeric(14,4) NOT NULL DEFAULT 0,
        costo_promedio_nio numeric(14,4) NOT NULL DEFAULT 0,
        "parLevel" numeric(14,4),
        min_stock numeric(14,4),
        max_stock numeric(14,4),
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_insumos_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_insumos_tenant ON insumos (tenant_id)',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS uom_conversions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        insumo_id uuid NOT NULL,
        unit_name varchar NOT NULL,
        factor numeric(12,4) NOT NULL,
        is_default boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_uom_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
        CONSTRAINT fk_uom_insumo FOREIGN KEY (insumo_id) REFERENCES insumos(id)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_uom_tenant ON uom_conversions (tenant_id)',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_uom_insumo ON uom_conversions (insumo_id)',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS batches (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        insumo_id uuid NOT NULL,
        batch_number varchar NOT NULL,
        received_date date NOT NULL,
        expiration_date date NOT NULL,
        remaining_stock numeric(14,4) NOT NULL,
        cost numeric(14,4) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_batches_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
        CONSTRAINT fk_batches_insumo FOREIGN KEY (insumo_id) REFERENCES insumos(id)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_batches_tenant ON batches (tenant_id)',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_batches_insumo ON batches (insumo_id)',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS products (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        warehouse_id varchar,
        is_perishable boolean NOT NULL DEFAULT false,
        name varchar NOT NULL,
        uom varchar NOT NULL,
        product_type products_product_type_enum NOT NULL DEFAULT 'SIMPLE',
        category_code varchar,
        stock numeric(12,4) NOT NULL DEFAULT 0,
        "averageCost" numeric(12,2) NOT NULL DEFAULT 0,
        "sellPrice" numeric(12,2) NOT NULL DEFAULT 0,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_products_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_products_tenant ON products (tenant_id)',
    );

    // Existing environments hold `products` without these two columns, and
    // their ledger may already record 1802000000000, whose enum extension
    // only runs when the type exists — so the CREATE TABLE above cannot heal
    // them when the table is already present. ADD COLUMN IF NOT EXISTS is a
    // no-op once the column exists. No later migration creates either
    // column, so adding them here does not collide with a later ALTER.
    await queryRunner.query(
      "ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type products_product_type_enum NOT NULL DEFAULT 'SIMPLE'",
    );
    await queryRunner.query(
      'ALTER TABLE products ADD COLUMN IF NOT EXISTS category_code varchar',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS recipes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        "productId" uuid NOT NULL,
        "ingredientId" uuid NOT NULL,
        "ingredientType" recipe_ingredient_type_enum NOT NULL DEFAULT 'INSUMO',
        quantity numeric(14,4) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_recipes_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
        CONSTRAINT fk_recipes_product FOREIGN KEY ("productId") REFERENCES products(id)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_recipes_tenant ON recipes (tenant_id)',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS recipe_versions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        product_id uuid NOT NULL,
        version_number integer NOT NULL,
        is_active boolean NOT NULL DEFAULT false,
        fecha_inicio_vigencia timestamptz,
        fecha_fin_vigencia timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_rv_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
        CONSTRAINT fk_rv_product FOREIGN KEY (product_id) REFERENCES products(id)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_rv_tenant ON recipe_versions (tenant_id)',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS recipe_details (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        recipe_version_id uuid NOT NULL,
        insumo_id uuid NOT NULL,
        quantity numeric(14,4) NOT NULL,
        gross_quantity numeric(14,4) NOT NULL DEFAULT 0,
        technical_shrink_pct numeric(14,4) NOT NULL DEFAULT 0,
        CONSTRAINT fk_rd_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
        CONSTRAINT fk_rd_version FOREIGN KEY (recipe_version_id) REFERENCES recipe_versions(id)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_rd_tenant ON recipe_details (tenant_id)',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_rd_version ON recipe_details (recipe_version_id)',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS shrinkages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        shrinkage_type varchar NOT NULL,
        reason varchar,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_shrinkages_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_shrinkages_tenant ON shrinkages (tenant_id)',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS shrinkage_details (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        shrinkage_id uuid NOT NULL,
        insumo_id uuid NOT NULL,
        quantity numeric(14,4) NOT NULL,
        unit_cost_nio numeric(14,4) NOT NULL,
        CONSTRAINT fk_sd_shrinkage FOREIGN KEY (shrinkage_id) REFERENCES shrinkages(id)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_sd_shrinkage ON shrinkage_details (shrinkage_id)',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS production_orders (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        recipe_version_id varchar NOT NULL,
        planned_quantity numeric(14,4) NOT NULL,
        status varchar NOT NULL DEFAULT 'DRAFT',
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_po_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_po_tenant ON production_orders (tenant_id)',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS production_order_lines (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        production_order_id uuid NOT NULL,
        insumo_id uuid NOT NULL,
        quantity numeric(14,4) NOT NULL,
        unit_cost_nio numeric(14,4) NOT NULL,
        CONSTRAINT fk_pol_order FOREIGN KEY (production_order_id) REFERENCES production_orders(id)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_pol_order ON production_order_lines (production_order_id)',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        invoice_number varchar NOT NULL,
        created_at timestamp NOT NULL,
        user_id uuid NOT NULL,
        subtotal numeric(12,2) NOT NULL,
        total_tax numeric(12,2) NOT NULL,
        total numeric(12,2) NOT NULL,
        is_canceled boolean NOT NULL DEFAULT false,
        void_reason varchar,
        payment_status varchar NOT NULL DEFAULT 'pending',
        customer_id varchar,
        global_tax_override boolean NOT NULL DEFAULT false,
        type varchar NOT NULL DEFAULT 'regular',
        related_invoice_id varchar,
        bcn_official_rate numeric(10,4) NOT NULL DEFAULT 36.6241,
        commercial_rate numeric(10,4) NOT NULL DEFAULT 36.5,
        total_usd numeric(12,2) NOT NULL DEFAULT 0.0,
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_invoices_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices (tenant_id)',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices (invoice_number)',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS invoice_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        invoice_id uuid NOT NULL,
        product_id uuid NOT NULL,
        product_name varchar NOT NULL,
        quantity numeric(12,4) NOT NULL,
        unit_price numeric(12,2) NOT NULL,
        original_tax_rate numeric(12,4) NOT NULL,
        applied_tax_rate numeric(12,4) NOT NULL,
        tax_amount numeric(12,2) NOT NULL,
        total numeric(12,2) NOT NULL,
        discount numeric(12,2) NOT NULL DEFAULT 0,
        variant_id varchar,
        notes varchar,
        CONSTRAINT fk_ii_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_ii_invoice ON invoice_items (invoice_id)',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS invoice_item_modifiers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        invoice_item_id uuid NOT NULL,
        name varchar NOT NULL,
        extra_price numeric(12,2) NOT NULL,
        CONSTRAINT fk_iim_item FOREIGN KEY (invoice_item_id) REFERENCES invoice_items(id)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_iim_item ON invoice_item_modifiers (invoice_item_id)',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS invoice_payments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        invoice_id uuid NOT NULL,
        method varchar NOT NULL,
        amount numeric(12,2) NOT NULL,
        currency varchar NOT NULL DEFAULT 'NIO',
        exchange_rate numeric(12,4) NOT NULL DEFAULT 1.0,
        amount_nio numeric(12,2) NOT NULL DEFAULT 0.0,
        change_given numeric(12,2) NOT NULL DEFAULT 0.0,
        change_currency varchar NOT NULL DEFAULT 'NIO',
        voucher_code varchar,
        card_brand varchar,
        card_type varchar,
        bank_pos varchar,
        reconciliation_status varchar DEFAULT 'PENDIENTE',
        "last4" varchar,
        batch_number varchar,
        reconciled_at timestamp,
        reconciled_by_user_id varchar,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_ip_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_ip_invoice ON invoice_payments (invoice_id)',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS cash_shift_sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        terminal_id varchar(100) NOT NULL,
        cashier_id varchar(100) NOT NULL,
        cashier_name varchar(150) NOT NULL,
        opened_at timestamptz NOT NULL DEFAULT now(),
        closed_at timestamptz,
        status cash_shift_session_status_enum NOT NULL DEFAULT 'OPEN',
        initial_float_nio numeric(12,4) NOT NULL DEFAULT 0,
        initial_float_usd numeric(12,4) NOT NULL DEFAULT 0,
        final_counted_nio numeric(12,4),
        final_counted_usd numeric(12,4),
        expected_cash_nio numeric(12,4) NOT NULL DEFAULT 0,
        expected_cash_usd numeric(12,4) NOT NULL DEFAULT 0,
        difference_nio numeric(12,4),
        difference_usd numeric(12,4),
        z_report_sequence integer,
        supervisor_id varchar(100),
        notes text
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_css_tenant_terminal ON cash_shift_sessions (tenant_id, terminal_id)',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_css_tenant_status ON cash_shift_sessions (tenant_id, status)',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS cash_movements (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        shift_id uuid NOT NULL,
        terminal_id varchar(100) NOT NULL,
        type cash_movement_type_enum NOT NULL,
        amount_nio numeric(12,4) NOT NULL DEFAULT 0,
        amount_usd numeric(12,4) NOT NULL DEFAULT 0,
        reason varchar(255) NOT NULL,
        authorized_by_user_id varchar(100),
        "timestamp" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_cm_tenant_shift ON cash_movements (tenant_id, shift_id)',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_cm_tenant_terminal ON cash_movements (tenant_id, terminal_id)',
    );
  }

  /**
   * Reverses only what a bootstrap could have created, and refuses to destroy
   * data: sales and inventory history must never be dropped silently. A
   * freshly bootstrapped database has no rows, so the normal rollback path
   * stays available.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE
        table_name text;
      BEGIN
        FOREACH table_name IN ARRAY ARRAY[
          'cash_movements', 'cash_shift_sessions', 'invoice_payments',
          'invoice_item_modifiers', 'invoice_items', 'invoices',
          'production_order_lines', 'production_orders',
          'shrinkage_details', 'shrinkages', 'recipe_details',
          'recipe_versions', 'recipes', 'products', 'batches',
          'uom_conversions', 'insumos', 'suppliers', 'warehouses'
        ]
        LOOP
          IF to_regclass('public.' || table_name) IS NOT NULL THEN
            IF EXISTS (
              EXECUTE format('SELECT 1 FROM public.%I LIMIT 1', table_name)
            ) THEN
              RAISE EXCEPTION
                'Refusing to drop table % because it holds rows; remove the data deliberately first',
                table_name;
            END IF;
          END IF;
        END LOOP;
      END
      $$;
    `);

    await queryRunner.query('DROP TABLE IF EXISTS cash_movements');
    await queryRunner.query('DROP TABLE IF EXISTS cash_shift_sessions');
    await queryRunner.query('DROP TABLE IF EXISTS invoice_payments');
    await queryRunner.query('DROP TABLE IF EXISTS invoice_item_modifiers');
    await queryRunner.query('DROP TABLE IF EXISTS invoice_items');
    await queryRunner.query('DROP TABLE IF EXISTS invoices');
    await queryRunner.query('DROP TABLE IF EXISTS production_order_lines');
    await queryRunner.query('DROP TABLE IF EXISTS production_orders');
    await queryRunner.query('DROP TABLE IF EXISTS shrinkage_details');
    await queryRunner.query('DROP TABLE IF EXISTS shrinkages');
    await queryRunner.query('DROP TABLE IF EXISTS recipe_details');
    await queryRunner.query('DROP TABLE IF EXISTS recipe_versions');
    await queryRunner.query('DROP TABLE IF EXISTS recipes');
    await queryRunner.query('DROP TABLE IF EXISTS products');
    await queryRunner.query('DROP TABLE IF EXISTS batches');
    await queryRunner.query('DROP TABLE IF EXISTS uom_conversions');
    await queryRunner.query('DROP TABLE IF EXISTS insumos');
    await queryRunner.query('DROP TABLE IF EXISTS suppliers');
    await queryRunner.query('DROP TABLE IF EXISTS warehouses');

    await queryRunner.query('DROP TYPE IF EXISTS cash_movement_type_enum');
    await queryRunner.query(
      'DROP TYPE IF EXISTS cash_shift_session_status_enum',
    );
    await queryRunner.query('DROP TYPE IF EXISTS recipe_ingredient_type_enum');
  }
}
