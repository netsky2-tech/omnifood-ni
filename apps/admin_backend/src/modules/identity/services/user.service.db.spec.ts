import { randomUUID } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { AuditLog } from '../entities/audit-log.entity';
import { SecurityProfile } from '../entities/security-profile.entity';
import { User, UserRole } from '../entities/user.entity';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { UserService } from './user.service';
import { AuthService } from './auth.service';
import type { IdentityJwtConfig } from '../config/identity-jwt.config';

const connection = {
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? '5432'),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'admin',
  database: process.env.DB_DATABASE ?? 'omnifood',
};

const jwtConfig: IdentityJwtConfig = {
  secret: 'test-only-jwt-secret-with-at-least-thirty-two-bytes',
  issuer: 'omnifood-admin-test',
  audience: 'omnifood-pos-test',
  accessTokenTtlSeconds: 3600,
  refreshTokenTtlSeconds: 604800,
  clockToleranceSeconds: 5,
  algorithm: 'HS256',
};

interface PersistedSession {
  security_version: number;
  hashed_refresh_token: null;
  refresh_token_family_id: null;
  refresh_token_revoked_at: Date | null;
}

async function createClient(schema: string): Promise<DataSource> {
  const dataSource = new DataSource({
    type: 'postgres',
    ...connection,
    schema,
    entities: [User, AuditLog, SecurityProfile, Tenant],
    extra: { max: 1 },
  });
  await dataSource.initialize();
  return dataSource;
}

function createService(dataSource: DataSource): UserService {
  const authService = new AuthService(
    dataSource.getRepository(User),
    new JwtService(),
    dataSource,
    jwtConfig,
  );
  return new UserService(
    dataSource.getRepository(User),
    dataSource.getRepository(AuditLog),
    dataSource.getRepository(SecurityProfile),
    dataSource,
    authService,
  );
}

describe('UserService atomic mutations (db)', () => {
  it('serializes concurrent sensitive changes and persists one revocation boundary', async () => {
    const schema = `jwt_mutation_${randomUUID().replace(/-/g, '')}`;
    const bootstrap = new DataSource({ type: 'postgres', ...connection });
    const userId = randomUUID();
    let first: DataSource | undefined;
    let second: DataSource | undefined;
    try {
      await bootstrap.initialize();
      await bootstrap.query(`CREATE SCHEMA "${schema}"`);
      await bootstrap.query(`CREATE TABLE "${schema}".users (
        id uuid PRIMARY KEY, tenant_id text NOT NULL, name text NOT NULL, email text, password_hash text, role text NOT NULL, is_active boolean NOT NULL DEFAULT true,
        hashed_refresh_token text, security_version integer NOT NULL DEFAULT 1,
        refresh_token_family_id uuid, refresh_token_revoked_at timestamptz,
        created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now())`);
      await bootstrap.query(`CREATE TABLE "${schema}".audit_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text, user_id text,
        action text, target_type text, target_id text, device_id text, timestamp timestamptz,
        metadata jsonb, sequence_no integer DEFAULT 1, prev_hash text DEFAULT 'GENESIS',
        entry_hash text DEFAULT 'test', metodo_autorizacion text,
        usuario_autorizador_id text, forensic_status text DEFAULT 'ACTIVE')`);
      await bootstrap.query(
        `INSERT INTO "${schema}".users (id, tenant_id, name, email, role, hashed_refresh_token, refresh_token_family_id)
         VALUES ($1, 'tenant-1', 'Cashier', 'cashier@omnifood.ni', 'CASHIER', 'verifier', $2)`,
        [userId, randomUUID()],
      );
      first = await createClient(schema);
      second = await createClient(schema);
      await Promise.all([
        createService(first).update(
          userId,
          { role: UserRole.MANAGER },
          'tenant-1',
          'admin-1',
        ),
        createService(second).update(
          userId,
          { password: 'Password123!' },
          'tenant-1',
          'admin-1',
        ),
      ]);
      const rows = (await first.query(
        `SELECT security_version, hashed_refresh_token, refresh_token_family_id, refresh_token_revoked_at FROM "${schema}".users WHERE id = $1`,
        [userId],
      )) as unknown;
      expect(rows).toEqual([
        expect.objectContaining({
          security_version: 3,
          hashed_refresh_token: null,
          refresh_token_family_id: null,
        }),
      ]);
      const sessionRows = rows as Array<{
        refresh_token_revoked_at: Date | null;
      }>;
      expect(sessionRows[0].refresh_token_revoked_at).toBeInstanceOf(Date);
      await first.destroy();
      first = await createClient(schema);
      const persisted = await first.query<PersistedSession[]>(
        `SELECT security_version, hashed_refresh_token, refresh_token_family_id, refresh_token_revoked_at FROM "${schema}".users WHERE id = $1`,
        [userId],
      );
      expect(persisted[0]).toMatchObject({
        security_version: 3,
        hashed_refresh_token: null,
        refresh_token_family_id: null,
      });
      expect(persisted[0].refresh_token_revoked_at).toBeInstanceOf(Date);
    } finally {
      await Promise.all([first?.destroy(), second?.destroy()]);
      if (bootstrap.isInitialized) {
        await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await bootstrap.destroy();
      }
    }
  });
});
