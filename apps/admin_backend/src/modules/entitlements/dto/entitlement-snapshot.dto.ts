/**
 * ENT-02 — the versioned snapshot contract of `GET /api/tenant/entitlements`.
 *
 * Field list is frozen by `docs/plans/entitlements/catalogo_capacidades_v1.md`
 * (snapshot v1): adding a field is a contract change and needs `version: 2`,
 * because the POS caches this payload in SQLite and reads it offline.
 */
import type { SupportTier } from '../capability-registry';
import type { EntitlementStatus } from '../entitlement-resolution';

export interface EntitlementSnapshotDto {
  /** Snapshot contract version. Bumped only for breaking changes. */
  version: number;
  /** `null` when the tenant has no subscription at all (`sin_plan`). */
  planCode: string | null;
  status: EntitlementStatus;
  /** Service obligation (SLA). Deliberately NOT a capability key. */
  supportTier: SupportTier;
  /** Effective capability keys: the nucleus plus whatever the contract grants. */
  capabilities: string[];
  /** Every registered limit key, resolved. `null` means unlimited. */
  limits: Record<string, number | null>;
  /** Applied add-on codes, in catalog order. Prices are not part of the contract. */
  addOns: string[];
  /** ISO-8601 instant this snapshot was produced. */
  issuedAt: string;
  /** ISO-8601 instant after which a cached POS snapshot must be refreshed. */
  expiresAt: string;
}
