import { QueryResult, type QueryRunner } from 'typeorm';
import { CreateInventoryRemediationReceipts1806000000000 } from './1806000000000-CreateInventoryRemediationReceipts';

describe('CreateInventoryRemediationReceipts1806000000000', () => {
  const migration = new CreateInventoryRemediationReceipts1806000000000();

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

  it('creates inventory_remediation_receipts table with expected columns and constraints', async () => {
    const sql = await collectSql('up');

    for (const fragment of [
      'CREATE TABLE IF NOT EXISTS inventory_remediation_receipts',
      'id uuid PRIMARY KEY DEFAULT gen_random_uuid()',
      'tenant_id varchar(128) NOT NULL',
      'idempotency_key varchar(255) NOT NULL',
      'command_type varchar(64) NOT NULL',
      'request_hash varchar(64) NOT NULL',
      'source_invoice_id uuid NOT NULL',
      'source_inventory_receipt_id uuid NOT NULL',
      'recipe_version_id uuid NOT NULL',
      'actor_user_id varchar(128) NOT NULL',
      'actor_role varchar(64) NOT NULL',
      'reason text NOT NULL',
      'status varchar(32) NOT NULL DEFAULT \'APPLIED\'',
      'result jsonb NOT NULL',
      'audit_event_id uuid NOT NULL',
      'created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP',
      'completed_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP',
      'uq_inventory_remediation_receipts_idempotency',
      'uq_inventory_remediation_receipts_source_command',
    ]) {
      expect(sql).toContain(fragment);
    }
  });

  it('enables and forces RLS with SELECT and INSERT policies', async () => {
    const sql = await collectSql('up');

    for (const fragment of [
      'ALTER TABLE inventory_remediation_receipts ENABLE ROW LEVEL SECURITY',
      'ALTER TABLE inventory_remediation_receipts FORCE ROW LEVEL SECURITY',
      'CREATE POLICY remediation_receipts_select ON inventory_remediation_receipts',
      'CREATE POLICY remediation_receipts_insert ON inventory_remediation_receipts',
      'current_setting(\'app.tenant_id\', true)',
    ]) {
      expect(sql).toContain(fragment);
    }
  });

  it('creates append-only trigger blocking UPDATE and DELETE', async () => {
    const sql = await collectSql('up');

    for (const fragment of [
      'guard_remediation_receipt_immutability',
      'BEFORE UPDATE OR DELETE ON inventory_remediation_receipts',
      'inventory_remediation_receipts is append-only',
    ]) {
      expect(sql).toContain(fragment);
    }
  });

  it('down migration guards against removing historical remediation evidence', async () => {
    const sql = await collectSql('down');

    for (const fragment of [
      'IF EXISTS (SELECT 1 FROM inventory_remediation_receipts LIMIT 1)',
      'RAISE EXCEPTION',
      'historical remediation receipts exist',
      'DROP TABLE IF EXISTS inventory_remediation_receipts',
    ]) {
      expect(sql).toContain(fragment);
    }
  });
});
