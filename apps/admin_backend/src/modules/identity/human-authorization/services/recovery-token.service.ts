import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomBytes, randomUUID } from 'crypto';
import type { EntityManager } from 'typeorm';
import { OHAC_ERROR_CODE, type OhacErrorCode } from '../contracts/error-codes';
import { OhacTenantTransaction } from '../rls/ohac-tenant-transaction';
import {
  getHumanAuthorizationRecoveryPepperConfig,
  type HumanAuthorizationRecoveryPepperConfig,
} from '../../config/human-authorization-pepper.config';
import {
  HumanAuthorizationMetricsService,
  OHAC_RECOVERY_LIFECYCLE,
} from './human-authorization-metrics.service';

/**
 * Recovery-token lifecycle (design §9).
 *
 * Plaintext format is `ohr1.<tokenId>.<256-bit-secret>`; only the token ID
 * plus HMAC-SHA-256(secret, deployment pepper) is stored — never the raw
 * secret. Expiry is server-issued-at + exactly 15 minutes. Redemption is
 * single-use, tenant/terminal-bound, idempotent on (principal, idempotency
 * key, request hash), and appends immutable lifecycle events that carry IDs,
 * reason codes, and correlation — never plaintext, hash, or verifier.
 */

export const RECOVERY_TOKEN_TTL_MS = 15 * 60 * 1000;

const TOKEN_FORMAT =
  /^ohr1\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[A-Za-z0-9_-]{43}$/;

export const issueRecoveryToken = (pepper: string) => {
  const tokenId = randomUUID();
  const secret = randomBytes(32).toString('base64url');
  return {
    tokenId,
    secret,
    secretHmac: recoverySecretHmac(secret, pepper),
  };
};

export const recoverySecretHmac = (secret: string, pepper: string): string =>
  createHmac('sha256', pepper).update(secret).digest('hex');

export const redemptionRequestHash = (parts: {
  credentialId: string;
  terminalId: string;
  posBuild: string;
  policySchema: string;
  assertionSchema: string;
}): string =>
  createHash('sha256')
    .update(
      `${parts.credentialId}|${parts.terminalId}|${parts.posBuild}|${parts.policySchema}|${parts.assertionSchema}`,
    )
    .digest('hex');

export interface IssueRecoveryTokenInput {
  readonly tenantId: string;
  readonly terminalId: string;
  readonly issuedByUserId: string;
  readonly reason: string;
  readonly correlationId?: string;
}

export interface RecoveryTokenIssued {
  readonly tokenId: string;
  /** Shown exactly once (design §9); never retrievable again. */
  readonly token: string;
  readonly expiresAt: Date;
}

export interface RedeemRecoveryTokenInput {
  readonly tenantId: string;
  readonly terminalId: string;
  readonly credentialId: string;
  readonly token: string;
  readonly idempotencyKey: string;
  readonly posBuild: string;
  readonly policySchema: string;
  readonly assertionSchema: string;
  /** The local integrity classification the POS reports on redemption. */
  readonly integrityClassification?: string;
  /** The deployment's backend build for the cohort/build pair check. */
  readonly backendBuild: string;
  readonly correlationId?: string;
}

export interface RecoveryRedemptionReceipt {
  readonly tokenId: string;
  readonly terminalId: string;
  readonly redeemedAt: Date;
}

export type RecoveryRedeemOutcome =
  | { readonly status: 'redeemed'; readonly receipt: RecoveryRedemptionReceipt }
  | { readonly status: 'replayed'; readonly receipt: RecoveryRedemptionReceipt }
  | { readonly status: 'rejected'; readonly resultCode: OhacErrorCode };

export interface RevokeRecoveryTokenInput {
  readonly tenantId: string;
  readonly tokenId: string;
  readonly revokedByUserId: string;
  readonly reason: string;
  readonly correlationId?: string;
}

export type RecoveryRevokeOutcome =
  | { readonly status: 'revoked'; readonly tokenId: string }
  | { readonly status: 'already-revoked'; readonly tokenId: string }
  | { readonly status: 'not-found'; readonly tokenId: string }
  | {
      readonly status: 'rejected';
      readonly resultCode: OhacErrorCode;
      readonly tokenId: string;
    };

interface TokenRow {
  readonly token_id: string;
  readonly terminal_id: string;
  readonly status: string;
  readonly expires_at: Date;
  readonly idempotency_key: string | null;
  readonly redemption_request_hash: string | null;
  readonly redeemed_at: Date | null;
}

const EXPIRY_GRACE_MS = 0;

/**
 * The recovery services, per design §9: issuance by an active same-tenant
 * OWNER/MANAGER for an enrolled same-tenant terminal, redemption by the
 * active DeviceSyncPrincipal the transport guard attached, and idempotent
 * revocation — all inside the tenant-bound RLS transaction seam.
 */
@Injectable()
export class RecoveryTokenService {
  private cachedPepper?: HumanAuthorizationRecoveryPepperConfig;

  constructor(
    private readonly transaction: OhacTenantTransaction,
    /**
     * The pepper resolves lazily through the validated factory (fail-fast is
     * enforced at startup by HumanAuthorizationPepperStartupGuard; module
     * compilation never reads deployment secrets, so dormant-module harnesses
     * can build this service without environment material).
     */
    @Inject(ConfigService)
    private readonly configService: ConfigService,
    @Optional()
    @Inject(HumanAuthorizationMetricsService)
    private readonly metrics?: HumanAuthorizationMetricsService,
  ) {}

  /** Validated once per process; every later use reuses the cached pepper. */
  private get pepper(): string {
    this.cachedPepper ??= getHumanAuthorizationRecoveryPepperConfig(
      this.configService,
    );
    return this.cachedPepper.pepper;
  }

  async issue(input: IssueRecoveryTokenInput): Promise<RecoveryTokenIssued> {
    const tenantId = input.tenantId.trim();
    const terminalId = input.terminalId.trim();
    if (tenantId.length === 0 || terminalId.length === 0) {
      throw new Error('Recovery token issuance requires tenant and terminal');
    }
    return await this.transaction.run(tenantId, async (manager) =>
      this.issueInTransaction(manager, input, tenantId, terminalId),
    );
  }

  private async issueInTransaction(
    manager: EntityManager,
    input: IssueRecoveryTokenInput,
    tenantId: string,
    terminalId: string,
  ): Promise<RecoveryTokenIssued> {
    // The issuer must be an active user of the same tenant (the guards
    // enforce the session; the service re-checks the account state).
    const issuers: { is_active?: boolean }[] = await manager.query(
      `SELECT is_active FROM users WHERE id = $1 AND tenant_id = $2`,
      [input.issuedByUserId, tenantId],
    );
    if (issuers[0]?.is_active !== true) {
      throw new Error('Only an active same-tenant user can issue a token');
    }

    // The terminal must be an enrolled, active device-sync terminal of the
    // same tenant: a credential bound to a trusted activation terminal.
    const enrolled: Record<string, unknown>[] = await manager.query(
      `SELECT 1
         FROM device_sync_credentials c
         JOIN onboarding_activation_attempts a ON a.id = c.activation_attempt_id
        WHERE c.tenant_id = $1 AND a.trusted_terminal_id = $2
          AND c.status = 'ACTIVE'
        LIMIT 1`,
      [tenantId, terminalId],
    );
    if (enrolled.length === 0) {
      throw new Error(
        'Recovery tokens can only be issued for enrolled terminals',
      );
    }

    const issued = issueRecoveryToken(this.pepper);
    const expiresAt = new Date(Date.now() + RECOVERY_TOKEN_TTL_MS);
    await manager.query(
      `INSERT INTO human_auth_recovery_tokens
         (token_id, tenant_id, terminal_id, secret_hmac, status,
          issued_by_user_id, issuance_reason, expires_at)
       VALUES ($1, $2, $3, $4, 'ISSUED', $5, $6, $7)`,
      [
        issued.tokenId,
        tenantId,
        terminalId,
        issued.secretHmac,
        input.issuedByUserId,
        input.reason,
        expiresAt,
      ],
    );
    await this.appendEvent(manager, {
      tenantId,
      terminalId,
      tokenId: issued.tokenId,
      eventType: 'ISSUANCE',
      actorUserId: input.issuedByUserId,
      principalType: 'HUMAN',
      reasonCode: null,
      correlationId: input.correlationId ?? null,
    });
    this.metrics?.incrementRecoveryLifecycle(OHAC_RECOVERY_LIFECYCLE.ISSUED);
    return {
      tokenId: issued.tokenId,
      token: `ohr1.${issued.tokenId}.${issued.secret}`,
      expiresAt,
    };
  }

  async redeem(
    input: RedeemRecoveryTokenInput,
  ): Promise<RecoveryRedeemOutcome> {
    const tenantId = input.tenantId.trim();
    return await this.transaction.run(tenantId, (manager) =>
      this.redeemInTransaction(manager, input, tenantId),
    );
  }

  private async redeemInTransaction(
    manager: EntityManager,
    input: RedeemRecoveryTokenInput,
    tenantId: string,
  ): Promise<RecoveryRedeemOutcome> {
    const reject = async (
      resultCode: OhacErrorCode,
      tokenId: string | null,
    ) => {
      if (tokenId !== null) {
        await this.appendEvent(manager, {
          tenantId,
          terminalId: input.terminalId,
          tokenId,
          eventType: 'DENIAL',
          actorUserId: null,
          principalType: 'DEVICE_SYNC',
          reasonCode: resultCode,
          correlationId: input.correlationId ?? null,
        });
      }
      this.metrics?.incrementRecoveryLifecycle(
        OHAC_RECOVERY_LIFECYCLE.DENIED,
        resultCode,
      );
      return { status: 'rejected', resultCode } as const;
    };

    // Only well-formed tokens are even looked up: the format check keeps
    // arbitrary input from becoming a hash query.
    if (!TOKEN_FORMAT.test(input.token)) {
      return reject(OHAC_ERROR_CODE.RECOVERY_BINDING_MISMATCH, null);
    }
    const separator = input.token.indexOf('.', 5);
    const secret = input.token.slice(separator + 1);
    const secretHmac = recoverySecretHmac(secret, this.pepper);

    const rows = (await manager.query(
      `SELECT token_id, terminal_id, status, expires_at, idempotency_key,
              redemption_request_hash, redeemed_at
         FROM human_auth_recovery_tokens
        WHERE tenant_id = $1 AND secret_hmac = $2
        FOR UPDATE`,
      [tenantId, secretHmac],
    )) as unknown as TokenRow[];
    const row = rows[0];
    if (!row) {
      return reject(OHAC_ERROR_CODE.RECOVERY_BINDING_MISMATCH, null);
    }

    const requestHash = redemptionRequestHash(input);

    if (row.status === 'REVOKED') {
      return reject(OHAC_ERROR_CODE.RECOVERY_REVOKED, row.token_id);
    }
    if (row.status === 'REDEEMED') {
      if (
        row.idempotency_key === input.idempotencyKey &&
        row.redemption_request_hash === requestHash
      ) {
        // Same principal + same idempotency key/hash: return the receipt
        // already issued (design §9 lost-response replay).
        this.metrics?.incrementRecoveryLifecycle(
          OHAC_RECOVERY_LIFECYCLE.REDEEMED,
        );
        return {
          status: 'replayed',
          receipt: {
            tokenId: row.token_id,
            terminalId: row.terminal_id,
            redeemedAt: row.redeemed_at ?? new Date(0),
          },
        };
      }
      return reject(OHAC_ERROR_CODE.RECOVERY_USED, row.token_id);
    }
    if (row.terminal_id !== input.terminalId) {
      return reject(OHAC_ERROR_CODE.RECOVERY_BINDING_MISMATCH, row.token_id);
    }
    if (row.expires_at.getTime() + EXPIRY_GRACE_MS <= Date.now()) {
      await this.observeExpired(manager, {
        tenantId,
        terminalId: row.terminal_id,
        tokenId: row.token_id,
      });
      return reject(OHAC_ERROR_CODE.RECOVERY_EXPIRED, row.token_id);
    }
    if (input.integrityClassification === 'TRANSPORT_STATE_MISSING') {
      // Clear-data/reinstall: transport must be restored first (design §9);
      // redemption never provisions, confirms, rotates, or revokes device
      // credentials.
      return reject(OHAC_ERROR_CODE.TRANSPORT_RECOVERY_REQUIRED, row.token_id);
    }

    // Build/cohort validation happens only for a live, bound token. The
    // backend build is pinned by the caller (the inbound-sync layer passes
    // the backend build the process was started with).
    const cohorts: {
      enabled: boolean;
      policy_schema: string;
      assertion_schema: string;
    }[] = await manager.query(
      `SELECT enabled, policy_schema, assertion_schema
         FROM human_auth_rollout_cohorts
        WHERE tenant_id = $1 AND pos_build = $2 AND backend_build = $3`,
      [tenantId, input.posBuild, input.backendBuild],
    );
    const cohort = cohorts[0];
    if (!cohort) {
      return reject(OHAC_ERROR_CODE.COHORT_DISABLED, row.token_id);
    }
    if (
      !cohort.enabled ||
      cohort.policy_schema !== input.policySchema ||
      cohort.assertion_schema !== input.assertionSchema
    ) {
      return reject(OHAC_ERROR_CODE.UNSUPPORTED_BUILD, row.token_id);
    }

    // Single-use CAS: the row lock above serializes concurrent redemptions;
    // the status guard keeps the invariant even without the lock.
    const updated = (await manager.query(
      `UPDATE human_auth_recovery_tokens
          SET status = 'REDEEMED',
              redeemed_at = CURRENT_TIMESTAMP,
              redemption_credential_id = $2,
              idempotency_key = $3,
              redemption_request_hash = $4
        WHERE token_id = $1 AND status = 'ISSUED'
        RETURNING redeemed_at`,
      [row.token_id, input.credentialId, input.idempotencyKey, requestHash],
    )) as unknown as { redeemed_at: Date }[];
    if (updated.length === 0) {
      await this.appendEvent(manager, {
        tenantId,
        terminalId: row.terminal_id,
        tokenId: row.token_id,
        eventType: 'RACE_LOSS',
        actorUserId: null,
        principalType: 'DEVICE_SYNC',
        reasonCode: OHAC_ERROR_CODE.RECOVERY_USED,
        correlationId: input.correlationId ?? null,
      });
      this.metrics?.incrementRecoveryLifecycle(
        OHAC_RECOVERY_LIFECYCLE.RACE_LOSS,
        OHAC_ERROR_CODE.RECOVERY_USED,
      );
      return { status: 'rejected', resultCode: OHAC_ERROR_CODE.RECOVERY_USED };
    }

    const receipt: RecoveryRedemptionReceipt = {
      tokenId: row.token_id,
      terminalId: row.terminal_id,
      redeemedAt: new Date(updated[0].redeemed_at),
    };
    await this.appendEvent(manager, {
      tenantId,
      terminalId: row.terminal_id,
      tokenId: row.token_id,
      eventType: 'REDEMPTION',
      actorUserId: null,
      principalType: 'DEVICE_SYNC',
      reasonCode: null,
      correlationId: input.correlationId ?? null,
    });
    this.metrics?.incrementRecoveryLifecycle(OHAC_RECOVERY_LIFECYCLE.REDEEMED);
    return { status: 'redeemed', receipt };
  }

  async revoke(
    input: RevokeRecoveryTokenInput,
  ): Promise<RecoveryRevokeOutcome> {
    const tenantId = input.tenantId.trim();
    return await this.transaction.run(tenantId, (manager) =>
      this.revokeInTransaction(manager, input, tenantId),
    );
  }

  private async revokeInTransaction(
    manager: EntityManager,
    input: RevokeRecoveryTokenInput,
    tenantId: string,
  ): Promise<RecoveryRevokeOutcome> {
    const rows = (await manager.query(
      `SELECT token_id, terminal_id, status
         FROM human_auth_recovery_tokens
        WHERE tenant_id = $1 AND token_id = $2
        FOR UPDATE`,
      [tenantId, input.tokenId],
    )) as unknown as {
      token_id: string;
      terminal_id: string;
      status: string;
    }[];
    const row = rows[0];
    if (!row) {
      return { status: 'not-found', tokenId: input.tokenId };
    }
    if (row.status === 'REDEEMED') {
      return {
        status: 'rejected',
        resultCode: OHAC_ERROR_CODE.RECOVERY_USED,
        tokenId: row.token_id,
      };
    }
    if (row.status === 'REVOKED') {
      return { status: 'already-revoked', tokenId: row.token_id };
    }
    await manager.query(
      `UPDATE human_auth_recovery_tokens
          SET status = 'REVOKED',
              revoked_at = CURRENT_TIMESTAMP,
              revoked_by_user_id = $2,
              revocation_reason = $3
        WHERE token_id = $1 AND status = 'ISSUED'`,
      [row.token_id, input.revokedByUserId, input.reason],
    );
    await this.appendEvent(manager, {
      tenantId,
      terminalId: row.terminal_id,
      tokenId: row.token_id,
      eventType: 'REVOCATION',
      actorUserId: input.revokedByUserId,
      principalType: 'HUMAN',
      reasonCode: null,
      correlationId: input.correlationId ?? null,
    });
    this.metrics?.incrementRecoveryLifecycle(OHAC_RECOVERY_LIFECYCLE.REVOKED);
    return { status: 'revoked', tokenId: row.token_id };
  }

  /**
   * First observation of an expired token appends an EXPIRED event
   * idempotently (design §9): the partial unique index on
   * `human_auth_recovery_events` collapses duplicate observations, and a
   * unique violation on this event type is treated as already-observed.
   */
  private async observeExpired(
    manager: EntityManager,
    token: { tenantId: string; terminalId: string; tokenId: string },
  ): Promise<void> {
    // The partial unique index collapses duplicate observations. Postgres
    // aborts the whole transaction on a unique violation, so the idempotent
    // path is guarded by a savepoint: an existing EXPIRY_OBSERVED event rolls
    // back only the failed insert and the observation stays a no-op.
    await manager.query('SAVEPOINT observe_expiry');
    try {
      await this.appendEvent(manager, {
        tenantId: token.tenantId,
        terminalId: token.terminalId,
        tokenId: token.tokenId,
        eventType: 'EXPIRY_OBSERVED',
        actorUserId: null,
        principalType: 'SYSTEM',
        reasonCode: null,
        correlationId: null,
      });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== '23505') throw error;
      await manager.query('ROLLBACK TO SAVEPOINT observe_expiry');
    }
    await manager.query('RELEASE SAVEPOINT observe_expiry');
    this.metrics?.incrementRecoveryLifecycle(OHAC_RECOVERY_LIFECYCLE.EXPIRED);
  }

  private async appendEvent(
    manager: EntityManager,
    event: {
      tenantId: string;
      terminalId: string;
      tokenId: string;
      eventType: string;
      actorUserId: string | null;
      principalType: string;
      reasonCode: string | null;
      correlationId: string | null;
    },
  ): Promise<void> {
    await manager.query(
      `INSERT INTO human_auth_recovery_events
         (tenant_id, terminal_id, token_id, event_type, actor_user_id,
          principal_type, reason_code, correlation_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        event.tenantId,
        event.terminalId,
        event.tokenId,
        event.eventType,
        event.actorUserId,
        event.principalType,
        event.reasonCode,
        event.correlationId,
      ],
    );
  }
}
