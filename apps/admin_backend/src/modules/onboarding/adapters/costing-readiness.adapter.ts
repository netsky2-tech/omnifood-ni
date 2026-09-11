import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CostingReadinessPort,
  CostingReadinessResult,
  ProductCostItem,
} from '../ports/costing-readiness.port';
import { Product } from '../../inventory/entities/product.entity';
import { InventoryMovement } from '../../inventory/entities/inventory-movement.entity';

@Injectable()
export class CostingReadinessAdapter implements CostingReadinessPort {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(InventoryMovement)
    private readonly movementRepository: Repository<InventoryMovement>,
  ) {}

  async evaluateCostingReadiness(
    tenantId: string,
  ): Promise<CostingReadinessResult> {
    const trimmedTenant = tenantId?.trim();
    if (!trimmedTenant) {
      return {
        costingReady: false,
        totalProducts: 0,
        knownCostCount: 0,
        pendingCostCount: 0,
        notApplicableCount: 0,
        items: [],
      };
    }

    const products = await this.productRepository.find({
      where: {
        tenant_id: trimmedTenant,
        is_active: true,
      },
      order: {
        created_at: 'ASC',
      },
    });

    const items: ProductCostItem[] = [];
    let knownCostCount = 0;
    let pendingCostCount = 0;
    let notApplicableCount = 0;

    for (const prod of products) {
      const categoryCode = prod.category_code?.toUpperCase()?.trim();
      const isService =
        categoryCode === 'SERVICIOS' ||
        categoryCode === 'SERVICES' ||
        categoryCode === 'SERVICIO';

      if (isService) {
        notApplicableCount++;
        items.push({
          productId: prod.id,
          productName: prod.name,
          state: 'NOT_APPLICABLE',
          reason: 'SERVICE_OR_NON_INVENTORIABLE',
          provenance: 'NONE',
        });
        continue;
      }

      const averageCost = Number(prod.averageCost ?? 0);

      if (averageCost > 0) {
        knownCostCount++;
        items.push({
          productId: prod.id,
          productName: prod.name,
          state: 'KNOWN',
          value: averageCost,
          provenance: 'MANUAL_INITIAL_PROVENANCE',
        });
      } else {
        // averageCost = 0: check if there is verifiable zero-cost inventory provenance in Kardex
        // AC-08: averageCost = 0 physical does not imply KNOWN(0) without provenance
        pendingCostCount++;
        items.push({
          productId: prod.id,
          productName: prod.name,
          state: 'COST_PENDING',
          reason: 'ZERO_COST_WITHOUT_INVENTORY_PROVENANCE',
          provenance: 'NONE',
        });
      }
    }

    const costingReady = products.length > 0 && pendingCostCount === 0;

    return {
      costingReady,
      totalProducts: products.length,
      knownCostCount,
      pendingCostCount,
      notApplicableCount,
      items,
    };
  }
}
