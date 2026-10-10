import { randomUUID } from 'crypto';
import {
  ConflictException,
  ExecutionContext,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';

import { createMigrationBuiltSchemaFixture } from '../../../../test/support/migration-built-schema.helper';
import {
  ActivationAttempt,
  ActivationAttemptStatus,
} from '../../onboarding/entities/activation-attempt.entity';
import {
  DeviceSyncCredential,
  DeviceSyncCredentialStatus,
} from '../entities/device-sync-credential.entity';
import { DeviceSyncCredentialEvent } from '../entities/device-sync-credential-event.entity';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { type DeviceSyncJwtConfig } from '../config/device-sync-jwt.config';
import { DeviceSyncCredentialService } from './device-sync-credential.service';
import { SyncTransportGuard } from '../guards/sync-transport.guard';
import {
  DEVICE_SYNC_PRINCIPAL_TYPE_CLAIM,
  DEVICE_SYNC_TOKEN_TYPE,
  DeviceSyncJwtClaims,
} from '../security/jwt-token.types';

/**
 * DB-backed proof for device sync credential REVOCATION and the
 * SyncTransportGuard fail-closed contract (issue B17-02, Task 4).
 *
 * Unlike device-sync-credential.service.spec.ts (mocked repositories) and
 * sync-transport.guard.spec.ts (mocked DataSource), this suite drives the REAL
 * DeviceSyncCredentialService.revokeCredential and the REAL SyncTransportGuard
 * against a migration-built scratch schema under the production RLS policies:
 * the service and the guard both run on a non-superuser, non-bypassing runtime
 * role, so tenant isolation and revocation visibility are enforced by
 * PostgreSQL, not by the test's goodwill.
 *
 * Harness: the same createMigrationBuiltSchemaFixture the other service-level
 * db specs use — the full migration set runs into a fresh scratch schema, so
 * the FORCE ROW LEVEL SECURITY policies on device_sync_credentials and
 * device_sync_credential_events are the production ones. Fixtures are built
 * forward only and never cleaned mid-test.
 */

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required for DB-backed service tests`);
  }

  return value;
}

function readPostgresPort(): number {
  const value = process.env.DB_PORT?.trim() ?? '5432';
  const port = Number(value);

  if (!Number.isInteger(port)) {
    throw new Error(
      'DB_PORT must be a valid integer for DB-backed service tests',
    );
  }

  return port;
}

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: readPostgresPort(),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: getRequiredEnv('DB_PASSWORD'),
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

const JWT_CONFIG: DeviceSyncJwtConfig = {
  secret: 'revocation-db-spec-secret-value-at-least-32-characters',
  issuer: 'revocation-db-spec-issuer',
  audience: 'revocation-db-spec-audience',
  accessTokenTtlSeconds: 900,
  renewalTtlSeconds: 900,
  clockToleranceSeconds: 0,
  algorithm: 'HS256',
};

interface SeededCredential {
  readonly credentialId: string;
  readonly attemptId: string;
  readonly canonicalDeviceId: string;
}

interface SeededTenant {
  readonly tenantId: string;
  readonly sessionId: string;
  readonly credential: SeededCredential;
}

describe('DeviceSyncCredentialService revocation + SyncTransportGuard fail-closed (db-backed, real Postgres RLS)', () => {
  const TEST_TIMEOUT_MS = 30000;
  const SETUP_TIMEOUT_MS = 600000;

  let fixture: Awaited<
    ReturnType<typeof createMigrationBuiltSchemaFixture>
  > | null = null;
  let admin: DataSource | null = null;
  let runtime: DataSource | null = null;
  let service: DeviceSyncCredentialService;
  let guard: SyncTransportGuard;
  let jwtService: JwtService;

  let tenantA: SeededTenant;
  let tenantB: SeededTenant;

  /** revocation evidence captured by the first test for later assertions. */
  let revokedAtFirstRevocation: Date | null = null;

  const q = (table: string): string =>
    `"${fixture?.schema ?? 'SCHEMA_NOT_READY'}"."${table}"`;

  const seedTenantWithCredential = async (
    label: string,
    canonicalDeviceId: string,
  ): Promise<SeededTenant> => {
    if (!admin) throw new Error('admin data source not initialized');
    const tenantId = randomUUID();

    // Tenant row. Seeding runs on the superuser admin connection, which
    // bypasses RLS by definition; is_active defaults to true so the guard's
    // tenant-alive check passes for the positive transport case.
    await admin.query(
      `INSERT INTO ${q('tenants')} (id, name, slug) VALUES ($1, $2, $3)`,
      [
        tenantId,
        `dsr-db-spec-tenant-${label}-${tenantId.slice(0, 8)}`,
        `dsr-db-spec-${label}-${tenantId.replace(/-/g, '').slice(0, 20)}`,
      ],
    );

    // One onboarding session per tenant (unique on tenant_id).
    const session = (
      await admin.query(
        `INSERT INTO ${q('onboarding_sessions')} (tenant_id) VALUES ($1) RETURNING id`,
        [tenantId],
      )
    )[0];

    const attempt = (
      await admin.query(
        `INSERT INTO ${q('onboarding_activation_attempts')} (
           tenant_id, onboarding_session_id, candidate_terminal_id,
           trusted_terminal_id, status, started_by_user_id,
           server_time_anchor_at, required_fiscal_revision,
           required_fiscal_fingerprint, verification_product_id,
           verification_product_fingerprint, pos_build
         ) VALUES ($1, $2, $3, $3, $4, 'dsr-db-spec', now(), 0, 'fp', 'prod', 'fp', 'pos-build-1')
         RETURNING id`,
        [tenantId, session.id, canonicalDeviceId, ActivationAttemptStatus.PASS],
      )
    )[0];

    const credential = (
      await admin.query(
        `INSERT INTO ${q('device_sync_credentials')} (
           tenant_id, activation_attempt_id, renewal_secret_hash,
           version, status, expires_at
         ) VALUES ($1, $2, 'dsr-db-spec-hash', 1, $3,
                   now() + interval '1 day')
         RETURNING id`,
        [tenantId, attempt.id, DeviceSyncCredentialStatus.ACTIVE],
      )
    )[0];

    return {
      tenantId,
      sessionId: session.id,
      credential: {
        credentialId: credential.id,
        attemptId: attempt.id,
        canonicalDeviceId,
      },
    };
  };

  const signDeviceToken = async (
    claims: DeviceSyncJwtClaims,
  ): Promise<string> =>
    await jwtService.signAsync(claims, {
      secret: JWT_CONFIG.secret,
      algorithm: JWT_CONFIG.algorithm,
      issuer: JWT_CONFIG.issuer,
      audience: JWT_CONFIG.audience,
      expiresIn: JWT_CONFIG.accessTokenTtlSeconds,
    });

  const createContextWithBearer = (token: string): ExecutionContext => {
    const request = {
      headers: { authorization: `Bearer ${token}` },
      query: {},
      body: {},
    };
    const handler = () => {};
    const targetClass = class {};
    return {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({}),
        getNext: () => ({}),
      }),
      getHandler: () => handler,
      getClass: () => targetClass,
    } as unknown as ExecutionContext;
  };

  beforeAll(async () => {
    fixture = await createMigrationBuiltSchemaFixture();

    // Superuser connection for seeding and direct assertion queries only
    // (bypasses RLS by definition).
    admin = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      extra: { max: 2, allowExitOnIdle: true },
    });
    await admin.initialize();

    // Application runtime role: non-superuser, non-bypassing, non-owner —
    // the migrated FORCE ROW LEVEL SECURITY policies are fully enforced.
    runtime = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      username: fixture.runtimeRoleName,
      password: fixture.runtimeRolePassword,
      schema: fixture.schema,
      entities: [
        DeviceSyncCredential,
        DeviceSyncCredentialEvent,
        ActivationAttempt,
        Tenant,
      ],
    });
    await runtime.initialize();

    // Trivial JWT collaborator for the service: revokeCredential never
    // issues tokens. The guard gets the REAL JwtService.
    const mockJwtService = {
      signAsync: jest.fn().mockResolvedValue('unused-by-revoke-credential'),
    } as unknown as JwtService;

    service = new DeviceSyncCredentialService(
      runtime,
      runtime.getRepository(DeviceSyncCredential),
      runtime.getRepository(DeviceSyncCredentialEvent),
      runtime.getRepository(ActivationAttempt),
      mockJwtService,
      JWT_CONFIG,
    );

    jwtService = new JwtService();
    guard = new SyncTransportGuard(
      jwtService,
      JWT_CONFIG,
      runtime,
      new Reflector(),
    );

    // ---- Fixture build (forward only; append-only tables are never cleaned) ----

    // Tenant A: one ACTIVE credential (version 1) bound to canonical-device-a.
    tenantA = await seedTenantWithCredential('a', 'canonical-device-a');
    // Tenant B: one ACTIVE credential (version 1) bound to canonical-device-b.
    tenantB = await seedTenantWithCredential('b', 'canonical-device-b');
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    if (runtime?.isInitialized) {
      await runtime.destroy();
    }
    if (admin?.isInitialized) {
      await admin.destroy();
    }
    await fixture?.close();
  }, SETUP_TIMEOUT_MS);

  it(
    'revokes a tenant-owned credential for real and appends exactly one REVOKED audit event',
    async () => {
      const result = await service.revokeCredential(
        tenantA.tenantId,
        tenantA.credential.credentialId,
        'Terminal rota por derrame',
      );

      // Returned contract.
      expect(result.status).toBe(DeviceSyncCredentialStatus.REVOKED);
      expect(result.revocationReason).toBe('Terminal rota por derrame');
      expect(result.revokedAt).toBeInstanceOf(Date);
      revokedAtFirstRevocation = result.revokedAt;

      if (!admin) throw new Error('admin data source not initialized');

      // Authoritative DB row: the revocation is persisted, not just echoed.
      const credentialRows = await admin.query(
        `SELECT status, revocation_reason, revoked_at
           FROM ${q('device_sync_credentials')}
          WHERE id = $1`,
        [tenantA.credential.credentialId],
      );
      expect(credentialRows).toHaveLength(1);
      expect(credentialRows[0].status).toBe('REVOKED');
      expect(credentialRows[0].revocation_reason).toBe(
        'Terminal rota por derrame',
      );
      expect(new Date(credentialRows[0].revoked_at as string)).toEqual(
        revokedAtFirstRevocation,
      );

      // Audit trail: exactly one REVOKED event carrying the reason.
      const eventRows = await admin.query(
        `SELECT event_type, credential_id, metadata
           FROM ${q('device_sync_credential_events')}
          WHERE credential_id = $1`,
        [tenantA.credential.credentialId],
      );
      expect(eventRows).toHaveLength(1);
      expect(eventRows[0].event_type).toBe('REVOKED');
      expect(eventRows[0].credential_id).toBe(tenantA.credential.credentialId);
      expect(eventRows[0].metadata).toMatchObject({
        reason: 'Terminal rota por derrame',
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'cannot revoke another tenant credential: RLS hides credB from tenant A (NotFoundException, no mutation, no event)',
    async () => {
      await expect(
        service.revokeCredential(
          tenantA.tenantId,
          tenantB.credential.credentialId,
          'Malicious cross-tenant attempt',
        ),
      ).rejects.toThrow(NotFoundException);

      if (!admin) throw new Error('admin data source not initialized');

      // credB is untouched: still ACTIVE, never revoked, no audit events.
      const credentialRows = await admin.query(
        `SELECT status, revocation_reason, revoked_at
           FROM ${q('device_sync_credentials')}
          WHERE id = $1`,
        [tenantB.credential.credentialId],
      );
      expect(credentialRows).toHaveLength(1);
      expect(credentialRows[0].status).toBe('ACTIVE');
      expect(credentialRows[0].revocation_reason).toBeNull();
      expect(credentialRows[0].revoked_at).toBeNull();

      const eventRows = await admin.query(
        `SELECT id FROM ${q('device_sync_credential_events')}
          WHERE credential_id = $1`,
        [tenantB.credential.credentialId],
      );
      expect(eventRows).toHaveLength(0);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'rejects a duplicate revocation with ConflictException and preserves the original revocation evidence',
    async () => {
      await expect(
        service.revokeCredential(
          tenantA.tenantId,
          tenantA.credential.credentialId,
          'Second attempt',
        ),
      ).rejects.toThrow(new ConflictException('Credential is already revoked'));

      if (!admin) throw new Error('admin data source not initialized');

      // Original revocation reason and timestamp survive the duplicate attempt.
      const credentialRows = await admin.query(
        `SELECT status, revocation_reason, revoked_at
           FROM ${q('device_sync_credentials')}
          WHERE id = $1`,
        [tenantA.credential.credentialId],
      );
      expect(credentialRows).toHaveLength(1);
      expect(credentialRows[0].status).toBe('REVOKED');
      expect(credentialRows[0].revocation_reason).toBe(
        'Terminal rota por derrame',
      );
      expect(new Date(credentialRows[0].revoked_at as string)).toEqual(
        revokedAtFirstRevocation,
      );

      // Still exactly one REVOKED audit event — duplicates never append.
      const eventRows = await admin.query(
        `SELECT id FROM ${q('device_sync_credential_events')}
          WHERE credential_id = $1 AND event_type = 'REVOKED'`,
        [tenantA.credential.credentialId],
      );
      expect(eventRows).toHaveLength(1);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'SyncTransportGuard fails closed on a revoked credential: a validly signed token for credA is rejected',
    async () => {
      // Cryptographically valid token for the now-REVOKED credA: correct
      // secret, issuer, audience, claims contract. Only the DB state has
      // changed — the guard must consult the authoritative row and refuse.
      const claimsA: DeviceSyncJwtClaims = {
        sub: tenantA.credential.credentialId,
        principal_type: DEVICE_SYNC_PRINCIPAL_TYPE_CLAIM,
        token_type: DEVICE_SYNC_TOKEN_TYPE,
        tenant_id: tenantA.tenantId,
        device_id: tenantA.credential.canonicalDeviceId,
        scopes: ['sync:push', 'sync:pull'],
        credential_version: 1,
        jti: randomUUID(),
      };
      const tokenA = await signDeviceToken(claimsA);
      const ctxA = createContextWithBearer(tokenA);

      await expect(guard.canActivate(ctxA)).rejects.toThrow(
        UnauthorizedException,
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'SyncTransportGuard still admits a valid token for the ACTIVE credB under real RLS',
    async () => {
      const claimsB: DeviceSyncJwtClaims = {
        sub: tenantB.credential.credentialId,
        principal_type: DEVICE_SYNC_PRINCIPAL_TYPE_CLAIM,
        token_type: DEVICE_SYNC_TOKEN_TYPE,
        tenant_id: tenantB.tenantId,
        device_id: tenantB.credential.canonicalDeviceId,
        scopes: ['sync:push', 'sync:pull'],
        credential_version: 1,
        jti: randomUUID(),
      };
      const tokenB = await signDeviceToken(claimsB);
      const ctxB = createContextWithBearer(tokenB);

      await expect(guard.canActivate(ctxB)).resolves.toBe(true);
    },
    TEST_TIMEOUT_MS,
  );
});
