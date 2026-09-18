import type { EntityManager } from 'typeorm';
import { requireTenantId } from '../rls/tenant-context';

/**
 * Shape of one marker row as handed to readers: the dirty flag plus the
 * revision the publisher holds for its compare-and-set clear.
 */
export interface TenantPublicationMarkerRow {
  readonly dirty: boolean;
  readonly revision: string;
}

/**
 * Reads the tenant's marker row, materializing it when absent, and returns
 * the current dirty/revision pair.
 *
 * Caller contract: the caller must have bound `app.tenant_id` on this SAME
 * manager inside the caller's transaction first (see bindRlsTenantContext),
 * before calling this function. The marker table has FORCED row-level
 * security, so an unbound call raises a row-level-security violation; that
 * error aborts the caller's transaction, rolling it back together with the
 * mutation. That coupling is the intended all-or-nothing behaviour of
 * design §11.2 decision 16, not a defect to defend against here.
 *
 * Why a read-then-insert is unsafe here: the mutation path
 * (markTenantPublicationDirty) also inserts marker rows and does not hold
 * the publisher's advisory lock, so a plain SELECT-then-INSERT can race a
 * concurrent mark between its two statements and raise a unique violation
 * (23505) that aborts publication. This function therefore materializes
 * with a single parameterized upsert whose conflict branch is a deliberate
 * no-op — it only re-assigns updated_at to its stored value and never
 * touches dirty, revision, marked_at, or tenant_id — so a concurrent insert
 * can never raise a unique violation and RETURNING always hands the reader
 * exactly one row: the materialized defaults (dirty = TRUE, revision 1,
 * satisfying the migration's revision >= 1 check) when the row was absent,
 * or the stored row when present.
 */
export async function readOrMaterializeMarker(
  manager: EntityManager,
  tenantId: unknown,
): Promise<TenantPublicationMarkerRow> {
  const tenant = requireTenantId(tenantId);
  const rows: TenantPublicationMarkerRow[] = await manager.query(
    `INSERT INTO human_auth_tenant_publication_state
       (tenant_id, dirty, revision, marked_at, updated_at)
     VALUES ($1, TRUE, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (tenant_id) DO UPDATE SET
       updated_at = human_auth_tenant_publication_state.updated_at
     RETURNING dirty, revision`,
    [tenant],
  );
  return rows[0];
}

/**
 * Marks a tenant's publication state dirty inside the caller's transaction
 * (design §11.2 decision 16): a staff/profile mutation and its publication
 * signal commit or roll back together, so a committed mutation can never be
 * left without a pending-publication marker.
 *
 * Caller contract: the caller must have bound `app.tenant_id` on this SAME
 * manager inside the caller's transaction first (see bindRlsTenantContext),
 * before calling this function. The marker table has FORCED row-level
 * security, so an unbound call raises a row-level-security violation; that
 * error aborts the caller's transaction, rolling it back together with the
 * mutation. That coupling is the intended all-or-nothing behaviour of
 * decision 16: a mutation whose signal cannot be persisted never commits.
 *
 * Framework-thin by design: a plain function over the caller's EntityManager,
 * so identity services call it without new dependency injection.
 */

/**
 * Materializes the tenant's marker row when absent and otherwise sets
 * dirty = TRUE, increments revision, and stamps marked_at/updated_at, in one
 * parameterized upsert on tenant_id. The tenant is bound as a query
 * parameter, never interpolated, and the update branch derives the new
 * revision from the stored one so the statement can never regress it (the
 * migration's BEFORE UPDATE trigger rejects regression outright).
 *
 * The revision is incremented rather than left alone because the serialized
 * publisher holds the revision it read for its compare-and-set: bumping the
 * revision is exactly what makes that CAS fail, so a publisher cannot clear
 * a signal newer than the epoch it published.
 *
 * Marking is deliberately safe to over-apply: a spurious dirty flag only
 * leads the publisher through a replay-identical publication that clears the
 * marker, whereas under-marking silently leaves the published policy stale.
 * That is why the mutation path calls this unconditionally instead of
 * diffing policy fields.
 */
export async function markTenantPublicationDirty(
  manager: EntityManager,
  tenantId: unknown,
): Promise<void> {
  const tenant = requireTenantId(tenantId);
  await manager.query(
    `INSERT INTO human_auth_tenant_publication_state
       (tenant_id, dirty, revision, marked_at, updated_at)
     VALUES ($1, TRUE, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (tenant_id) DO UPDATE SET
       dirty = TRUE,
       revision = human_auth_tenant_publication_state.revision + 1,
       marked_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP`,
    [tenant],
  );
}
