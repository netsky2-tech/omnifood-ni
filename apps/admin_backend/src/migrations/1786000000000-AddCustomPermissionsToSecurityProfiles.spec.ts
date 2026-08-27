import { QueryResult, type QueryRunner } from 'typeorm';
import { AddCustomPermissionsToSecurityProfiles1786000000000 } from './1786000000000-AddCustomPermissionsToSecurityProfiles';

describe('AddCustomPermissionsToSecurityProfiles1786000000000', () => {
  const migration = new AddCustomPermissionsToSecurityProfiles1786000000000();

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

  it('adds custom_permissions column with empty array default on up', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);

    const sql = queries.join('\n');

    expect(sql).toContain('ALTER TABLE security_profiles');
    expect(sql).toContain(
      "ADD COLUMN IF NOT EXISTS custom_permissions text[] NOT NULL DEFAULT '{}'",
    );
  });

  it('drops custom_permissions column on down', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.down(queryRunner);

    const sql = queries.join('\n');

    expect(sql).toContain('ALTER TABLE security_profiles');
    expect(sql).toContain('DROP COLUMN IF EXISTS custom_permissions');
  });
});
