import { QueryResult, type QueryRunner } from 'typeorm';
import { AddCreditNoteProvenance1782000000000 } from './1782000000000-AddCreditNoteProvenance';

describe('AddCreditNoteProvenance1782000000000', () => {
  const migration = new AddCreditNoteProvenance1782000000000();
  const collectSql = async (direction: 'up' | 'down' = 'up') => {
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
    expect(sql).toContain("refund_reason_policy IN (");
  });

  it('enforces tenant RLS, same-tenant origin ownership, and append-only guards', async () => {
    const sql = await collectSql();

    for (const tableName of ['invoices', 'invoice_items', 'inventory_kardex']) {
      expect(sql).toContain(`ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY`);
      expect(sql).toContain(`ALTER TABLE ${tableName} FORCE ROW LEVEL SECURITY`);
    }
    for (const fragment of [
      "tenant_id::text = current_setting('app.tenant_id', true)",
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
  });

  it('rolls back migration-owned provenance schema objects', async () => {
    const sql = await collectSql('down');

    expect(sql).toContain('DROP TRIGGER IF EXISTS trg_invoices_credit_note_provenance_immutable');
    expect(sql).toContain('DROP FUNCTION IF EXISTS validate_credit_note_invoice_origin_tenant()');
    expect(sql).toContain('DROP POLICY IF EXISTS credit_note_invoices_tenant_select');
    expect(sql).toContain('DROP COLUMN IF EXISTS origin_invoice_id');
    expect(sql).toContain('DROP COLUMN IF EXISTS origin_invoice_item_id');
    expect(sql).toContain('DROP COLUMN IF EXISTS origin_movement_id');
    expect(sql).toContain('FROM credit_note_provenance_rls_baseline');
    expect(sql).toContain('ALTER TABLE invoices DISABLE ROW LEVEL SECURITY');
    expect(sql).toContain('ALTER TABLE invoices NO FORCE ROW LEVEL SECURITY');
    expect(sql).toContain('ALTER TABLE invoice_items DISABLE ROW LEVEL SECURITY');
    expect(sql).toContain('ALTER TABLE inventory_kardex NO FORCE ROW LEVEL SECURITY');
    expect(sql).toContain('DROP TABLE IF EXISTS credit_note_provenance_rls_baseline');
  });
});
