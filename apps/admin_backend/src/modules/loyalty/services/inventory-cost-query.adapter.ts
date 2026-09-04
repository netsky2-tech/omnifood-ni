import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../../inventory/entities/product.entity';
import {
  CostQueryResult,
  InventoryCostQueryPort,
} from '../domain/inventory-cost-query.port';

@Injectable()
export class TypeOrmInventoryCostQueryAdapter implements InventoryCostQueryPort {
  private readonly logger = new Logger(TypeOrmInventoryCostQueryAdapter.name);

  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
  ) {}

  async getCurrentEstimatedCostAndPrice(
    tenantId: string,
    productId: string,
    variantId?: string,
    branchId?: string,
  ): Promise<CostQueryResult> {
    if (!productId) {
      return {
        status: 'NOT_AVAILABLE',
        reason: 'PRODUCT_ID_REQUIRED',
      };
    }

    // Strictly read-only query filtered by tenantId
    const product = await this.productRepo.findOne({
      where: {
        id: productId,
        tenant_id: tenantId,
      },
    });

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
