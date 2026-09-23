import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Product } from '../../inventory/entities/product.entity';
import {
  CostQueryResult,
  InventoryCostQueryPort,
} from '../domain/inventory-cost-query.port';
import { runInTenantTransaction } from '../../../core/database/tenant-transaction';

@Injectable()
export class TypeOrmInventoryCostQueryAdapter implements InventoryCostQueryPort {
  private readonly logger = new Logger(TypeOrmInventoryCostQueryAdapter.name);

  constructor(
    // Issue #512 slice 1 part A: the `products` read resolves its repository
    // from the tenant-bound transaction manager, never pooled repositories.
    private readonly dataSource: DataSource,
  ) {}

  async getCurrentEstimatedCostAndPrice(
    tenantId: string,
    productId: string,
  ): Promise<CostQueryResult> {
    if (!productId) {
      return {
        status: 'NOT_AVAILABLE',
        reason: 'PRODUCT_ID_REQUIRED',
      };
    }

    // Preserve the pre-binding not-found semantics for a blank tenant id:
    // no product matches, so the port reports PRODUCT_NOT_FOUND instead of
    // failing with a tenant-context error.
    if (!tenantId?.trim()) {
      return {
        status: 'NOT_AVAILABLE',
        reason: 'PRODUCT_NOT_FOUND',
      };
    }

    // Strictly read-only query filtered by tenantId, issued on a
    // tenant-bound transaction (issue #512 slice 1 part A): the binding is
    // transaction-local and happens before the first access.
    const product = await runInTenantTransaction(
      this.dataSource,
      tenantId,
      (manager) =>
        manager.getRepository(Product).findOne({
          where: {
            id: productId,
            tenant_id: tenantId,
          },
        }),
    );

    if (!product) {
      return {
        status: 'NOT_AVAILABLE',
        reason: 'PRODUCT_NOT_FOUND',
      };
    }

    const sellPrice = Number(product.sellPrice ?? 0);
    const averageCost = Number(product.averageCost ?? 0);

    const canonicalBasePriceNio = sellPrice > 0 ? sellPrice : undefined;
    const estimatedCppNio = averageCost >= 0 ? averageCost : undefined;

    if (estimatedCppNio === undefined) {
      return {
        status: 'NOT_AVAILABLE',
        canonicalBasePriceNio,
        reason: 'COST_NOT_RESOLVABLE',
      };
    }

    return {
      status: 'AVAILABLE',
      canonicalBasePriceNio,
      estimatedCppNio,
    };
  }
}
