import { AddJwtSessionState1783000000000 } from './1783000000000-AddJwtSessionState';

describe('AddJwtSessionState1783000000000', () => {
  it('adds deploy-safe user session state with a positive security version default', async () => {
    const statements: string[] = [];
    const query = jest.fn((statement: string) => {
      statements.push(statement);
      return Promise.resolve();
    });
    const migration = new AddJwtSessionState1783000000000();

    await migration.up({ query } as never);

    expect(statements).toEqual([
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS security_version integer NOT NULL DEFAULT 1',
      'ALTER TABLE users ADD CONSTRAINT chk_users_security_version_positive CHECK (security_version > 0)',
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS refresh_token_family_id uuid NULL',
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS refresh_token_revoked_at timestamptz NULL',
    ]);
  });

  it('removes only the additive state in reverse dependency order', async () => {
    const statements: string[] = [];
    const query = jest.fn((statement: string) => {
      statements.push(statement);
      return Promise.resolve();
    });
    const migration = new AddJwtSessionState1783000000000();

    await migration.down({ query } as never);

    expect(statements).toEqual([
      'ALTER TABLE users DROP COLUMN IF EXISTS refresh_token_revoked_at',
      'ALTER TABLE users DROP COLUMN IF EXISTS refresh_token_family_id',
      'ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_security_version_positive',
      'ALTER TABLE users DROP COLUMN IF EXISTS security_version',
    ]);
  });
});
