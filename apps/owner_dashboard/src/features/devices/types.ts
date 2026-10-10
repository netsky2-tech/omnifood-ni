export type DeviceSyncStatus = "PENDING" | "ACTIVE" | "RETIRED" | "REVOKED";

/**
 * Freshness verdict computed by the backend from receipt sequence continuity.
 * `null` means the backend has not computed a verdict for this device yet.
 */
export type DeviceFreshnessState =
  | "COMPLETE"
  | "STALE"
  | "PARTIAL"
  | "UNKNOWN"
  | "PENDING"
  | null;

/**
 * Terminal device credential + sync-health snapshot as returned by
 * GET /identity/device-sync/terminals (B17-03).
 */
export interface TerminalDevice {
  terminalId: string;
  label: string | null;
  credentialId: string;
  credentialVersion: number;
  status: DeviceSyncStatus;
  issuedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  revocationReason: string | null;
  posBuild: string | null;
  freshnessState: DeviceFreshnessState;
  acceptedThroughSequence: number | null;
  lastReceiptAt: string | null;
  hasDeclaredGaps: boolean;
  hasInventoryPending: boolean;
  inventoryPendingCount: number;
}
