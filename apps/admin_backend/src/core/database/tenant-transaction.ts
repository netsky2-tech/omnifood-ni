import { DataSource, EntityManager, QueryRunner } from 'typeorm';

/**
 * Transaction-local PostgreSQL tenant context binding for RLS-protected tables.
 *
 * `set_config(key, value, is_local => true)` scopes the setting to the current
 * transaction; PostgreSQL discards it on commit or rollback. Never use
 * session-scoped configuration: pooled connections would leak tenant context
 * across requests and tenants.
 */
export const TENANT_CONTEXT_CONFIG_KEY = 'app.tenant_id';

/**
 * Exact SQL used to bind the tenant context. The tenant id is always passed as
 * a bound query parameter ($1) and is never interpolated into the SQL text.
 */
export const TENANT_CONTEXT_SET_CONFIG_SQL =
  "SELECT set_config('app.tenant_id', $1, true)";

/**
 * Raised when tenant binding is attempted without a usable tenant id.
 * No SQL is ever issued for a blank tenant id.
 */
export class TenantContextRequiredError extends Error {
  constructor() {
    super(
      'TENANT_CONTEXT_REQUIRED: a non-blank tenantId is required to bind transaction context',
    );
    this.name = 'TenantContextRequiredError';
  }
}

/**
 * Validates and trims the tenant id used for transaction-local binding.
 * Throws before any SQL is issued when the id is blank.
 */
export function resolveTenantContextId(tenantId: string): string {
  const trimmed = tenantId?.trim();
  if (!trimmed) {
    throw new TenantContextRequiredError();
  }
  return trimmed;
}

/**
 * Binds the tenant id on the given transactional executor so RLS policies
 * using `current_setting('app.tenant_id', true)` authorize subsequent queries.
 * Must be awaited before any repository access on the same executor.
 *
 * The parameter accepts an `EntityManager` or a `QueryRunner`: several call
 * sites already hold the transaction's `QueryRunner` (not its manager), and
 * both expose the same parameterised `query(sql, parameters)` surface, so the
 * guard must be reachable from either shape. Type safety is preserved: the
 * union still compiles only against objects exposing that exact method, and
 * the tenant id remains a bound parameter in every case.
 */
export async function bindTenantContext(
  executor: EntityManager | QueryRunner,
  tenantId: string,
): Promise<void> {
  const trimmed = resolveTenantContextId(tenantId);
  await executor.query(TENANT_CONTEXT_SET_CONFIG_SQL, [trimmed]);
}

/**
 * Opens a DataSource transaction, binds the tenant context on the
 * transaction's manager, and only then runs the work callback with that
 * manager. The binding is transaction-local: it disappears with the
 * transaction, so every tenant-bound transaction must bind exactly once at
 * its beginning.
 */
export async function runInTenantTransaction<T>(
  dataSource: DataSource,
  tenantId: string,
  work: (manager: EntityManager) => Promise<T>,
): Promise<T> {
  // Fail fast on a blank tenant id before a connection is borrowed.
  const trimmed = resolveTenantContextId(tenantId);
  return dataSource.transaction(async (manager) => {
    await bindTenantContext(manager, trimmed);
    return work(manager);
  });
}
