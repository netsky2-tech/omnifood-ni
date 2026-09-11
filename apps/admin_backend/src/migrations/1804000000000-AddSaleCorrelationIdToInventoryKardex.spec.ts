import { QueryResult, type QueryRunner } from 'typeorm';
import { AddSaleCorrelationIdToInventoryKardex1804000000000 } from './1804000000000-AddSaleCorrelationIdToInventoryKardex';

describe('AddSaleCorrelationIdToInventoryKardex1804000000000', () => {
  const migration = new AddSaleCorrelationIdToInventoryKardex1804000000000();

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

  it('adds nullable sale_correlation_id column and tenant partial unique index to inventory_kardex', async () => {
    const sql = await collectSql('up');

    for (const fragment of [
      'ALTER TABLE inventory_kardex',
      'ADD COLUMN IF NOT EXISTS sale_correlation_id varchar',
      'CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_kardex_sale_correlation',
      'ON inventory_kardex (tenant_id, sale_correlation_id)',
      'WHERE sale_correlation_id IS NOT NULL',
    ]) {
      expect(sql).toContain(fragment);
    }
  });

  it('down migration guards against removing historical sale correlation evidence', async () => {
    const sql = await collectSql('down');

    for (const fragment of [
      'IF EXISTS (SELECT 1 FROM inventory_kardex WHERE sale_correlation_id IS NOT NULL LIMIT 1)',
      'RAISE EXCEPTION',
      'historical sale correlation evidence exists',
      'DROP INDEX IF EXISTS uq_inventory_kardex_sale_correlation',
      'ALTER TABLE inventory_kardex DROP COLUMN IF EXISTS sale_correlation_id',
    ]) {
      expect(sql).toContain(fragment);
    }
  });
});
