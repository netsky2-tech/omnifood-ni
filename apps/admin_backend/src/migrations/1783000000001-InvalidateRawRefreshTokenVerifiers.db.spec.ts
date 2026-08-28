import { DataSource } from 'typeorm';
import { InvalidateRawRefreshTokenVerifiers1783000000001 } from './1783000000001-InvalidateRawRefreshTokenVerifiers';
const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for DB-backed migration tests`);
  }
  return value;
};
describe('InvalidateRawRefreshTokenVerifiers1783000000001 (db)', () => {
  it('invalidates raw refresh state without changing identity or access state', async () => {
    const dataSource = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
      port: Number(process.env.DB_PORT?.trim() ?? '5432'),
      username: process.env.DB_USERNAME?.trim() ?? 'postgres',
      password: required('DB_PASSWORD'),
      database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
    });
    const schema = `jwt_verifier_${Date.now()}`;
    await dataSource.initialize();
    const runner = dataSource.createQueryRunner();
    try {
      await runner.query(`CREATE SCHEMA "${schema}"`);
      await runner.query(`SET search_path TO "${schema}"`);
      await runner.query(
        `CREATE TABLE users (id uuid PRIMARY KEY, email text, tenant_id text, role text, is_active boolean, password_hash text, security_version integer, hashed_refresh_token text, refresh_token_family_id uuid, refresh_token_revoked_at timestamptz)`,
      );
      await runner.query(
        `INSERT INTO users VALUES ('00000000-0000-0000-0000-000000000001', 'user@omnifood.ni', 'tenant-1', 'manager', true, 'password-hash', 7, 'raw-bcrypt', '00000000-0000-0000-0000-000000000002', NULL)`,
      );
      await new InvalidateRawRefreshTokenVerifiers1783000000001().up(runner);
      await expect(
        runner.query(
          'SELECT email, tenant_id, role, is_active, password_hash, security_version, hashed_refresh_token, refresh_token_family_id, refresh_token_revoked_at FROM users',
        ),
      ).resolves.toEqual([
        {
          email: 'user@omnifood.ni',
          tenant_id: 'tenant-1',
          role: 'manager',
          is_active: true,
          password_hash: 'password-hash',
          security_version: 7,
          hashed_refresh_token: null,
          refresh_token_family_id: null,
          refresh_token_revoked_at: null,
        },
      ]);
    } finally {
      await runner.query('SET search_path TO public').catch(() => undefined);
      await runner
        .query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
        .catch(() => undefined);
      await runner.release().catch(() => undefined);
      await dataSource.destroy();
    }
  }, 30000);
});
