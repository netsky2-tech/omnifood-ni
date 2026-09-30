import type { EntityManager } from 'typeorm';
import type { DeviceSyncPrincipal } from '../../security/device-sync-principal';
import type { OhacAssertionV1 } from '../contracts/assertion.v1';
import type { OhacRole } from '../contracts/staff-policy-epoch.v1';
import type { OhacErrorCode } from '../contracts/error-codes';

/**
 * Backend verification port (design §8).
 *
 * The consumer owns the transaction boundary: it opens a tenant-RLS
 * transaction, rechecks its own idempotency, calls `verify` with its
 * `EntityManager`, inserts consumption, applies the protected effect, and
 * commits. The verifier NEVER inserts consumption and NEVER commits or
 * rolls back — it may append one verification event through the supplied
 * manager and nothing else.
 */

export const HUMAN_AUTHORIZATION_VERIFIER_PORT = Symbol(
  'HUMAN_AUTHORIZATION_VERIFIER_PORT',
);

/** Stable verification decisions (design §8). */
export const OHAC_VERIFICATION_DECISION = {
  ADMITTED: 'ADMITTED',
  DENIED: 'DENIED',
} as const;

export type OhacVerificationDecision =
  (typeof OHAC_VERIFICATION_DECISION)[keyof typeof OHAC_VERIFICATION_DECISION];

/**
 * Everything a consumer must pin for one verification (design §8 request):
 * the parsed canonical assertion, the expected tenant/terminal, the exact
 * operation binding, required roles/permissions, the supported contract
 * pair, and consumer correlation.
 */
export interface HumanAuthorizationVerificationRequest {
  /** Parsed with `parseAssertionV1`; the verifier re-checks framing defensively. */
  readonly assertion: OhacAssertionV1;
  readonly expectedTenantId: string;
  readonly expectedTerminalId: string;
  /** The transport scope the consumer's route requires, e.g. `sync:pull`. */
  readonly requiredTransportScope: string;
  readonly expectedOperationType: string;
  readonly expectedOperationSchema: string;
  readonly expectedOperationDigest: string;
  /** Roles the consumer accepts for the authorizer entry; empty accepts any. */
  readonly requiredRoles: readonly OhacRole[];
  /** Permissions that must all be present on the authorizer entry. */
  readonly requiredPermissions: readonly string[];
  /** The consumer's own backend build for the cohort/build pair check. */
  readonly backendBuild: string;
  readonly correlationId?: string;
}

/**
 * Frozen verification facts (design §8): identity, epoch, authorizer,
 * operator, operation binding, local audit linkage, and trust level. No
 * secrets, no synthesized JWT user, no identity mutation.
 */
export interface HumanAuthorizationVerificationFacts {
  readonly assertionId: string;
  readonly tenantId: string;
  readonly terminalId: string;
  readonly deviceCredentialId: string;
  readonly deviceCredentialVersion: string;
  readonly epochSequence: string;
  readonly epochDigest: string;
  readonly authorizerUserId: string;
  readonly authorizerRole: string;
  readonly operatorUserId: string;
  readonly permissionsUsed: readonly string[];
  readonly operationType: string;
  readonly operationSchema: string;
  readonly operationDigest: string;
  readonly localAuthorizationSequence: string;
  readonly localAuditId: string;
  readonly trustLevel: string;
}

export interface HumanAuthorizationVerificationResult {
  readonly decision: OhacVerificationDecision;
  /** Stable §10 reason code; null when admitted. */
  readonly reasonCode: OhacErrorCode | null;
  readonly facts: Readonly<HumanAuthorizationVerificationFacts>;
}

/**
 * The port every OHAC consumer (DSI-6 invoice/Kardex first) depends on.
 * `manager` is the consumer's tenant-bound transaction manager.
 */
export interface HumanAuthorizationVerifierPort {
  verify(
    manager: EntityManager,
    principal: DeviceSyncPrincipal,
    request: HumanAuthorizationVerificationRequest,
  ): Promise<HumanAuthorizationVerificationResult>;
}

/**
 * Builds the frozen facts for an outcome. Every field is known from the
 * assertion itself, so a denial carries the same frozen shape as an
 * admission plus its stable reason code: an investigator can always see
 * what was denied and why, without any secret material.
 */
export const buildVerificationResult = (
  assertion: OhacAssertionV1,
  decision: OhacVerificationDecision,
  reasonCode: OhacErrorCode | null,
): HumanAuthorizationVerificationResult =>
  Object.freeze({
    decision,
    reasonCode,
    facts: Object.freeze({
      assertionId: assertion.assertionId,
      tenantId: assertion.tenantId,
      terminalId: assertion.terminalId,
      deviceCredentialId: assertion.deviceCredentialId,
      deviceCredentialVersion: assertion.deviceCredentialVersion,
      epochSequence: assertion.epochSequence,
      epochDigest: assertion.epochDigest,
      authorizerUserId: assertion.authorizerUserId,
      authorizerRole: assertion.authorizerRole,
      operatorUserId: assertion.operatorUserId,
      permissionsUsed: Object.freeze([...assertion.permissionsUsed]),
      operationType: assertion.operationType,
      operationSchema: assertion.operationSchema,
      operationDigest: assertion.operationDigest,
      localAuthorizationSequence: assertion.localAuthorizationSequence,
      localAuditId: assertion.localAuditId,
      trustLevel: assertion.trustLevel,
    }),
  });
