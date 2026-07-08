import { QueryResult, type QueryRunner } from 'typeorm';
import { AddPurchaseCorrectionLinkage1779000000000 } from './1779000000000-AddPurchaseCorrectionLinkage';

describe('AddPurchaseCorrectionLinkage1779000000000', () => {
  const migration = new AddPurchaseCorrectionLinkage1779000000000();

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

  it('adds nullable append-only correction linkage fields', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);

    const sql = queries.join('\n');

    expect(sql).toContain('ADD COLUMN IF NOT EXISTS document_type varchar');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS correction_reason varchar');
    expect(sql).toContain(
      'ADD COLUMN IF NOT EXISTS correction_for_purchase_document_id varchar',
    );
    expect(sql).toContain('idx_inventory_purchase_documents_correction_origin');
    expect(sql).toContain(
      'idx_inventory_purchase_documents_one_correction_per_origin',
    );
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS');
    expect(sql).toContain(
      'WHERE correction_for_purchase_document_id IS NOT NULL',
    );
  });

  it('preserves correction audit metadata on rollback', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.down(queryRunner);

    expect(queries.join('\n')).not.toContain('DROP COLUMN');
    expect(queries.join('\n')).toContain('SELECT 1');
  });
});
