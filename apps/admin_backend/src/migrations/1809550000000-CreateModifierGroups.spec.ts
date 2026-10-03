import { QueryResult, type QueryRunner } from 'typeorm';
import { CreateModifierGroups1809550000000 } from './1809550000000-CreateModifierGroups';

/**
 * The migration resolves every tenant RLS predicate through the shared
 * type-aware resolver, which reads each table's tenant_id column type from
 * information_schema (the table name arrives as the first bound parameter).
 * The stub answers with `uuid` for every table — the type the four new
 * tables are created with and the type catalog_values/products already
 * carry, so the composite foreign keys resolve against uuid parents.
 * The predicate FORMS themselves are not re-spelled here: they are imported
 * from the policy helper, the single source of that vocabulary.
 */
const TABLES = [
  'modifier_groups',
  'modifier_options',
  'category_modifier_groups',
  'product_modifier_groups',
] as const;

const COMMANDS = ['select', 'insert', 'update', 'delete'] as const;

/** Whitespace-insensitive view of the collected SQL, so assertions protect
 * the contract without coupling to the migration's source indentation. */
const flat = (sql: string): string => sql.replace(/\s+/g, ' ');

describe('CreateModifierGroups1809550000000', () => {
  const migration = new CreateModifierGroups1809550000000();

  const collectSql = async (direction: 'up' | 'down' = 'up') => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn((sql: string, params?: unknown[]): Promise<QueryResult> => {
        if (sql.includes('information_schema.columns')) {
          const firstParam: unknown = params?.[0];
          void (typeof firstParam === 'string' ? firstParam : '');
          return Promise.resolve([
            { data_type: 'uuid' },
          ]) as unknown as Promise<QueryResult>;
        }
        queries.push(sql);
        return Promise.resolve(new QueryResult());
      }),
    } as unknown as QueryRunner;
    await migration[direction](queryRunner);
    return { sql: queries.join('\n') };
  };

  describe('table creation', () => {
    it('creates all four modifier tables', async () => {
      const { sql } = await collectSql('up');

      expect(sql).toContain('CREATE TABLE IF NOT EXISTS modifier_groups');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS modifier_options');
      expect(sql).toContain(
        'CREATE TABLE IF NOT EXISTS category_modifier_groups',
      );
      expect(sql).toContain(
        'CREATE TABLE IF NOT EXISTS product_modifier_groups',
      );
    });

    it('creates modifier_groups with uuid tenant identity, selection rules, and quantity flag', async () => {
      const { sql } = await collectSql('up');

      expect(sql).toContain(
        'CREATE TABLE IF NOT EXISTS modifier_groups (\n        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n        tenant_id uuid NOT NULL,',
      );
      expect(sql).toContain('name varchar NOT NULL');
      expect(sql).toContain('min_selected integer NOT NULL DEFAULT 0');
      expect(sql).toContain('max_selected integer NOT NULL DEFAULT 1');
      expect(sql).toContain('allow_quantities boolean NOT NULL DEFAULT false');
      expect(sql).toContain('sort_order integer NOT NULL DEFAULT 0');
      expect(sql).toContain('is_active boolean NOT NULL DEFAULT true');
      expect(sql).toContain('created_at timestamptz NOT NULL DEFAULT now()');
      expect(sql).toContain('updated_at timestamptz NOT NULL DEFAULT now()');
    });

    it('creates modifier_options with a delta price over the base price', async () => {
      const { sql } = await collectSql('up');

      expect(sql).toContain(
        'CREATE TABLE IF NOT EXISTS modifier_options (\n        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n        tenant_id uuid NOT NULL,',
      );
      expect(sql).toContain('price_delta numeric(12, 2) NOT NULL DEFAULT 0');
      expect(sql).toContain('is_default boolean NOT NULL DEFAULT false');
    });

    it('creates the attachment tables with sort order and timestamps', async () => {
      const { sql } = await collectSql('up');

      expect(sql).toContain('catalog_value_id uuid NOT NULL');
      expect(sql).toContain('product_id uuid NOT NULL');
      expect(sql).toMatch(/category_modifier_groups[\s\S]*group_id uuid NOT NULL/);
      expect(sql).toMatch(/product_modifier_groups[\s\S]*group_id uuid NOT NULL/);
    });
  });

  describe('check constraints', () => {
    it('guards min_selected >= 0 with a single CHECK covering both max bounds', async () => {
      const { sql } = await collectSql('up');

      expect(sql).toMatch(
        /CONSTRAINT chk_modifier_groups_min_selected_non_negative CHECK \(min_selected >= 0\)/,
      );
      expect(sql).toMatch(
        /CONSTRAINT chk_modifier_groups_max_gte_min CHECK \(max_selected >= min_selected AND max_selected >= 1\)/,
      );
    });

    it('forbids max_selected = 0 and requires max_selected >= min_selected', async () => {
      const { sql } = await collectSql('up');

      const check = flat(sql).match(
        /CONSTRAINT chk_modifier_groups_max_gte_min CHECK \([^)]*\)/,
      )?.[0];

      expect(check).toBeDefined();
      expect(check).toContain('max_selected >= 1');
      expect(check).toContain('max_selected >= min_selected');
    });
  });

  describe('uniqueness', () => {
    it('uniquely keys modifier_groups per tenant by name and by id', async () => {
      const { sql } = await collectSql('up');

      expect(sql).toMatch(
        /CONSTRAINT uq_modifier_groups_tenant_name UNIQUE \(tenant_id, name\)/,
      );
      expect(sql).toMatch(
        /CONSTRAINT uq_modifier_groups_tenant_id UNIQUE \(tenant_id, id\)/,
      );
    });

    it('uniquely keys modifier_options per tenant by id', async () => {
      const { sql } = await collectSql('up');

      expect(sql).toMatch(
        /CONSTRAINT uq_modifier_options_tenant_id UNIQUE \(tenant_id, id\)/,
      );
    });

    it('prevents duplicate attachments of a group to the same category or product', async () => {
      const { sql } = await collectSql('up');

      expect(flat(sql)).toContain(
        'CREATE UNIQUE INDEX IF NOT EXISTS uq_category_modifier_groups_value_group ON category_modifier_groups (catalog_value_id, group_id)',
      );
      expect(flat(sql)).toContain(
        'CREATE UNIQUE INDEX IF NOT EXISTS uq_product_modifier_groups_product_group ON product_modifier_groups (product_id, group_id)',
      );
    });
  });

  describe('composite tenant foreign keys', () => {
    it('binds modifier_options to its group through (tenant_id, group_id)', async () => {
      const { sql } = await collectSql('up');

      expect(sql).toMatch(
        /CONSTRAINT fk_modifier_options_group_tenant FOREIGN KEY \(tenant_id, group_id\) REFERENCES modifier_groups\(tenant_id, id\)/,
      );
    });

    it('binds category attachments through (tenant_id, catalog_value_id) and (tenant_id, group_id)', async () => {
      const { sql } = await collectSql('up');

      expect(sql).toMatch(
        /CONSTRAINT fk_category_modifier_groups_catalog_value_tenant FOREIGN KEY \(tenant_id, catalog_value_id\) REFERENCES catalog_values\(tenant_id, id\)/,
      );
      expect(sql).toMatch(
        /CONSTRAINT fk_category_modifier_groups_group_tenant FOREIGN KEY \(tenant_id, group_id\) REFERENCES modifier_groups\(tenant_id, id\)/,
      );
    });

    it('binds product attachments through (tenant_id, product_id) and (tenant_id, group_id)', async () => {
      const { sql } = await collectSql('up');

      expect(sql).toMatch(
        /CONSTRAINT fk_product_modifier_groups_product_tenant FOREIGN KEY \(tenant_id, product_id\) REFERENCES products\(tenant_id, id\)/,
      );
      expect(sql).toMatch(
        /CONSTRAINT fk_product_modifier_groups_group_tenant FOREIGN KEY \(tenant_id, group_id\) REFERENCES modifier_groups\(tenant_id, id\)/,
      );
    });

    it('adds the parent UNIQUE (tenant_id, id) constraints idempotently, guarded on the catalog', async () => {
      const { sql } = await collectSql('up');

      // Both guarded DO blocks must consult pg_constraint scoped by
      // to_regclass so a partial re-run never collides with an existing
      // constraint.
      expect(sql).toMatch(
        /DO \$\$ BEGIN\s+IF NOT EXISTS \(\s+SELECT 1\s+FROM pg_constraint c\s+WHERE c\.conrelid = to_regclass\('products'\)\s+AND c\.conname = 'uq_products_tenant_product_id'\s+AND c\.contype = 'u'\s+\) THEN\s+ALTER TABLE products ADD CONSTRAINT uq_products_tenant_product_id UNIQUE \(tenant_id, id\);/,
      );
      expect(sql).toMatch(
        /DO \$\$ BEGIN\s+IF NOT EXISTS \(\s+SELECT 1\s+FROM pg_constraint c\s+WHERE c\.conrelid = to_regclass\('catalog_values'\)\s+AND c\.conname = 'uq_catalog_values_tenant_id'\s+AND c\.contype = 'u'\s+\) THEN\s+ALTER TABLE catalog_values ADD CONSTRAINT uq_catalog_values_tenant_id UNIQUE \(tenant_id, id\);/,
      );
    });
  });

  describe('lookup indexes', () => {
    it('indexes the active options of a group', async () => {
      const { sql } = await collectSql('up');

      expect(flat(sql)).toContain(
        'CREATE INDEX IF NOT EXISTS idx_modifier_options_tenant_group_active ON modifier_options (tenant_id, group_id, is_active)',
      );
    });

    it('indexes product attachments by tenant and product', async () => {
      const { sql } = await collectSql('up');

      expect(flat(sql)).toContain(
        'CREATE INDEX IF NOT EXISTS idx_product_modifier_groups_tenant_product ON product_modifier_groups (tenant_id, product_id)',
      );
    });
  });

  describe('row level security', () => {
    it.each(TABLES)('enables row level security on %s', async (table) => {
      const { sql } = await collectSql('up');

      expect(sql).toContain(
        `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`,
      );
    });

    it.each(TABLES)('forces row level security on %s', async (table) => {
      const { sql } = await collectSql('up');

      expect(sql).toContain(
        `ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`,
      );
    });

    it.each(TABLES)(
      'creates one tenant policy per command on %s (4 policies total)',
      async (table) => {
        const { sql } = await collectSql('up');

        for (const command of COMMANDS) {
          expect(sql).toContain(
            `CREATE POLICY ${table}_tenant_${command} ON ${table}`,
          );
        }

        // Every policy is catalog-guarded so a partial re-run never collides.
        for (const command of COMMANDS) {
          expect(sql).toMatch(
            new RegExp(
              `IF NOT EXISTS \\(\\s+SELECT 1 FROM pg_policies\\s+WHERE schemaname = current_schema\\(\\)\\s+AND tablename = '${table}'\\s+AND policyname = '${table}_tenant_${command}'`,
            ),
          );
        }

        // The SELECT and DELETE halves are USING; INSERT and UPDATE carry
        // WITH CHECK (UPDATE carries both), all with the shared predicate.
        expect(flat(sql)).toContain(
          `CREATE POLICY ${table}_tenant_select ON ${table} FOR SELECT USING (`,
        );
        expect(flat(sql)).toContain(
          `CREATE POLICY ${table}_tenant_insert ON ${table} FOR INSERT WITH CHECK (`,
        );
        expect(flat(sql)).toContain(
          `CREATE POLICY ${table}_tenant_update ON ${table} FOR UPDATE USING (`,
        );
        expect(flat(sql)).toContain(
          `CREATE POLICY ${table}_tenant_delete ON ${table} FOR DELETE USING (`,
        );
      },
    );

    it('resolves every tenant predicate through the shared type-aware resolver', async () => {
      const { sql } = await collectSql('up');

      expect(sql).not.toContain("tenant_id::text = current_setting");
      expect(
        (sql.match(/current_setting\('app\.tenant_id', true\)::uuid/g) ?? [])
          .length,
      ).toBe(TABLES.length * 5); // 4 policies per table; UPDATE carries two halves
    });
  });

  describe('down()', () => {
    it('removes the policies, indexes, and the four tables, and releases the catalog_values parent constraint', async () => {
      const { sql } = await collectSql('down');

      for (const table of TABLES) {
        for (const command of COMMANDS) {
          expect(sql).toContain(
            `DROP POLICY IF EXISTS ${table}_tenant_${command} ON ${table}`,
          );
        }
      }

      expect(sql).toContain(
        'DROP INDEX IF EXISTS idx_modifier_options_tenant_group_active',
      );
      expect(sql).toContain(
        'DROP INDEX IF EXISTS idx_product_modifier_groups_tenant_product',
      );
      expect(sql).toContain(
        'DROP INDEX IF EXISTS uq_category_modifier_groups_value_group',
      );
      expect(sql).toContain(
        'DROP INDEX IF EXISTS uq_product_modifier_groups_product_group',
      );

      // Children first, then the parent, then the parent constraint this
      // migration owns (products' constraint belongs to migration 1802000000000).
      expect(sql.indexOf('DROP TABLE IF EXISTS modifier_options')).toBeLessThan(
        sql.indexOf('DROP TABLE IF EXISTS modifier_groups'),
      );
      expect(sql).toContain('DROP TABLE IF EXISTS modifier_options');
      expect(sql).toContain('DROP TABLE IF EXISTS modifier_groups');
      expect(sql).toContain('DROP TABLE IF EXISTS category_modifier_groups');
      expect(sql).toContain('DROP TABLE IF EXISTS product_modifier_groups');
      expect(sql).toContain(
        'ALTER TABLE IF EXISTS catalog_values DROP CONSTRAINT IF EXISTS uq_catalog_values_tenant_id',
      );
    });

    it('guards the catalog_values constraint drop with ALTER TABLE IF EXISTS', async () => {
      const { sql } = await collectSql('down');

      // On a physically empty database catalog_values does not exist; the
      // unguarded ALTER TABLE would error instead of no-op like the IF
      // EXISTS drops above it.
      expect(flat(sql)).toContain(
        'ALTER TABLE IF EXISTS catalog_values DROP CONSTRAINT IF EXISTS uq_catalog_values_tenant_id',
      );
    });
  });
});
