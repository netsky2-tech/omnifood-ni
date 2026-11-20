export type DeviceSyncStatus = "PENDING" | "ACTIVE" | "RETIRED" | "REVOKED";

/**
 * Single credential version entry in a terminal's monotonic credential lineage
 * (v1 -> v2 -> ...), returned in `credentialHistory` (issue #566).
 */
export interface TerminalCredentialVersion {
  id: string;
  version: number;
  status: DeviceSyncStatus;
  issuedAt: string;
  rotatedAt: string | null;
  revokedAt: string | null;
  revocationReason: string | null;
}

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
 * GET /identity/device-sync/terminals (B17-03, extended in #566 with
 * monotonic credential lineage).
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
  credentialHistory: TerminalCredentialVersion[];
}
