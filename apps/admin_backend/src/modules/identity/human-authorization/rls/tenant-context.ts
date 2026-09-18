import { BadRequestException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

/**
 * Reusable RLS tenant-context binding (design §4.1 rule 6, §11.2 decision 19).
 *
 * Extracted from OhacTenantTransaction so any OHAC path that already holds a
 * transaction manager can bind Row Level Security with the exact same
 * validation and error behaviour the transaction seam has always had.
 */

/**
 * Validates a tenant id for RLS binding and marker writes: a non-empty,
 * non-whitespace string is required. Returns the trimmed tenant id.
 * Rejections throw before any statement is issued, so a caller can never
 * bind or mark without a tenant.
 */
export function requireTenantId(tenantId: unknown): string {
  if (typeof tenantId !== 'string' || tenantId.trim().length === 0) {
    throw new BadRequestException(
      'A non-empty tenant id is required to bind the RLS tenant context',
    );
  }
  return tenantId.trim();
}

/**
 * Binds the RLS tenant context on the given manager by issuing
 * set_config('app.tenant_id', $1, true) with the tenant bound as a query
 * parameter, never interpolated. The caller owns the transaction: this
 * function runs on whatever manager it receives and never opens its own.
 * A binding failure propagates — it is never swallowed, so work can never
 * run without a tenant scope.
 */
export async function bindRlsTenantContext(
  manager: EntityManager,
  tenantId: unknown,
): Promise<void> {
  const tenant = requireTenantId(tenantId);
  await manager.query("SELECT set_config('app.tenant_id', $1, true)", [tenant]);
}
