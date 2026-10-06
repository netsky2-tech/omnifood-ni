import { MigrationInterface, QueryRunner } from 'typeorm';
import { resolveTenantRlsPredicate } from '../core/database/tenant-rls-policy';

/**
 * T1.1 of extras/modifier-groups: reusable modifier groups, their options,
 * and the category/product attachments, all tenant-scoped from birth.
 *
 * Schema creation only — no REST surface, no service, no controller.
 *
 * Design invariants (odd/tasks/extras-modifier-groups.md §2):
 *  - Category identity is the EXISTING catalog_values table filtered to
 *    catalog_type = 'SALES_PRODUCT_CATEGORY'; attachments FK to
 *    catalog_values.id, no product_categories table.
 *  - Every child table carries tenant_id and FKs its parent through the
 *    composite (tenant_id, parent id), so a cross-tenant child row is
 *    impossible at the schema level.
 *  - All four tables carry their own tenant_id and their own ENABLE + FORCE
 *    RLS with a per-command tenant policy set (manifest class direct:SIUD).
 *
 * The parent UNIQUE (tenant_id, id) constraints the composite FKs reference
 * are added idempotently and BEFORE the tables that reference them. The
 * products constraint is owned by migration 1802000000000 and is re-guarded
 * here (same name) only so this migration stands alone; its down() does not
 * drop it.
 */
export class CreateModifierGroups1809550000000 implements MigrationInterface {
  name = 'CreateModifierGroups1809550000000';

  private static readonly TABLES = [
    'modifier_groups',
    'modifier_options',
    'category_modifier_groups',
    'product_modifier_groups',
  ] as const;

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Parent composite uniqueness the composite tenant FKs reference
    //    (idempotent, scoped to the relation the current search_path
    //    resolves — pg_constraint is database-wide).
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint c
          WHERE c.conrelid = to_regclass('products')
            AND c.conname = 'uq_products_tenant_product_id'
            AND c.contype = 'u'
        ) THEN
          ALTER TABLE products ADD CONSTRAINT uq_products_tenant_product_id UNIQUE (tenant_id, id);
        END IF;
      END $$;
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint c
          WHERE c.conrelid = to_regclass('catalog_values')
            AND c.conname = 'uq_catalog_values_tenant_id'
            AND c.contype = 'u'
        ) THEN
          ALTER TABLE catalog_values ADD CONSTRAINT uq_catalog_values_tenant_id UNIQUE (tenant_id, id);
        END IF;
      END $$;
    `);

    // 2. The reusable group itself. min/max selection rules are explicit
    //    integers — no sentinel: min_selected >= 1 means required, and
    //    max_selected >= 1 always, so a many-option group stores an explicit
    //    bound. The database enforces both invariants in a single CHECK.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS modifier_groups (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        name varchar NOT NULL,
        min_selected integer NOT NULL DEFAULT 0,
        max_selected integer NOT NULL DEFAULT 1,
        allow_quantities boolean NOT NULL DEFAULT false,
        sort_order integer NOT NULL DEFAULT 0,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_modifier_groups_min_selected_non_negative CHECK (min_selected >= 0),
        CONSTRAINT chk_modifier_groups_max_gte_min CHECK (max_selected >= min_selected AND max_selected >= 1),
        CONSTRAINT uq_modifier_groups_tenant_name UNIQUE (tenant_id, name),
        CONSTRAINT uq_modifier_groups_tenant_id UNIQUE (tenant_id, id)
      )
    `);

    // 3. Child options. price_delta is the amount ADDED to the base price.
    //    The composite tenant FK makes a cross-tenant child row impossible.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS modifier_options (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        group_id uuid NOT NULL,
        name varchar NOT NULL,
        price_delta numeric(12, 2) NOT NULL DEFAULT 0,
        is_default boolean NOT NULL DEFAULT false,
        sort_order integer NOT NULL DEFAULT 0,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_modifier_options_tenant_id UNIQUE (tenant_id, id),
        CONSTRAINT fk_modifier_options_group_tenant FOREIGN KEY (tenant_id, group_id) REFERENCES modifier_groups(tenant_id, id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_modifier_options_tenant_group_active
      ON modifier_options (tenant_id, group_id, is_active)
    `);

    // 4. Category attachment. The category is a catalog_values row
    //    (catalog_type = 'SALES_PRODUCT_CATEGORY'); the FK targets
    //    catalog_values.id, never a free-text code.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS category_modifier_groups (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        catalog_value_id uuid NOT NULL,
        group_id uuid NOT NULL,
        sort_order integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_category_modifier_groups_catalog_value_tenant FOREIGN KEY (tenant_id, catalog_value_id) REFERENCES catalog_values(tenant_id, id),
        CONSTRAINT fk_category_modifier_groups_group_tenant FOREIGN KEY (tenant_id, group_id) REFERENCES modifier_groups(tenant_id, id)
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_category_modifier_groups_value_group
      ON category_modifier_groups (catalog_value_id, group_id)
    `);

    // 5. Product attachment, for per-product exceptions to the inherited
    //    category groups.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS product_modifier_groups (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        product_id uuid NOT NULL,
        group_id uuid NOT NULL,
        sort_order integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_product_modifier_groups_product_tenant FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id),
        CONSTRAINT fk_product_modifier_groups_group_tenant FOREIGN KEY (tenant_id, group_id) REFERENCES modifier_groups(tenant_id, id)
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_product_modifier_groups_product_group
      ON product_modifier_groups (product_id, group_id)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_product_modifier_groups_tenant_product
      ON product_modifier_groups (tenant_id, product_id)
    `);

    // 6. RLS on all four tables: every table carries its own tenant_id, so
    //    each is classified direct with a full per-command policy set. The
    //    predicate form is resolved per table through the shared seam — the
    //    columns are uuid today, but a partial-ledger re-run must emit the
    //    form that matches the column type AS IT IS.
    for (const table of CreateModifierGroups1809550000000.TABLES) {
      await queryRunner.query(`
        ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY
      `);

      await queryRunner.query(`
        ALTER TABLE ${table} FORCE ROW LEVEL SECURITY
      `);

      const tenantPredicate = await resolveTenantRlsPredicate(
        queryRunner,
        table,
      );

      await queryRunner.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = current_schema()
              AND tablename = '${table}'
              AND policyname = '${table}_tenant_select'
          ) THEN
            CREATE POLICY ${table}_tenant_select ON ${table}
            FOR SELECT
            USING (${tenantPredicate});
          END IF;
        END;
        $$
      `);

      await queryRunner.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = current_schema()
              AND tablename = '${table}'
              AND policyname = '${table}_tenant_insert'
          ) THEN
            CREATE POLICY ${table}_tenant_insert ON ${table}
            FOR INSERT
            WITH CHECK (${tenantPredicate});
          END IF;
        END;
        $$
      `);

      await queryRunner.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = current_schema()
              AND tablename = '${table}'
              AND policyname = '${table}_tenant_update'
          ) THEN
            CREATE POLICY ${table}_tenant_update ON ${table}
            FOR UPDATE
            USING (${tenantPredicate})
            WITH CHECK (${tenantPredicate});
          END IF;
        END;
        $$
      `);

      await queryRunner.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = current_schema()
              AND tablename = '${table}'
              AND policyname = '${table}_tenant_delete'
          ) THEN
            CREATE POLICY ${table}_tenant_delete ON ${table}
            FOR DELETE
            USING (${tenantPredicate});
          END IF;
        END;
        $$
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of CreateModifierGroups1809550000000.TABLES) {
      await queryRunner.query(
        `DROP POLICY IF EXISTS ${table}_tenant_delete ON ${table}`,
      );
      await queryRunner.query(
        `DROP POLICY IF EXISTS ${table}_tenant_update ON ${table}`,
      );
      await queryRunner.query(
        `DROP POLICY IF EXISTS ${table}_tenant_insert ON ${table}`,
      );
      await queryRunner.query(
        `DROP POLICY IF EXISTS ${table}_tenant_select ON ${table}`,
      );
    }

    await queryRunner.query(
      'DROP INDEX IF EXISTS idx_modifier_options_tenant_group_active',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS idx_product_modifier_groups_tenant_product',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS uq_category_modifier_groups_value_group',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS uq_product_modifier_groups_product_group',
    );

    // Children before the parent they reference. These tables are empty by
    // construction (no REST surface landed with them); when write paths
    // exist, a later slice owns any data-safety guard for down().
    await queryRunner.query('DROP TABLE IF EXISTS product_modifier_groups');
    await queryRunner.query('DROP TABLE IF EXISTS category_modifier_groups');
    await queryRunner.query('DROP TABLE IF EXISTS modifier_options');
    await queryRunner.query('DROP TABLE IF EXISTS modifier_groups');

    // Only the constraint this migration owns. The products constraint
    // belongs to migration 1802000000000, whose down() drops it.
    await queryRunner.query(
      'ALTER TABLE IF EXISTS catalog_values DROP CONSTRAINT IF EXISTS uq_catalog_values_tenant_id',
    );
  }
}
