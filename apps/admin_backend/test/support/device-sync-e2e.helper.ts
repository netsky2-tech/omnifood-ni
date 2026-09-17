import { INestApplicationContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { DataSource, QueryRunner } from 'typeorm';
import {
  DEFAULT_DEVICE_SYNC_RENEWAL_TTL_SECONDS,
  DEVICE_SYNC_JWT_CONFIG,
  type DeviceSyncJwtConfig,
} from '../../src/modules/identity/config/device-sync-jwt.config';
import {
  DEVICE_SYNC_V1_SCOPES,
  DeviceSyncCredentialStatus,
  type DeviceSyncScope,
} from '../../src/modules/identity/entities/device-sync-credential.entity';
import {
  DEVICE_SYNC_PRINCIPAL_TYPE_CLAIM,
  DEVICE_SYNC_TOKEN_TYPE,
  type DeviceSyncJwtClaims,
} from '../../src/modules/identity/security/jwt-token.types';

/**
 * E2E support for the device-only `/v1/sync` transport (SyncTransportGuard).
 *
 * The guard authenticates a device JWT against an ACTIVE `DeviceSyncCredential`
 * whose `ActivationAttempt.trustedTerminalId` is the canonical device id, so a
 * suite must provision both rows before any `/v1/sync/*` request can succeed.
 *
 * Cleanup is intentionally NOT hidden: `provisionDeviceSyncCredential` returns
 * the created row ids and the suite deletes them in its existing teardown
 * (credentials before attempts; both inside a transaction that sets the
 * `app.tenant_id` RLS context, because `device_sync_credentials` is created
 * with FORCED row level security).
 */

export interface DeviceSyncE2EProvisionOptions {
  readonly tenantId: string;
  readonly deviceId: string;
  readonly scopes?: readonly DeviceSyncScope[];
  readonly credentialVersion?: number;
  readonly credentialExpiresAt?: Date;
}

export interface ProvisionedDeviceSyncCredential {
  /** Canonical device id: use it for record sourceDeviceId/terminalId. */
  readonly deviceId: string;
  readonly tenantId: string;
  /** device_sync_credentials.id — the JWT `sub` claim. */
  readonly credentialId: string;
  /** onboarding_activation_attempts.id — delete before the credential row. */
  readonly activationAttemptId: string;
  readonly credentialVersion: number;
  readonly scopes: readonly DeviceSyncScope[];
  readonly credentialExpiresAt: Date;
}

export interface DeviceSyncE2ESignOptions {
  /** Defaults to the scopes granted on the provisioned credential. */
  readonly scopes?: readonly DeviceSyncScope[];
  /** Defaults to a random jti per token. */
  readonly jti?: string;
}

const assertDeviceSyncScopes = (
  scopes: readonly DeviceSyncScope[],
): readonly DeviceSyncScope[] => {
  if (scopes.length === 0) {
    throw new Error('Device sync e2e helper requires at least one scope');
  }
  const allowedScopes = new Set<string>(DEVICE_SYNC_V1_SCOPES);
  const invalidScopes = scopes.filter((scope) => !allowedScopes.has(scope));
  if (invalidScopes.length > 0) {
    throw new Error(
      `Device sync e2e helper received scopes outside the V1 allowlist: ${invalidScopes.join(', ')}`,
    );
  }
  return scopes;
};

/**
 * Creates the device sync tables if the test database does not have them yet
 * (same convention as `ensurePublicAuthTables`). Mirrors the production
 * migration DDL without its RLS policies so fresh CI databases can insert;
 * databases migrated by the app keep their own RLS untouched.
 */
export const ensurePublicDeviceSyncTables = async (
  runner: QueryRunner,
): Promise<void> => {
  await runner.query(`
    CREATE TABLE IF NOT EXISTS public.onboarding_activation_attempts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id varchar(128) NOT NULL,
      onboarding_session_id uuid NOT NULL,
      candidate_terminal_id varchar(128) NOT NULL,
      trusted_terminal_id varchar(128),
      status varchar(64) NOT NULL DEFAULT 'CREATED',
      started_by_user_id varchar(128) NOT NULL,
      started_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz,
      server_time_anchor_at timestamptz NOT NULL,
      required_fiscal_revision int NOT NULL,
      required_fiscal_fingerprint varchar(64) NOT NULL,
      verification_product_id varchar(128) NOT NULL,
      verification_product_revision int NOT NULL DEFAULT 1,
      verification_product_fingerprint varchar(64) NOT NULL,
      verification_ticket_id varchar(128),
      pos_build varchar(128),
      warnings_count int NOT NULL DEFAULT 0,
      failure_code varchar(128),
      idempotency_key varchar(256),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.device_sync_credentials (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id varchar(128) NOT NULL,
      activation_attempt_id uuid NOT NULL,
      renewal_secret_hash varchar(255) NOT NULL,
      scopes jsonb NOT NULL DEFAULT '["sync:push", "sync:pull"]'::jsonb,
      version int NOT NULL DEFAULT 1,
      status varchar(64) NOT NULL DEFAULT 'PENDING',
      expires_at timestamptz NOT NULL,
      issued_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      rotated_at timestamptz,
      revoked_at timestamptz,
      revocation_reason varchar(255),
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_device_sync_credentials_activation_attempt
        FOREIGN KEY (activation_attempt_id)
        REFERENCES public.onboarding_activation_attempts(id)
        ON DELETE RESTRICT
    );
  `);
};

/**
 * Inserts a PASS `ActivationAttempt` plus its ACTIVE `DeviceSyncCredential`
 * bound to `deviceId`. Inserts run inside one transaction that sets the
 * `app.tenant_id` RLS context — the same contract SyncTransportGuard uses to
 * read the credential back.
 */
export const provisionDeviceSyncCredential = async (
  dataSource: DataSource,
  options: DeviceSyncE2EProvisionOptions,
): Promise<ProvisionedDeviceSyncCredential> => {
  const tenantId = options.tenantId.trim();
  const deviceId = options.deviceId.trim();
  if (tenantId.length === 0) {
    throw new Error('Device sync e2e helper requires a non-empty tenantId');
  }
  if (deviceId.length === 0) {
    throw new Error('Device sync e2e helper requires a non-empty deviceId');
  }

  const scopes = assertDeviceSyncScopes(
    options.scopes ?? DEVICE_SYNC_V1_SCOPES,
  );
  const credentialVersion = options.credentialVersion ?? 1;
  const credentialExpiresAt =
    options.credentialExpiresAt ??
    new Date(Date.now() + DEFAULT_DEVICE_SYNC_RENEWAL_TTL_SECONDS * 1000);

  const ensureRunner = dataSource.createQueryRunner();
  try {
    await ensureRunner.connect();
    await ensurePublicDeviceSyncTables(ensureRunner);
  } finally {
    await ensureRunner.release();
  }

  // Raw parameterized inserts instead of repositories: this helper must not depend
  // on which entities each e2e spec happens to register on its own DataSource.
  // SyncTransportGuard reads both tables back inside a transaction that sets the
  // same `app.tenant_id` RLS context used here.
  const { activationAttemptId, credentialId } = await dataSource.transaction(
    async (
      manager,
    ): Promise<{ activationAttemptId: string; credentialId: string }> => {
      await manager.query("SELECT set_config('app.tenant_id', $1, true)", [
        tenantId,
      ]);

      const activationAttemptId = randomUUID();
      await manager.query(
        `INSERT INTO onboarding_activation_attempts (
           id, tenant_id, onboarding_session_id, candidate_terminal_id,
           trusted_terminal_id, status, started_by_user_id, started_at,
           completed_at, server_time_anchor_at, required_fiscal_revision,
           required_fiscal_fingerprint, verification_product_id,
           verification_product_revision, verification_product_fingerprint,
           warnings_count
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now(), now(), $8, $9, $10, 1, $11, 0)`,
        [
          activationAttemptId,
          tenantId,
          randomUUID(),
          deviceId,
          deviceId,
          'PASS',
          'e2e-device-sync-helper',
          1,
          randomUUID().replace(/-/g, ''),
          'e2e-device-sync-verification-product',
          randomUUID().replace(/-/g, ''),
        ],
      );

      const credentialId = randomUUID();
      await manager.query(
        `INSERT INTO device_sync_credentials (
           id, tenant_id, activation_attempt_id, renewal_secret_hash, scopes,
           version, status, expires_at, issued_at
         ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, now())`,
        [
          credentialId,
          tenantId,
          activationAttemptId,
          `${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '')}`,
          JSON.stringify(scopes),
          credentialVersion,
          DeviceSyncCredentialStatus.ACTIVE,
          credentialExpiresAt,
        ],
      );

      return { activationAttemptId, credentialId };
    },
  );

  return {
    deviceId,
    tenantId,
    credentialId,
    activationAttemptId,
    credentialVersion,
    scopes,
    credentialExpiresAt,
  };
};

/**
 * Mints a device access token using the SAME `DEVICE_SYNC_JWT_CONFIG` the
 * bootstrapped Nest app runs with (read from the app container; the secret is
 * never duplicated in test code). Claims: sub, principal_type, token_type,
 * tenant_id, device_id, scopes, credential_version, jti + iss/aud/iat/exp.
 */
export const signDeviceSyncAccessToken = (
  app: INestApplicationContext,
  provisioned: ProvisionedDeviceSyncCredential,
  options: DeviceSyncE2ESignOptions = {},
): string => {
  const jwtConfig = app.get<DeviceSyncJwtConfig>(DEVICE_SYNC_JWT_CONFIG, {
    strict: false,
  });
  const jwtService = app.get<JwtService>(JwtService, { strict: false });

  if (options.scopes !== undefined) {
    assertDeviceSyncScopes(options.scopes);
    const unauthorizedScopes = options.scopes.filter(
      (scope) => !provisioned.scopes.includes(scope),
    );
    if (unauthorizedScopes.length > 0) {
      throw new Error(
        `Device sync e2e helper cannot grant scopes the credential does not hold: ${unauthorizedScopes.join(', ')}`,
      );
    }
  }

  const claims: DeviceSyncJwtClaims = {
    sub: provisioned.credentialId,
    principal_type: DEVICE_SYNC_PRINCIPAL_TYPE_CLAIM,
    token_type: DEVICE_SYNC_TOKEN_TYPE,
    tenant_id: provisioned.tenantId,
    device_id: provisioned.deviceId,
    scopes: [...(options.scopes ?? provisioned.scopes)],
    credential_version: provisioned.credentialVersion,
    jti: options.jti ?? randomUUID(),
  };

  return jwtService.sign(claims, {
    secret: jwtConfig.secret,
    algorithm: jwtConfig.algorithm,
    issuer: jwtConfig.issuer,
    audience: jwtConfig.audience,
    expiresIn: jwtConfig.accessTokenTtlSeconds,
  });
};
