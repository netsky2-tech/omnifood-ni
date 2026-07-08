import { QueryResult, type QueryRunner } from 'typeorm';
import { AddPurchaseFiscalAuthorizationCode1778000000000 } from './1778000000000-AddPurchaseFiscalAuthorizationCode';

describe('AddPurchaseFiscalAuthorizationCode1778000000000', () => {
  const migration = new AddPurchaseFiscalAuthorizationCode1778000000000();

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

  it('adds a nullable fiscal authorization code to purchase documents', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);

    expect(queries.join('\n')).toContain(
      'ADD COLUMN IF NOT EXISTS fiscal_authorization_code varchar',
    );
  });

  it('preserves the fiscal authorization code column on rollback', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.down(queryRunner);

    expect(queries.join('\n')).not.toContain('DROP COLUMN');
    expect(queries.join('\n')).toContain('SELECT 1');
  });
});
