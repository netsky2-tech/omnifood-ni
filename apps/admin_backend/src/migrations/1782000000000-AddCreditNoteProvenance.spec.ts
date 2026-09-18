import { QueryResult, type QueryRunner } from 'typeorm';
import { AddCreditNoteProvenance1782000000000 } from './1782000000000-AddCreditNoteProvenance';

describe('AddCreditNoteProvenance1782000000000', () => {
  const migration = new AddCreditNoteProvenance1782000000000();
  // The migration reads the tenant_id column type from information_schema
  // before emitting tenant policies, so each run must stub the data_type the
  // environment declares. `null` stubs a table without a tenant_id column.
  const collectSql = async (
    direction: 'up' | 'down' = 'up',
    tenantIdDataType: string | null = 'character varying',
  ) => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn((sql: string): Promise<QueryResult> => {
        queries.push(sql);
        if (sql.includes('information_schema.columns')) {
          return Promise.resolve(
            tenantIdDataType === null ? [] : [{ data_type: tenantIdDataType }],
          ) as unknown as Promise<QueryResult>;
        }
        return Promise.resolve(new QueryResult());
      }),
    } as unknown as QueryRunner;
    await migration[direction](queryRunner);
    return queries.join('\n');
  };

  it('adds backend credit-note provenance columns, indexes, and constraints', async () => {
    const sql = await collectSql();

    for (const fragment of [
      'ADD COLUMN IF NOT EXISTS origin_invoice_id varchar',
      'ADD COLUMN IF NOT EXISTS refund_reason_code varchar',
      'ADD COLUMN IF NOT EXISTS refund_reason_policy varchar',
      'ADD COLUMN IF NOT EXISTS origin_invoice_item_id varchar',
      'ADD COLUMN IF NOT EXISTS origin_movement_id bigint',
      'idx_invoices_tenant_origin_invoice',
      'idx_invoice_items_tenant_origin_item',
      'idx_inventory_kardex_tenant_origin_movement',
      'chk_invoices_credit_note_origin_policy',
      "type <> 'creditNote'",
      "type = 'creditNote'",
      'origin_invoice_id IS NULL',
      'refund_reason_code IS NULL',
      'origin_invoice_id IS NOT NULL',
      'refund_reason_policy IS NOT NULL',
      'credit_note_provenance_rls_baseline',
      'relrowsecurity',
      'relforcerowsecurity',
      'chk_invoice_items_credit_note_origin',
      'chk_inventory_kardex_refund_reason_policy',
      "source_document_type <> 'CREDIT_NOTE'",
      'origin_movement_id IS NOT NULL',
    ]) {
      expect(sql).toContain(fragment);
    }
  });

  it('keeps inventory movement_type as varchar so CREDIT_NOTE_RESTOCK needs no PostgreSQL enum migration', async () => {
    const sql = await collectSql();

    expect(sql).not.toContain('ALTER TYPE');
    expect(sql).not.toContain('ADD VALUE');
    expect(sql).toContain("source_document_type = 'CREDIT_NOTE'");
    expect(sql).toContain('refund_reason_policy IN (');
  });

  it('enforces tenant RLS, same-tenant origin ownership, and append-only guards', async () => {
    const sql = await collectSql('up', 'uuid');

    for (const tableName of ['invoices', 'invoice_items', 'inventory_kardex']) {
      expect(sql).toContain(
        `ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY`,
      );
      expect(sql).toContain(
        `ALTER TABLE ${tableName} FORCE ROW LEVEL SECURITY`,
      );
    }
    for (const fragment of [
      'validate_credit_note_invoice_origin_tenant',
      'validate_credit_note_item_origin_tenant',
      'validate_credit_note_kardex_origin_tenant',
      'trg_invoices_credit_note_origin_tenant',
      'trg_invoice_items_credit_note_origin_tenant',
      'trg_inventory_kardex_credit_note_origin_tenant',
      'BEFORE INSERT OR UPDATE ON invoice_items',
      'BEFORE INSERT OR UPDATE ON inventory_kardex',
      'non-credit invoice provenance fields must be null',
      'non-credit invoice item cannot reference an origin invoice item',
      'non-credit kardex provenance fields must be null',
      'credit-note kardex row requires refund reason policy',
      'credit-note kardex row requires origin movement',
      'credit-note kardex row requires origin invoice item',
      'origin.tenant_id::text <> NEW.tenant_id::text',
      'origin.invoice_id::text <> parent_invoice.origin_invoice_id',
      "origin_movement.source_document_id <> ('invoice:' || credit_note_invoice.origin_invoice_id)",
      'reject_credit_note_invoice_provenance_mutation',
      'reject_credit_note_item_provenance_mutation',
      'reject_credit_note_kardex_provenance_mutation',
      'trg_invoices_credit_note_provenance_immutable',
      'trg_invoice_items_credit_note_provenance_immutable',
      'trg_inventory_kardex_credit_note_provenance_immutable',
    ]) {
      expect(sql).toContain(fragment);
    }

    // The stubbed tenant_id column type is uuid, so every tenant policy must
    // use the index-friendly uuid predicate instead of the text cast: a text
    // predicate makes PostgreSQL evaluate the tenant check as a Filter instead
    // of an Index Cond. These assertions fail if anyone reverts to the text
    // form (which a re-run of this migration would otherwise silently do,
    // clobbering the later predicate-alignment fix).
    const uuidPredicate =
      "tenant_id = current_setting('app.tenant_id', true)::uuid";
    expect(sql).toContain(uuidPredicate);
    expect(sql).toContain(
      `CREATE POLICY credit_note_invoices_tenant_select\n            ON invoices FOR SELECT USING (${uuidPredicate});`,
    );
    expect(sql).toContain(
      `CREATE POLICY credit_note_invoices_tenant_insert\n            ON invoices FOR INSERT WITH CHECK (${uuidPredicate});`,
    );
    expect(sql).toContain(
      `CREATE POLICY credit_note_invoices_tenant_update\n            ON invoices FOR UPDATE USING (${uuidPredicate}) WITH CHECK (${uuidPredicate});`,
    );
    expect(sql).toContain(
      `CREATE POLICY credit_note_invoices_tenant_delete\n            ON invoices FOR DELETE USING (${uuidPredicate});`,
    );
    const invoicesRlsSection = sql.slice(
      sql.indexOf('ALTER TABLE invoices ENABLE ROW LEVEL SECURITY'),
      sql.indexOf('ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY'),
    );
    expect(invoicesRlsSection).not.toContain('tenant_id::text');
    const itemsRlsSection = sql.slice(
      sql.indexOf('ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY'),
      sql.indexOf('ALTER TABLE inventory_kardex ENABLE ROW LEVEL SECURITY'),
    );
    expect(itemsRlsSection).not.toContain('tenant_id::text');
    const kardexRlsSection = sql.slice(
      sql.indexOf('ALTER TABLE inventory_kardex ENABLE ROW LEVEL SECURITY'),
      sql.indexOf(
        'CREATE OR REPLACE FUNCTION validate_credit_note_invoice_origin_tenant',
      ),
    );
    expect(kardexRlsSection).not.toContain('tenant_id::text');
  });

  it('emits the text-cast tenant predicate when tenant_id is varchar, never the uuid cast', async () => {
    const sql = await collectSql('up', 'character varying');

    // The stubbed tenant_id column type is varchar, so a uuid-cast predicate
    // would break the migration with "operator does not exist: character
    // varying = uuid" (the exact CI regression this guards against). The text
    // cast is the only valid form here, and it must appear in the same policy
    // shapes as the uuid run.
    const textPredicate =
      "tenant_id::text = current_setting('app.tenant_id', true)";
    expect(sql).toContain(textPredicate);
    expect(sql).toContain(
      `CREATE POLICY credit_note_invoices_tenant_select\n            ON invoices FOR SELECT USING (${textPredicate});`,
    );
    expect(sql).toContain(
      `CREATE POLICY credit_note_invoice_items_tenant_select\n            ON invoice_items FOR SELECT USING (${textPredicate});`,
    );
    expect(sql).toContain(
      `CREATE POLICY credit_note_inventory_kardex_tenant_select\n            ON inventory_kardex FOR SELECT USING (${textPredicate});`,
    );
    expect(sql).not.toContain('::uuid');
  });

  it('refuses to emit tenant policies when the table has no tenant_id column', async () => {
    // The first table processed is invoices, so the error must name it.
    await expect(collectSql('up', null)).rejects.toThrow(
      /'invoices' has no tenant_id column/,
    );
  });

  it('refuses to emit tenant policies for an unsupported tenant_id column type', async () => {
    await expect(collectSql('up', 'integer')).rejects.toThrow(
      /unsupported tenant_id column type 'integer'/,
    );
  });

  it('rolls back migration-owned provenance schema objects', async () => {
    const sql = await collectSql('down');

    expect(sql).toContain(
      'DROP TRIGGER IF EXISTS trg_invoices_credit_note_provenance_immutable',
    );
    expect(sql).toContain(
      'DROP FUNCTION IF EXISTS validate_credit_note_invoice_origin_tenant()',
    );
    expect(sql).toContain(
      'DROP POLICY IF EXISTS credit_note_invoices_tenant_select',
    );
    expect(sql).toContain('DROP COLUMN IF EXISTS origin_invoice_id');
    expect(sql).toContain('DROP COLUMN IF EXISTS origin_invoice_item_id');
    expect(sql).toContain('DROP COLUMN IF EXISTS origin_movement_id');
    expect(sql).toContain('FROM credit_note_provenance_rls_baseline');
    expect(sql).toContain('ALTER TABLE invoices DISABLE ROW LEVEL SECURITY');
    expect(sql).toContain('ALTER TABLE invoices NO FORCE ROW LEVEL SECURITY');
    expect(sql).toContain(
      'ALTER TABLE invoice_items DISABLE ROW LEVEL SECURITY',
    );
    expect(sql).toContain(
      'ALTER TABLE inventory_kardex NO FORCE ROW LEVEL SECURITY',
    );
    expect(sql).toContain(
      'DROP TABLE IF EXISTS credit_note_provenance_rls_baseline',
    );
  });
});
