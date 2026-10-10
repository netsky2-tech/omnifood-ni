import { api, type ApiClientMethodOptions } from "@/lib/api";
import type {
  DeviceFreshnessState,
  DeviceSyncStatus,
  TerminalDevice,
} from "./types";

const SYNC_STATUSES: readonly DeviceSyncStatus[] = [
  "PENDING",
  "ACTIVE",
  "RETIRED",
  "REVOKED",
];

const FRESHNESS_STATES: readonly string[] = [
  "COMPLETE",
  "STALE",
  "PARTIAL",
  "UNKNOWN",
  "PENDING",
];

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function toStatus(value: unknown): DeviceSyncStatus {
  // Fail closed to PENDING: an unrecognized wire value must never read as an
  // active/retired/revoked credential on the oversight dashboard.
  return SYNC_STATUSES.includes(value as DeviceSyncStatus)
    ? (value as DeviceSyncStatus)
    : "PENDING";
}

function toFreshnessState(value: unknown): DeviceFreshnessState {
  if (value === null) return null;
  if (typeof value === "string" && FRESHNESS_STATES.includes(value)) {
    return value as DeviceFreshnessState;
  }
  // Malformed wire value: no verdict exists, surface as UNKNOWN.
  return "UNKNOWN";
}

function toOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function toRequiredString(value: unknown): string {
  return typeof value === "string" && value.length > 0 ? value : "";
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toBoolean(value: unknown): boolean {
  return value === true;
}

/**
 * Wire normalization for a single terminal-device row. Defensive against
 * malformed payloads: unrecognized enum values fail closed (status → PENDING,
 * freshness → UNKNOWN) and malformed numbers/strings fall back to safe
 * defaults rather than throwing.
 */
export function normalizeTerminalDevice(raw: unknown): TerminalDevice {
  const r = asRecord(raw);
  return {
    terminalId: toRequiredString(r.terminalId),
    label: toOptionalString(r.label),
    credentialId: toRequiredString(r.credentialId),
    credentialVersion: toNumber(r.credentialVersion, 0),
    status: toStatus(r.status),
    issuedAt: toRequiredString(r.issuedAt),
    expiresAt: toRequiredString(r.expiresAt),
    revokedAt: toOptionalString(r.revokedAt),
    revocationReason: toOptionalString(r.revocationReason),
    posBuild: toOptionalString(r.posBuild),
    freshnessState: toFreshnessState(r.freshnessState),
    acceptedThroughSequence: toNullableNumber(r.acceptedThroughSequence),
    lastReceiptAt: toOptionalString(r.lastReceiptAt),
    hasDeclaredGaps: toBoolean(r.hasDeclaredGaps),
    hasInventoryPending: toBoolean(r.hasInventoryPending),
    inventoryPendingCount: toNumber(r.inventoryPendingCount, 0),
  };
}

/**
 * Terminal device credentials + sync-health snapshot
 * (GET /identity/device-sync/terminals, B17-03).
 */
export async function fetchDevices(
  options?: { signal?: AbortSignal } & ApiClientMethodOptions,
): Promise<TerminalDevice[]> {
  const raw = await api.get<unknown>("/identity/device-sync/terminals", options);
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map(normalizeTerminalDevice);
}

/**
 * Revoke a terminal device credential (POST /identity/device-sync/credentials/
 * {credentialId}/revoke, B17-04). The backend tombstones the credential so DGI
 * receipt sequencing stays auditable; revocation is never a delete.
 */
export async function revokeDevice(
  credentialId: string,
  reason: string,
): Promise<TerminalDevice> {
  const raw = await api.post<unknown>(
    `/identity/device-sync/credentials/${encodeURIComponent(credentialId)}/revoke`,
    { reason },
  );
  return normalizeTerminalDevice(raw);
}
