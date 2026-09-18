import type { EntityManager } from 'typeorm';
import type { StaffPolicySourceRecord } from '../projection/policy-entries';

export const STAFF_POLICY_COHORT_DECISION = {
  ELIGIBLE: 'ELIGIBLE',
  DISABLED: 'DISABLED',
} as const;

export type StaffPolicyCohortDecision =
  (typeof STAFF_POLICY_COHORT_DECISION)[keyof typeof STAFF_POLICY_COHORT_DECISION];

interface SourceRow {
  readonly id: string;
  readonly role: string;
  readonly is_active: boolean;
  readonly attempt_reset_generation: string;
  readonly pin_hash: string | null;
  readonly custom_permissions: unknown;
}

/**
 * Tenant-scoped source reads for the staff-policy snapshot publisher
 * (design §11.2 decision 13). Extracted from the publisher so the
 * publication mechanism and the source access path can be reviewed and
 * tested as separate units.
 */

/**
 * Loads the tenant's staff records as the projector's source shape.
 *
 * `users` and `security_profiles` have no RLS, so the tenant predicate is
 * explicit and cast: `users.tenant_id` is uuid while the OHAC tables are
 * varchar. LEFT JOIN (not INNER JOIN) so a user with no security profile
 * maps to a null pin hash instead of being silently dropped, and the
 * projection — not the query — decides what a missing profile means.
 * Every value is bound as a parameter; nothing is interpolated.
 */
export async function readStaffPolicySourceRecords(
  manager: EntityManager,
  tenantId: string,
): Promise<StaffPolicySourceRecord[]> {
  const rows: SourceRow[] = await manager.query(
    `SELECT u.id, u.role, u.is_active, u.attempt_reset_generation,
            sp.pin_hash, sp.custom_permissions
       FROM users u
       LEFT JOIN security_profiles sp ON sp.user_id = u.id
      WHERE u.tenant_id = $1::uuid`,
    [tenantId],
  );
  return rows.map((row) => ({
    userId: String(row.id),
    role: String(row.role),
    isActive: row.is_active === true,
    pinHash: row.pin_hash ?? null,
    attemptResetGeneration: String(row.attempt_reset_generation),
    // The column is text[] NOT NULL in DDL, but a defensive non-array value
    // or a missing profile maps to null rather than an invented permission.
    customPermissions: Array.isArray(row.custom_permissions)
      ? row.custom_permissions.map(String)
      : null,
  }));
}

/**
 * Resolves the tenant-level cohort decision (design §4.1 rule 2, §11.2
 * decision 17): ELIGIBLE only when an enabled cohort row matches the tenant
 * and the publisher's own backend build. The exact POS/backend build pair
 * stays a pull-time check, because targetPosBuild is only negotiated on the
 * terminal's pull and cannot be known at publication time.
 */
export async function resolveTenantCohortDecision(
  manager: EntityManager,
  tenantId: string,
  publisherBackendBuild: string,
): Promise<StaffPolicyCohortDecision> {
  const rows: unknown[] = await manager.query(
    'SELECT 1 FROM human_auth_rollout_cohorts WHERE tenant_id = $1 AND enabled = TRUE AND backend_build = $2 LIMIT 1',
    [tenantId, publisherBackendBuild],
  );
  return rows.length > 0
    ? STAFF_POLICY_COHORT_DECISION.ELIGIBLE
    : STAFF_POLICY_COHORT_DECISION.DISABLED;
}
