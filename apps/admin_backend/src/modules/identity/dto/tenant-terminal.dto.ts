import { DeviceSyncCredentialStatus } from '../entities/device-sync-credential.entity';
import type { SyncFreshnessTerminalState } from '../../sales/sync-health/freshness-derivation';

/**
 * Authoritative, tenant-scoped terminal registry entry (issue #832, AG-03, Batch 17).
 *
 * Derived read model over device_sync_credentials joined to onboarding
 * activation attempts and sync receipts/freshness watermarks.
 */
export class TenantTerminalDto {
  /** Canonical terminal/device identity from the credential or activation attempt. */
  terminalId!: string;

  /** Human label when available; defaults to terminalId (AG-03). */
  label!: string | null;

  /** Primary key of the latest device sync credential. */
  credentialId!: string;

  /** Monotonic credential version. */
  credentialVersion!: number;

  /** Authoritative credential lifecycle state: PENDING | ACTIVE | RETIRED | REVOKED. */
  status!: DeviceSyncCredentialStatus;

  /** Timestamp when the credential was issued. */
  issuedAt!: Date;

  /** Timestamp when the credential expires. */
  expiresAt!: Date;

  /** Timestamp when the credential was revoked, if applicable. */
  revokedAt!: Date | null;

  /** Audit reason for revocation, if applicable. */
  revocationReason!: string | null;

  /** POS application build reported during activation attempt, if available. */
  posBuild!: string | null;

  /**
   * Freshness state matching SyncHealthService ('COMPLETE' | 'STALE' | 'PARTIAL' | 'UNKNOWN' | 'PENDING'),
   * or null if the credential is non-participating (e.g. REVOKED or RETIRED).
   */
  freshnessState!: SyncFreshnessTerminalState | null;

  /** Highest contiguous accepted source_sequence. */
  acceptedThroughSequence!: number | null;

  /** Newest confirmed receipt watermark (ISO 8601). */
  lastReceiptAt!: string | null;

  /** True when one or more sequence gaps were explicitly declared for this terminal. */
  hasDeclaredGaps!: boolean;

  /** True when any stream for this terminal has receipts whose inventory application is still pending. */
  hasInventoryPending!: boolean;

  /** Total count of inventory-pending receipts across this terminal's streams. */
  inventoryPendingCount!: number;
}
