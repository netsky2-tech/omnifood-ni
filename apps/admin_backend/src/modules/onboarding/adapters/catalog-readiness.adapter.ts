import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { runInTenantTransaction } from '../../../core/database/tenant-transaction';
import {
  CatalogReadinessPort,
  CatalogReadinessResult,
} from '../ports/catalog-readiness.port';
import { Product } from '../../inventory/entities/product.entity';

@Injectable()
export class CatalogReadinessAdapter implements CatalogReadinessPort {
  constructor(
    // Issue #512 slice 1 part A: the `products` read rides the tenant-bound
    // transaction manager, never pooled repositories.
    private readonly dataSource: DataSource,
  ) {}

  async evaluateCatalogReadiness(
    tenantId: string,
  ): Promise<CatalogReadinessResult> {
    const sellableCount = await runInTenantTransaction(
      this.dataSource,
      tenantId,
      (manager) =>
        manager
          .getRepository(Product)
          .createQueryBuilder('product')
          .where('product.tenant_id = :tenantId', { tenantId })
          .andWhere('product.is_active = true')
          .andWhere('product.sellPrice > 0')
          .andWhere("product.name IS NOT NULL AND TRIM(product.name) != ''")
          .getCount(),
    );

    return {
      sellableProductCount: sellableCount,
      hasSellableProduct: sellableCount >= 1,
    };
  }
}
