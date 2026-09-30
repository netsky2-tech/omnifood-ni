import { Inject, Injectable, Optional } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { OHAC_ERROR_CODE, type OhacErrorCode } from '../contracts/error-codes';
import {
  ASSERTION_V1_SCHEMA,
  OHAC_TRUST_LEVEL,
  type OhacAssertionV1,
} from '../contracts/assertion.v1';
import { STAFF_POLICY_EPOCH_V1_SCHEMA } from '../contracts/staff-policy-epoch.v1';
import { STAFF_POLICY_SNAPSHOT_V1_SCHEMA } from '../projection/staff-policy-snapshot-projector';
import { DEVICE_SYNC_PRINCIPAL_TYPE } from '../../security/device-sync-principal';
import {
  buildVerificationResult,
  type HumanAuthorizationVerificationRequest,
  type HumanAuthorizationVerificationResult,
  type HumanAuthorizationVerifierPort,
} from '../ports/human-authorization-verifier.port';
import type { DeviceSyncPrincipal } from '../../security/device-sync-principal';
import {
  HumanAuthorizationMetricsService,
  OHAC_VERIFICATION_OUTCOME,
} from './human-authorization-metrics.service';

const SHA256_DIGEST = /^sha256:[0-9a-f]{64}$/;

interface CohortRow {
  readonly enabled: boolean;
  readonly policy_schema: string;
  readonly assertion_schema: string;
}

interface EpochRow {
  readonly schema: string;
  readonly digest: string;
  readonly payload: {
    readonly policyEntries?: ReadonlyArray<{
      readonly userId?: unknown;
      readonly status?: unknown;
      readonly role?: unknown;
      readonly permissions?: unknown;
    }>;
  };
}

interface FloorRow {
  readonly sequence: string;
  readonly digest: string;
}

/**
 * Backend verifier for OHAC assertions (design §8).
 *
 * Runs the eight ordered checks inside the consumer-supplied
 * `EntityManager`/RLS transaction: the consumer opens the transaction and
 * owns idempotency, consumption, effects, and the commit; this service only
 * reads, decides, and appends one verification event. It NEVER inserts a
 * consumption row and NEVER commits or rolls back — a throw after `verify`
 * must leave neither effect nor consumption, by construction.
 *
 * The check order is the contract, with one deliberate precondition outside
 * it: principal-type framing (the port is typed for a `DeviceSyncPrincipal`,
 * and a principal that is not `DEVICE_SYNC` is not the asserted transport
 * identity at all) is evaluated before the ordered checks so a non-device
 * caller can never elicit §10 check-specific reasons. The eight ordered
 * checks then run in sequence: cohort/build pair, schema/digest/replay
 * identity framing, principal binding, operation binding, acknowledged-epoch
 * and floor consistency, authorizer entry, operator/audit well-formedness,
 * and the exact software trust level. Reordering would let a weaker signal
 * mask a stronger one (e.g. reporting a credential mismatch for an
 * assertion whose cohort was never enabled).
 */
@Injectable()
export class HumanAuthorizationVerifierService implements HumanAuthorizationVerifierPort {
  constructor(
    @Optional()
    @Inject(HumanAuthorizationMetricsService)
    private readonly metrics?: HumanAuthorizationMetricsService,
  ) {}

  async verify(
    manager: EntityManager,
    principal: DeviceSyncPrincipal,
    request: HumanAuthorizationVerificationRequest,
  ): Promise<HumanAuthorizationVerificationResult> {
    const assertion = request.assertion;

    // Defensive tenant binding (design §8): the consumer should already have
    // bound the RLS context, but the verifier never trusts that. If the
    // effective tenant is not the principal's tenant, nothing may run.
    await manager.query("SELECT set_config('app.tenant_id', $1, true)", [
      principal.tenantId,
    ]);
    const bound: { tenant?: string }[] = await manager.query(
      "SELECT current_setting('app.tenant_id') AS tenant",
    );
    if (bound[0]?.tenant !== principal.tenantId) {
      return await this.decide(
        manager,
        assertion,
        principal,
        request,
        OHAC_ERROR_CODE.TENANT_SCOPE_MISMATCH,
      );
    }

    // Check 3a (framing of the transport authority): the port is typed for a
    // DeviceSyncPrincipal; a principal that is not DEVICE_SYNC is not the
    // asserted transport identity at all, so it fails exactly like a
    // tenant/terminal mismatch — the submitting principal is simply not the
    // one the assertion was bound to.
    if (principal.principalType !== DEVICE_SYNC_PRINCIPAL_TYPE) {
      return await this.decide(
        manager,
        assertion,
        principal,
        request,
        OHAC_ERROR_CODE.TENANT_TERMINAL_MISMATCH,
      );
    }

    // Check 1: cohort enabled and POS/backend/assertion/policy schema pair
    // supported. A disabled or missing cohort pair denies with zero fallback.
    const cohorts: CohortRow[] = await manager.query(
      `SELECT enabled, policy_schema, assertion_schema
         FROM human_auth_rollout_cohorts
        WHERE tenant_id = $1 AND pos_build = $2 AND backend_build = $3`,
      [principal.tenantId, assertion.posBuild, request.backendBuild],
    );
    const cohort = cohorts[0];
    if (!cohort) {
      return await this.decide(
        manager,
        assertion,
        principal,
        request,
        OHAC_ERROR_CODE.COHORT_DISABLED,
      );
    }
    if (
      !cohort.enabled ||
      cohort.assertion_schema !== ASSERTION_V1_SCHEMA ||
      cohort.policy_schema !== STAFF_POLICY_SNAPSHOT_V1_SCHEMA
    ) {
      return await this.decide(
        manager,
        assertion,
        principal,
        request,
        OHAC_ERROR_CODE.UNSUPPORTED_BUILD,
      );
    }

    // Check 2: strict schema/canonical digest syntax and unique
    // replay-relevant assertion identity. parseAssertionV1 has already
    // rejected unknown fields and verified the body digest; the port does
    // not re-canonicalize, it re-checks the identity framing so a consumer
    // that skips the parser cannot hand it a structurally impossible
    // assertion.
    if (
      assertion.schema !== ASSERTION_V1_SCHEMA ||
      assertion.policySchema !== STAFF_POLICY_EPOCH_V1_SCHEMA ||
      !SHA256_DIGEST.test(assertion.digest) ||
      !SHA256_DIGEST.test(assertion.epochDigest) ||
      !SHA256_DIGEST.test(assertion.operationDigest)
    ) {
      return await this.decide(
        manager,
        assertion,
        principal,
        request,
        OHAC_ERROR_CODE.MALFORMED_ASSERTION,
      );
    }

    // Check 3: the principal is DEVICE_SYNC with the required transport
    // scope and exactly matches the assertion tenant, canonical terminal,
    // and credential ID/version. Tenant/terminal mismatch (the submitting
    // principal is not the asserted tenant/terminal at all) is distinct
    // from a credential-binding mismatch (the assertion was authorized
    // under a different or older device credential binding, e.g. after a
    // credentialVersion bump) — R1-004 keeps the remediation paths apart.
    if (
      !principal.scopes.includes(request.requiredTransportScope) ||
      assertion.tenantId !== principal.tenantId ||
      assertion.terminalId !== principal.deviceId ||
      request.expectedTenantId !== principal.tenantId ||
      request.expectedTerminalId !== principal.deviceId
    ) {
      return await this.decide(
        manager,
        assertion,
        principal,
        request,
        OHAC_ERROR_CODE.TENANT_TERMINAL_MISMATCH,
      );
    }
    if (
      assertion.deviceCredentialId !== principal.credentialId ||
      assertion.deviceCredentialVersion !== String(principal.credentialVersion)
    ) {
      return await this.decide(
        manager,
        assertion,
        principal,
        request,
        OHAC_ERROR_CODE.CREDENTIAL_BINDING_MISMATCH,
      );
    }

    // Check 4: the consumer's expected operation binding must exactly equal
    // the asserted one.
    if (
      assertion.operationType !== request.expectedOperationType ||
      assertion.operationSchema !== request.expectedOperationSchema
    ) {
      return await this.decide(
        manager,
        assertion,
        principal,
        request,
        OHAC_ERROR_CODE.MALFORMED_ASSERTION,
      );
    }
    if (assertion.operationDigest !== request.expectedOperationDigest) {
      return await this.decide(
        manager,
        assertion,
        principal,
        request,
        OHAC_ERROR_CODE.DIGEST_MISMATCH,
      );
    }

    // Check 5: the referenced epoch is acked and floor-consistent. The epoch
    // row must exist for the terminal with the asserted digest, and the
    // terminal's accepted floor must have reached it. A floor digest that
    // disagrees with the epoch at the same sequence is corruption, not
    // staleness, and gets its own code.
    const epochs: EpochRow[] = await manager.query(
      `SELECT schema, digest, payload
         FROM human_auth_policy_epochs
        WHERE tenant_id = $1 AND terminal_id = $2 AND sequence = $3`,
      [principal.tenantId, principal.deviceId, assertion.epochSequence],
    );
    const epoch = epochs[0];
    if (!epoch) {
      return await this.decide(
        manager,
        assertion,
        principal,
        request,
        OHAC_ERROR_CODE.STALE_EPOCH,
      );
    }
    if (epoch.digest !== assertion.epochDigest) {
      return await this.decide(
        manager,
        assertion,
        principal,
        request,
        OHAC_ERROR_CODE.DIGEST_MISMATCH,
      );
    }
    if (epoch.schema !== assertion.policySchema) {
      return await this.decide(
        manager,
        assertion,
        principal,
        request,
        OHAC_ERROR_CODE.UNSUPPORTED_SCHEMA,
      );
    }
    const floors: FloorRow[] = await manager.query(
      `SELECT sequence, digest
         FROM human_auth_terminal_ack_floor
        WHERE tenant_id = $1 AND terminal_id = $2`,
      [principal.tenantId, principal.deviceId],
    );
    const floor = floors[0];
    if (!floor || BigInt(floor.sequence) < BigInt(assertion.epochSequence)) {
      return await this.decide(
        manager,
        assertion,
        principal,
        request,
        OHAC_ERROR_CODE.STALE_EPOCH,
      );
    }
    if (
      floor.sequence === assertion.epochSequence &&
      floor.digest !== assertion.epochDigest
    ) {
      return await this.decide(
        manager,
        assertion,
        principal,
        request,
        OHAC_ERROR_CODE.ACK_INCONSISTENT,
      );
    }

    // Check 6: the immutable epoch entry must match the authorizer, role,
    // active status, and every required permission / permissionsUsed value.
    const entries = epoch.payload?.policyEntries ?? [];
    const entry = entries.find((e) => e.userId === assertion.authorizerUserId);
    const requiredPermissions = new Set([
      ...request.requiredPermissions,
      ...assertion.permissionsUsed,
    ]);
    const roleMatches =
      entry !== undefined &&
      entry.role === assertion.authorizerRole &&
      (request.requiredRoles.length === 0 ||
        request.requiredRoles.includes(entry.role as never));
    const permissionsMatch =
      entry !== undefined &&
      Array.isArray(entry.permissions) &&
      [...requiredPermissions].every((permission) =>
        (entry.permissions as readonly string[]).includes(permission),
      );
    if (
      entry === undefined ||
      entry.status !== 'ACTIVE' ||
      !roleMatches ||
      !permissionsMatch
    ) {
      return await this.decide(
        manager,
        assertion,
        principal,
        request,
        OHAC_ERROR_CODE.INELIGIBLE_AUTHORIZER,
      );
    }

    // Check 7: operator and audit/local-sequence fields are well formed.
    // Consumer-specific self/dual-custody policy stays with the consumer;
    // only well-formedness is judged here.
    if (
      !SHA256_DIGEST.test(assertion.localAuditEntryHash) ||
      !/^\d+$/.test(assertion.localAuthorizationSequence) ||
      assertion.localAuditId.trim().length === 0
    ) {
      return await this.decide(
        manager,
        assertion,
        principal,
        request,
        OHAC_ERROR_CODE.MALFORMED_ASSERTION,
      );
    }

    // Check 8: trust level is exactly software sandbox — never inferred,
    // never widened.
    if (
      assertion.trustLevel !== OHAC_TRUST_LEVEL.APPLICATION_SANDBOX_SOFTWARE
    ) {
      return await this.decide(
        manager,
        assertion,
        principal,
        request,
        OHAC_ERROR_CODE.MALFORMED_ASSERTION,
      );
    }

    return await this.decide(manager, assertion, principal, request, null);
  }

  /**
   * Appends the single verification event (append-only, IDs/digests only —
   * never PIN or verifier material) and returns the frozen outcome. The
   * event rides the consumer's transaction: if the consumer rolls back, the
   * event goes with it, which is exactly the §8 boundary.
   */
  private async decide(
    manager: EntityManager,
    assertion: OhacAssertionV1,
    principal: DeviceSyncPrincipal,
    request: HumanAuthorizationVerificationRequest,
    reasonCode: OhacErrorCode | null,
  ): Promise<HumanAuthorizationVerificationResult> {
    await manager.query(
      `INSERT INTO human_auth_verification_events
         (tenant_id, terminal_id, assertion_id, credential_id,
          credential_version, epoch_sequence, epoch_digest,
          authorizer_user_id, operator_user_id, operation_type,
          operation_schema, operation_digest, local_audit_id,
          local_sequence, trust_level, decision, reason_code, correlation_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
               $15, $16, $17, $18)`,
      [
        principal.tenantId,
        assertion.terminalId,
        assertion.assertionId,
        assertion.deviceCredentialId,
        Number(assertion.deviceCredentialVersion),
        assertion.epochSequence,
        assertion.epochDigest,
        assertion.authorizerUserId,
        assertion.operatorUserId,
        assertion.operationType,
        assertion.operationSchema,
        assertion.operationDigest,
        assertion.localAuditId,
        assertion.localAuthorizationSequence,
        assertion.trustLevel,
        reasonCode === null ? 'ADMITTED' : 'DENIED',
        reasonCode,
        request.correlationId ?? null,
      ],
    );
    this.metrics?.incrementVerificationOutcome(
      reasonCode === null
        ? OHAC_VERIFICATION_OUTCOME.ADMITTED
        : OHAC_VERIFICATION_OUTCOME.DENIED,
      reasonCode ?? undefined,
    );
    return buildVerificationResult(
      assertion,
      reasonCode === null ? 'ADMITTED' : 'DENIED',
      reasonCode,
    );
  }
}
