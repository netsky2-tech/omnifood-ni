import { randomUUID } from 'crypto';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { AddJwtSessionState1783000000000 } from '../../../migrations/1783000000000-AddJwtSessionState';
import { Tenant } from '../../tenant/entities/tenant.entity';
import type { IdentityJwtConfig } from '../config/identity-jwt.config';
import { User } from '../entities/user.entity';
import { SecurityProfile } from '../entities/security-profile.entity';
import { JWT_TOKEN_TYPES } from '../security/jwt-token.types';
import {
  compareRefreshTokenVerifier,
  digestRefreshToken,
  hashRefreshTokenVerifier,
} from '../security/refresh-token-verifier';
import { AuthService } from './auth.service';

interface RefreshHarness {
  first: () => Promise<unknown>;
  second: () => Promise<unknown>;
  readSession: () => Promise<RefreshSession>;
  otherToken: string;
  token: string;
  restart: () => Promise<void>;
  destroy: () => Promise<void>;
}

interface RefreshSession {
  hashed_refresh_token: string | null;
  refresh_token_family_id: string | null;
  refresh_token_revoked_at: Date | null;
}

const jwtConfig: IdentityJwtConfig = {
  secret: 'test-only-jwt-secret-with-at-least-thirty-two-bytes',
  issuer: 'omnifood-admin-test',
  audience: 'omnifood-pos-test',
  accessTokenTtlSeconds: 3600,
  refreshTokenTtlSeconds: 604800,
  clockToleranceSeconds: 5,
  algorithm: 'HS256',
};

const postgresConnection = {
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? '5432'),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'admin',
  database: process.env.DB_DATABASE ?? 'omnifood',
};

const isGenericRefreshRejection = (result: PromiseSettledResult<unknown>) =>
  result.status === 'rejected' &&
  result.reason instanceof UnauthorizedException &&
  result.reason.message === 'Acceso denegado';

async function createRefreshHarness(withJti = false): Promise<RefreshHarness> {
  const schema = `jwt_refresh_${randomUUID().replace(/-/g, '')}`;
  const bootstrap = new DataSource({ type: 'postgres', ...postgresConnection });
  const jwt = new JwtService({ secret: jwtConfig.secret });
  const userId = randomUUID();
  const familyId = randomUUID();
  const token = await jwt.signAsync(
    {
      sub: userId,
      token_type: JWT_TOKEN_TYPES.REFRESH,
      refresh_token_family_id: familyId,
    },
    {
      secret: jwtConfig.secret,
      issuer: jwtConfig.issuer,
      audience: jwtConfig.audience,
      ...(withJti ? { jwtid: randomUUID() } : {}),
    },
  );
  const otherToken = await jwt.signAsync(
    {
      sub: userId,
      token_type: JWT_TOKEN_TYPES.REFRESH,
      refresh_token_family_id: familyId,
    },
    {
      secret: jwtConfig.secret,
      issuer: jwtConfig.issuer,
      audience: jwtConfig.audience,
      jwtid: randomUUID(),
    },
  );
  let clients: DataSource[] = [];
  const createClient = async () => {
    const dataSource = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      schema,
      entities: [User, Tenant, SecurityProfile],
      extra: { max: 1 },
    });
    await dataSource.initialize();
    clients.push(dataSource);
    return new AuthService(
      dataSource.getRepository(User),
      jwt,
      dataSource,
      jwtConfig,
    );
  };
  try {
    await bootstrap.initialize();
    await bootstrap.query(`CREATE SCHEMA "${schema}"`);
    await bootstrap.query(`CREATE TABLE "${schema}".users (
      id uuid PRIMARY KEY, email text NOT NULL, tenant_id text NOT NULL, role text NOT NULL,
      is_active boolean NOT NULL, hashed_refresh_token text, created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    )`);
    const migrationRunner = bootstrap.createQueryRunner();
    await migrationRunner.connect();
    await migrationRunner.query(`SET search_path TO "${schema}"`);
    await new AddJwtSessionState1783000000000().up(migrationRunner);
    await migrationRunner.release();
    await bootstrap.query(
      `INSERT INTO "${schema}".users (id, email, tenant_id, role, is_active, hashed_refresh_token, refresh_token_family_id)
       VALUES ($1, 'refresh@omnifood.ni', 'tenant-1', 'MANAGER', true, $2, $3)`,
      [userId, await hashRefreshTokenVerifier(token), familyId],
    );
    let firstService = await createClient();
    let secondService = await createClient();
    return {
      first: () => firstService.refreshTokens(userId, token),
      second: () => secondService.refreshTokens(userId, token),
      otherToken,
      readSession: async () => {
        const rows: unknown = await clients[0].query(
          `SELECT hashed_refresh_token, refresh_token_family_id, refresh_token_revoked_at FROM "${schema}".users WHERE id = $1`,
          [userId],
        );
        if (!Array.isArray(rows) || rows.length !== 1) {
          throw new Error('Expected one refresh session row');
        }
        return rows[0] as RefreshSession;
      },
      restart: async () => {
        await Promise.all(clients.map((client) => client.destroy()));
        clients = [];
        firstService = await createClient();
        secondService = await createClient();
      },
      token,
      destroy: async () => {
        await Promise.all(clients.map((client) => client.destroy()));
        await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await bootstrap.destroy();
      },
    };
  } catch (error) {
    await Promise.all(clients.map((client) => client.destroy()));
    if (bootstrap.isInitialized) {
      await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await bootstrap.destroy();
    }
    throw error;
  }
}

describe('AuthService refresh persistence (db)', () => {
  it('allows one concurrent client and commits fail-secure revocation for the loser', async () => {
    const harness = await createRefreshHarness();
    try {
      const seeded = await harness.readSession();
      expect(harness.token.slice(0, 72)).toBe(harness.otherToken.slice(0, 72));
      expect(digestRefreshToken(harness.token)).not.toBe(
        digestRefreshToken(harness.otherToken),
      );
      expect(
        await compareRefreshTokenVerifier(
          harness.token,
          seeded.hashed_refresh_token ?? '',
        ),
      ).toBe(true);
      expect(
        await compareRefreshTokenVerifier(
          harness.otherToken,
          seeded.hashed_refresh_token ?? '',
        ),
      ).toBe(false);
      const [first, second] = await Promise.allSettled([
        harness.first(),
        harness.second(),
      ]);
      if (first.status === 'rejected' && second.status === 'rejected') {
        throw first.reason;
      }
      expect(
        [first, second].filter(({ status }) => status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        [first, second].filter(({ status }) => status === 'rejected'),
      ).toHaveLength(1);
      expect([first, second].find(isGenericRefreshRejection)).toBeDefined();
      const revoked = await harness.readSession();
      expect(revoked).toMatchObject({
        hashed_refresh_token: null,
        refresh_token_family_id: null,
      });
      expect(revoked.refresh_token_revoked_at).toBeInstanceOf(Date);
      await harness.restart();
      const afterRestart = await harness.readSession();
      expect(afterRestart).toMatchObject({
        hashed_refresh_token: null,
        refresh_token_family_id: null,
      });
      expect(afterRestart.refresh_token_revoked_at).toBeInstanceOf(Date);
    } finally {
      await harness.destroy();
    }
  });

  it('keeps modern JTI refresh rotation single-winner after reconnect', async () => {
    const harness = await createRefreshHarness(true);
    try {
      const results = await Promise.allSettled([
        harness.first(),
        harness.second(),
      ]);
      expect(
        results.filter(({ status }) => status === 'fulfilled'),
      ).toHaveLength(1);
      expect(results.find(isGenericRefreshRejection)).toBeDefined();
      expect(
        results.filter(({ status }) => status === 'rejected'),
      ).toHaveLength(1);
      expect(await harness.readSession()).toMatchObject({
        hashed_refresh_token: null,
        refresh_token_family_id: null,
      });
      await harness.restart();
      expect(await harness.readSession()).toMatchObject({
        hashed_refresh_token: null,
        refresh_token_family_id: null,
      });
    } finally {
      await harness.destroy();
    }
  });
});
