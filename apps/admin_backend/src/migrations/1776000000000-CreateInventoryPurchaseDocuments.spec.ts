import { QueryResult, type QueryRunner } from 'typeorm';
import { CreateInventoryPurchaseDocuments1776000000000 } from './1776000000000-CreateInventoryPurchaseDocuments';

describe('CreateInventoryPurchaseDocuments1776000000000', () => {
  const migration = new CreateInventoryPurchaseDocuments1776000000000();

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

  it('creates purchase documents with tenant invoice uniqueness and RLS policies', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);

    const sql = queries.join('\n');
    expect(sql).toContain(
      'CREATE TABLE IF NOT EXISTS inventory_purchase_documents',
    );
    expect(sql).toContain('supplier_id uuid NOT NULL');
    expect(sql).toContain('invoice_number varchar NOT NULL');
    expect(sql).toContain('fiscal_authorization_code varchar');
    expect(sql).toContain('entry_timestamp timestamptz NOT NULL');
    expect(sql).toContain(
      'uq_inventory_purchase_documents_tenant_supplier_invoice',
    );
    expect(sql).toContain('tenant_id, supplier_id, invoice_number');
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('FORCE ROW LEVEL SECURITY');
    expect(sql).toContain("current_setting('app.tenant_id', true)");
  });

  it('drops policies, indexes, and table in down migration', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.down(queryRunner);

    const sql = queries.join('\n');
    expect(sql).toContain(
      'DROP POLICY IF EXISTS inventory_purchase_documents_tenant_delete ON inventory_purchase_documents',
    );
    expect(sql).toContain(
      'DROP INDEX IF EXISTS uq_inventory_purchase_documents_tenant_supplier_invoice',
    );
    expect(sql).toContain('DROP TABLE IF EXISTS inventory_purchase_documents');
  });
});
