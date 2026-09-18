import { QueryResult, type QueryRunner } from 'typeorm';
import { AlignInvoiceTenantPolicyPredicate1809060000000 } from './1809060000000-AlignInvoiceTenantPolicyPredicate';

const POLICY_NAMES = [
  'credit_note_invoices_tenant_select',
  'credit_note_invoices_tenant_insert',
  'credit_note_invoices_tenant_update',
  'credit_note_invoices_tenant_delete',
] as const;

// Target predicate: direct uuid comparison, index-friendly on the uuid column.
const TARGET_PREDICATE = "tenant_id = current_setting('app.tenant_id', true)::uuid";

// Previous predicate emitted by the credit-note provenance migration.
const PREVIOUS_PREDICATE = "tenant_id::text = current_setting('app.tenant_id', true)";

describe('AlignInvoiceTenantPolicyPredicate1809060000000', () => {
  const migration = new AlignInvoiceTenantPolicyPredicate1809060000000();

  const collectSql = async (
    direction: 'up' | 'down' = 'up',
  ): Promise<string> => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn((sql: string): Promise<QueryResult> => {
        queries.push(sql);
        return Promise.resolve(new QueryResult());
      }),
    } as unknown as QueryRunner;
    await migration[direction](queryRunner);
    return queries.join('\n');
  };

  describe('fail-closed uuid type guard', () => {
    it('emits a type guard in up() that references the invoices tenant_id column', async () => {
      const sql = await collectSql('up');

      expect(sql).toContain('DO $$');
      expect(sql).toContain('information_schema.columns');
      expect(sql).toContain("table_name = 'invoices'");
      expect(sql).toContain("column_name = 'tenant_id'");
      expect(sql).toContain('RAISE EXCEPTION');
    });

    it('runs the type guard before any policy is created', async () => {
      const sql = await collectSql('up');

      const guardAt = sql.indexOf('information_schema.columns');
      const firstCreateAt = sql.indexOf('CREATE POLICY');
      expect(guardAt).toBeGreaterThanOrEqual(0);
      expect(firstCreateAt).toBeGreaterThan(guardAt);
    });
  });

  describe('tenant isolation policies', () => {
    it('drops each of the four existing policies before recreating it', async () => {
      const sql = await collectSql('up');

      for (const policyName of POLICY_NAMES) {
        const dropAt = sql.indexOf(
          `DROP POLICY IF EXISTS "${policyName}" ON "invoices"`,
        );
        const createAt = sql.indexOf(`CREATE POLICY "${policyName}"`);
        expect(dropAt).toBeGreaterThanOrEqual(0);
        expect(createAt).toBeGreaterThan(dropAt);
      }
    });

    it('issues the target uuid predicate exactly five times in up() (select 1 + insert 1 + update 2 + delete 1)', async () => {
      const sql = await collectSql('up');

      expect(sql.split(TARGET_PREDICATE).length - 1).toBe(5);
    });

    it('places USING and WITH CHECK per command semantics in up()', async () => {
      const sql = await collectSql('up');

      expect(sql).toContain(
        `CREATE POLICY "credit_note_invoices_tenant_select" ON "invoices"\n      FOR SELECT\n      USING (${TARGET_PREDICATE})`,
      );
      expect(sql).toContain(
        `CREATE POLICY "credit_note_invoices_tenant_insert" ON "invoices"\n      FOR INSERT\n      WITH CHECK (${TARGET_PREDICATE})`,
      );
      expect(sql).toContain(
        `CREATE POLICY "credit_note_invoices_tenant_update" ON "invoices"\n      FOR UPDATE\n      USING (${TARGET_PREDICATE})\n      WITH CHECK (${TARGET_PREDICATE})`,
      );
      expect(sql).toContain(
        `CREATE POLICY "credit_note_invoices_tenant_delete" ON "invoices"\n      FOR DELETE\n      USING (${TARGET_PREDICATE})`,
      );
    });

    it('never keeps the text cast in up(): that is the whole point of the migration', async () => {
      const sql = await collectSql('up');

      expect(sql).not.toContain('::text');
    });

    it('restores the previous text predicate exactly five times in down()', async () => {
      const sql = await collectSql('down');

      expect(sql.split(PREVIOUS_PREDICATE).length - 1).toBe(5);
      expect(sql).not.toContain('::uuid');
    });

    it('drops the same four policies in down()', async () => {
      const sql = await collectSql('down');

      for (const policyName of POLICY_NAMES) {
        expect(sql).toContain(
          `DROP POLICY IF EXISTS "${policyName}" ON "invoices"`,
        );
      }
    });
  });

  describe('scope and safety', () => {
    it('never touches other tables in either direction', async () => {
      const upSql = await collectSql('up');
      const downSql = await collectSql('down');

      expect(upSql).not.toContain('invoice_items');
      expect(upSql).not.toContain('inventory_kardex');
      expect(downSql).not.toContain('invoice_items');
      expect(downSql).not.toContain('inventory_kardex');
    });

    it('never drops tables, truncates, or deletes rows in either direction', async () => {
      const upSql = await collectSql('up');
      const downSql = await collectSql('down');

      // `FOR DELETE` is required policy syntax, so the forbidden shape is a
      // DELETE statement, not the word DELETE itself.
      for (const sql of [upSql, downSql]) {
        expect(sql).not.toMatch(/DROP TABLE/i);
        expect(sql).not.toMatch(/TRUNCATE/i);
        expect(sql).not.toMatch(/DELETE FROM/i);
      }
    });

    it('never enables, forces, or disables row level security in either direction', async () => {
      const upSql = await collectSql('up');
      const downSql = await collectSql('down');

      for (const sql of [upSql, downSql]) {
        expect(sql).not.toContain('ENABLE ROW LEVEL SECURITY');
        expect(sql).not.toContain('FORCE ROW LEVEL SECURITY');
        expect(sql).not.toContain('DISABLE ROW LEVEL SECURITY');
      }
    });
  });
});
