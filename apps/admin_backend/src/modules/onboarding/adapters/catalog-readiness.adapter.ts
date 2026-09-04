import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CatalogReadinessPort,
  CatalogReadinessResult,
} from '../ports/catalog-readiness.port';
import { Product } from '../../inventory/entities/product.entity';

@Injectable()
export class CatalogReadinessAdapter implements CatalogReadinessPort {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  async evaluateCatalogReadiness(tenantId: string): Promise<CatalogReadinessResult> {
    const sellableCount = await this.productRepository
      .createQueryBuilder('product')
      .where('product.tenant_id = :tenantId', { tenantId })
      .andWhere('product.is_active = true')
      .andWhere('product.sellPrice > 0')
      .andWhere('product.name IS NOT NULL AND TRIM(product.name) != \'\'')
      .getCount();

    return {
      sellableProductCount: sellableCount,
      hasSellableProduct: sellableCount >= 1,
    };
  }
}
