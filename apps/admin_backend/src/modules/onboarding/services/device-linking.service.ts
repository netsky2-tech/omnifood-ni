import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import {
  bindTenantContext,
  runInTenantTransaction,
} from '../../../core/database/tenant-transaction';
import { LinkingCodeResponseDto } from '../dto/linking-code-response.dto';
import {
  DeviceLinkingCode,
  DeviceLinkingCodeStatus,
} from '../entities/device-linking-code.entity';

/**
 * Pre-auth device linking codes (issue #556 stage 3, founder design).
 *
 * Before any login attempt the device LINKS to its tenant: the dashboard
 * generates a single-use, short-expiry 6-character code (human-auth,
 * tenant-bound, plaintext returned exactly once) and the POS exchanges
 * code + deviceId for the tenant binding (tenantId + persisted slug). The
 * slug is pre-auth context, never authority.
 */

/** 31 unambiguous characters: no 0/O and no 1/I/L. */
export const LINKING_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const LINKING_CODE_LENGTH = 6;
export const LINKING_CODE_BCRYPT_COST = 10;
export const DEFAULT_LINKING_EXPIRY_MINUTES = 15;
export const MIN_LINKING_EXPIRY_MINUTES = 1;
export const MAX_LINKING_EXPIRY_MINUTES = 1440;

/**
 * One generic failure for EVERY rejected claim (unknown, malformed, expired,
 * already claimed, revoked, lost race). No shape distinguishes another, so
 * the endpoint cannot be used to enumerate valid codes.
 */
export const LINKING_CODE_GENERIC_FAILURE =
  'Linking code is invalid, expired, or already claimed';

/**
 * Constant bcrypt digest used to equalize failure timing when there is no
 * stored candidate to compare against (mirrors auth.service
 * DUMMY_PASSWORD_HASH): an unknown code must burn the same compare cost as
 * a wrong code.
 */
export const DUMMY_LINKING_CODE_HASH =
  '$2b$10$cDiMqnQfQvrz.sLEvTblHu1EcFmgKtpogYwqxTorCQk3ydgyu5Xc6';

/**
 * Transaction-local binding of the reviewed claim branch (founder approval
 * 2026-09-24, migration 1809360000000): the ONLY seam that widens the
 * tenant predicate of device_linking_codes, set with set_config local to
 * the claim transaction, never accepted from client input, never
 * session-scoped.
 */
export const LINKING_CLAIM_FLAG_SQL =
  "SELECT set_config('app.linking_claim', $1, true)";

/**
 * Candidate set for the claim scan. Deliberately bounded: rows must be
 * ACTIVE and non-expired, and codes are short-lived (default 15 minutes),
 * so the set stays small. The claim transaction never binds app.tenant_id —
 * the reviewed claim branch is what makes this cross-tenant candidate read
 * possible.
 */
export const CLAIM_CANDIDATES_SQL =
  "SELECT id, code_hash, tenant_id FROM device_linking_codes WHERE status = 'ACTIVE' AND expires_at > now()";

/**
 * The single-use guarantee lives HERE, at the SQL level: the UPDATE only
 * fires while the row is still ACTIVE and non-expired. A concurrent claim
 * (row-locked, then committed) re-evaluates the WHERE clause and matches
 * zero rows. The claim branch in the UPDATE policy's USING/WITH CHECK is
 * what permits an unbound transaction to perform this one transition.
 */
export const CLAIM_LINKING_CODE_SQL =
  "UPDATE device_linking_codes SET status = 'CLAIMED', device_id = $2, claimed_at = now(), updated_at = now() WHERE id = $1 AND status = 'ACTIVE' AND expires_at > now() RETURNING tenant_id";

/**
 * Opportunistic expiry cleanup (issue #556 stage 3, review finding F2):
 * runs inside the generation transaction, bounded by
 * idx_device_linking_codes_expires_at, so expired rows cannot accumulate
 * forever. A periodic sweep is unnecessary at current scale because
 * generateLinkingCode runs per provisioning, and the DELETE is scoped to
 * the caller's tenant by the table's pure-tenant DELETE policy.
 */
export const CLEANUP_EXPIRED_LINKING_CODES_SQL =
  'DELETE FROM device_linking_codes WHERE expires_at < now()';

/**
 * The partial unique index (review finding F1): only ACTIVE rows compete,
 * so the same plaintext can never be ACTIVE in two tenants at once and a
 * random collision can never mis-bind a claimant. Generation retries on a
 * collision instead of failing.
 */
export const UNIQUE_ACTIVE_CODE_HASH_INDEX =
  'uq_device_linking_codes_active_hash';

/**
 * The Postgres unique-violation code, mirrored from the driver error (the
 * QueryFailedError surface carries it directly or under driverError).
 */
export function isUniqueViolationError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  const driverCode = (error as { driverError?: { code?: unknown } } | null)
    ?.driverError?.code;
  return code === '23505' || driverCode === '23505';
}

export interface GenerateLinkingCodeOptions {
  expiryMinutes?: number;
}

/**
 * Bounded window of the dashboard listing (issue #569 single linking
 * flow): the setup center only needs the most recent codes to offer
 * one-click activation for freshly claimed devices.
 */
export const LINKING_CODES_LIST_LIMIT = 20;

/**
 * Bounded regeneration budget for random collisions against the partial
 * unique index. 31^6 ≈ 887M makes even two collisions in a row
 * negligible; five turns an impossibility into a hard stop.
 */
const MAX_GENERATION_ATTEMPTS = 5;

export interface GenerateLinkingCodeResult {
  /** The plaintext code, returned exactly ONCE. Never stored or logged. */
  readonly code: string;
  readonly expiresAt: Date;
}

export interface ClaimLinkingCodeResult {
  readonly tenantId: string;
  readonly slug: string;
  readonly deviceId: string;
  readonly linkedAt: Date;
}

export function generateLinkingCodeValue(): string {
  let code = '';
  for (let index = 0; index < LINKING_CODE_LENGTH; index++) {
    code += LINKING_CODE_ALPHABET[randomInt(LINKING_CODE_ALPHABET.length)];
  }
  return code;
}

/** Uppercase and strip every non-alphanumeric character. */
export function normalizeLinkingCode(raw: string): string {
  return (raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** True only for a normalized code drawn from the unambiguous alphabet. */
export function isCanonicalLinkingCode(normalized: string): boolean {
  if (normalized.length !== LINKING_CODE_LENGTH) {
    return false;
  }
  for (const char of normalized) {
    if (!LINKING_CODE_ALPHABET.includes(char)) {
      return false;
    }
  }
  return true;
}

interface ClaimCandidateRow {
  id: string;
  code_hash: string;
  tenant_id: string;
}

/**
 * Normalizes the raw result of a RETURNING/SELECT read. The Postgres driver
 * hands UPDATE..RETURNING back as a two-element raw result ([rows, affected
 * count]) through manager.query, while plain SELECTs arrive as a flat rows
 * array — the runtime shape observed against the real database by the db
 * spec. Every raw read in this service goes through this normalizer so the
 * claim logic never depends on the driver's shape choice.
 */
export function asQueryRows<T>(result: unknown): T[] {
  if (Array.isArray(result) && Array.isArray(result[0])) {
    return result[0] as T[];
  }
  return Array.isArray(result) ? (result as T[]) : [];
}

@Injectable()
export class DeviceLinkingService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Generates a linking code for the caller's tenant. The plaintext is
   * returned exactly once and only its bcrypt hash is persisted.
   *
   * Uniqueness (review finding F1): the partial unique index
   * uq_device_linking_codes_active_hash makes a duplicate ACTIVE plaintext
   * impossible, so on the astronomically rare random collision the
   * generation retries with a fresh code (bounded loop) instead of
   * inserting a duplicate that would mis-bind the claimant. Expired rows
   * are opportunistically cleaned up inside the same transaction (finding
   * F2), bounded by the expires_at index.
   */
  async generateLinkingCode(
    tenantId: string,
    actorUserId: string,
    options: GenerateLinkingCodeOptions = {},
  ): Promise<GenerateLinkingCodeResult> {
    const trimmedTenantId = tenantId?.trim();
    const trimmedActorUserId = actorUserId?.trim();
    if (!trimmedTenantId || !trimmedActorUserId) {
      throw new BadRequestException(
        'Tenant and actor context are required to generate a linking code',
      );
    }

    const expiryMinutes =
      options.expiryMinutes ?? DEFAULT_LINKING_EXPIRY_MINUTES;
    if (
      !Number.isInteger(expiryMinutes) ||
      expiryMinutes < MIN_LINKING_EXPIRY_MINUTES ||
      expiryMinutes > MAX_LINKING_EXPIRY_MINUTES
    ) {
      throw new BadRequestException(
        `expiryMinutes must be an integer between ${MIN_LINKING_EXPIRY_MINUTES} and ${MAX_LINKING_EXPIRY_MINUTES}`,
      );
    }

    const expiresAt = new Date(Date.now() + expiryMinutes * 60_000);

    for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
      const code = generateLinkingCodeValue();
      const codeHash = await bcrypt.hash(code, LINKING_CODE_BCRYPT_COST);
      try {
        await this.dataSource.transaction(async (manager: EntityManager) => {
          await bindTenantContext(manager, trimmedTenantId);
          await manager.query(CLEANUP_EXPIRED_LINKING_CODES_SQL);
          await manager.getRepository(DeviceLinkingCode).insert({
            tenantId: trimmedTenantId,
            codeHash,
            status: DeviceLinkingCodeStatus.ACTIVE,
            deviceId: null,
            createdByUserId: trimmedActorUserId,
            expiresAt,
          });
        });
        return { code, expiresAt };
      } catch (error) {
        if (!isUniqueViolationError(error)) {
          throw error;
        }
        // Duplicate ACTIVE plaintext: regenerate with a fresh code.
      }
    }

    throw new ConflictException(
      'Unable to generate a unique linking code after repeated collisions',
    );
  }

  /**
   * Lists the tenant's most recent linking codes for the dashboard
   * (issue #569 single linking flow). Tenant-bound: the read runs inside a
   * transaction whose context is bound to the caller's tenant id, so RLS
   * filters every other tenant's rows and the explicit `where` keeps the
   * predicate deterministic. The projection deliberately drops `codeHash`
   * and `tenantId` (see LinkingCodeResponseDto).
   */
  async listLinkingCodes(tenantId: string): Promise<LinkingCodeResponseDto[]> {
    const trimmedTenantId = tenantId?.trim();
    if (!trimmedTenantId) {
      throw new BadRequestException(
        'Tenant context is required to list linking codes',
      );
    }

    return await runInTenantTransaction(
      this.dataSource,
      trimmedTenantId,
      async (manager) => {
        const rows = await manager.getRepository(DeviceLinkingCode).find({
          where: { tenantId: trimmedTenantId },
          order: { createdAt: 'DESC' },
          take: LINKING_CODES_LIST_LIMIT,
        });
        return rows.map((row) => ({
          id: row.id,
          status: row.status,
          deviceId: row.deviceId,
          expiresAt: row.expiresAt,
          claimedAt: row.claimedAt,
          createdAt: row.createdAt,
        }));
      },
    );
  }

  /**
   * PRE-AUTH claim: exchanges code + deviceId for the tenant binding.
   *
   * Failure discipline: every rejection — unknown, malformed, expired,
   * already claimed, revoked, lost single-use race — throws the SAME
   * generic error. The candidate scan compares every ACTIVE non-expired
   * code so the success and failure paths burn the same compare cost over
   * the bounded set, and an empty set burns one dummy compare (bcrypt cost
   * 10). The comparison cost is bounded by design: codes are 6 characters
   * over a 31-character alphabet, live at most expiryMinutes, and the
   * endpoint is rate-limited per IP.
   *
   * The claim transaction sets the transaction-local linking_claim flag
   * (reviewed branch, migration 1809360000000) and never binds a tenant:
   * the conditional UPDATE is what claims exactly one row, exactly once.
   */
  async claimCode(
    code: string,
    deviceId: string,
  ): Promise<ClaimLinkingCodeResult> {
    const normalized = normalizeLinkingCode(code);
    const trimmedDeviceId = deviceId?.trim();

    if (!isCanonicalLinkingCode(normalized) || !trimmedDeviceId) {
      await bcrypt.compare(normalized, DUMMY_LINKING_CODE_HASH);
      throw new UnauthorizedException(LINKING_CODE_GENERIC_FAILURE);
    }

    return await this.dataSource.transaction(async (manager: EntityManager) => {
      await manager.query(LINKING_CLAIM_FLAG_SQL, ['on']);

      const candidates = asQueryRows<ClaimCandidateRow>(
        await manager.query(CLAIM_CANDIDATES_SQL),
      );

      let matched: ClaimCandidateRow | null = null;
      for (const candidate of candidates) {
        if (await bcrypt.compare(normalized, candidate.code_hash)) {
          // Keep scanning to hold the compare cost constant across the set;
          // the FIRST match in deterministic (id) order wins the binding.
          if (!matched || candidate.id < matched.id) {
            matched = candidate;
          }
        }
      }

      if (!matched) {
        await bcrypt.compare(normalized, DUMMY_LINKING_CODE_HASH);
        throw new UnauthorizedException(LINKING_CODE_GENERIC_FAILURE);
      }

      const claimed = asQueryRows<{ tenant_id: string }>(
        await manager.query(CLAIM_LINKING_CODE_SQL, [
          matched.id,
          trimmedDeviceId,
        ]),
      );

      if (!claimed || claimed.length === 0) {
        // Lost the single-use race: a concurrent transaction claimed the row
        // between the candidate scan and this UPDATE. Same generic failure.
        throw new UnauthorizedException(LINKING_CODE_GENERIC_FAILURE);
      }

      const tenantId = claimed[0].tenant_id;
      const tenants = asQueryRows<{ slug: string }>(
        await manager.query('SELECT slug FROM tenants WHERE id = $1', [
          tenantId,
        ]),
      );

      if (!tenants || tenants.length === 0 || !tenants[0].slug) {
        // The tenant (or its persisted stage-1 slug) vanished between the
        // claim and the read; the binding is unusable, so fail generically.
        throw new UnauthorizedException(LINKING_CODE_GENERIC_FAILURE);
      }

      return {
        tenantId,
        slug: tenants[0].slug,
        deviceId: trimmedDeviceId,
        linkedAt: new Date(),
      };
    });
  }
}
