import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

/**
 * RLS-bound tenant transaction seam for the OHAC module.
 *
 * This seam exists because design §16.2 requires the new inbound epoch path to
 * bind Row Level Security in its own explicit transaction, issuing
 * set_config('app.tenant_id', $1, true) before any epoch or verifier read.
 * The anti-pattern it avoids is issuing set_config outside an explicit
 * transaction and swallowing its failure in a try/catch with logger.debug
 * (InboundSyncService.fetchProductDeltas), which lets queries run unscoped.
 */
@Injectable()
export class OhacTenantTransaction {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Opens its own transaction, binds the RLS tenant context as the first
   * statement, then runs the work callback on the transaction manager.
   * The tenant value is bound as a query parameter, never interpolated.
   * A binding failure aborts the transaction and propagates: it is never
   * swallowed, so work can never run without a tenant scope.
   * Returns the callback result unchanged.
   */
  async run<T>(
    tenantId: unknown,
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    if (typeof tenantId !== 'string' || tenantId.trim().length === 0) {
      throw new BadRequestException(
        'A non-empty tenant id is required to bind the RLS tenant context',
      );
    }

    return await this.dataSource.transaction(async (manager) => {
      await manager.query("SELECT set_config('app.tenant_id', $1, true)", [
        tenantId.trim(),
      ]);
      return await work(manager);
    });
  }
}
