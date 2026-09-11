import { QueryResult, type QueryRunner } from 'typeorm';
import { AddSaleInventoryOutcomeColumns1803000000000 } from './1803000000000-AddSaleInventoryOutcomeColumns';

describe('AddSaleInventoryOutcomeColumns1803000000000', () => {
  const migration = new AddSaleInventoryOutcomeColumns1803000000000();

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

  it('adds sale inventory outcome and snapshot columns to invoices, invoice_items, and inventory_sync_receipts', async () => {
    const sql = await collectSql();

    for (const fragment of [
      'ALTER TABLE invoices',
      'ADD COLUMN IF NOT EXISTS inventory_policy_version varchar(64)',
      'ADD COLUMN IF NOT EXISTS inventory_outcome varchar(64)',
      'ADD COLUMN IF NOT EXISTS inventory_outcome_reason jsonb',
      'ALTER TABLE invoice_items',
      'ADD COLUMN IF NOT EXISTS inventory_snapshot_version varchar(64)',
      'ADD COLUMN IF NOT EXISTS inventory_snapshot jsonb',
      'ALTER TABLE inventory_sync_receipts',
      'ADD COLUMN IF NOT EXISTS acknowledged_correlation_ids jsonb',
    ]) {
      expect(sql).toContain(fragment);
    }
  });

  it('refuses down migration to protect historical outcome append-only evidence', async () => {
    await expect(collectSql('down')).rejects.toThrow(
      'down migration forbidden: historical sale outcome fields are append-only',
    );
  });
});
