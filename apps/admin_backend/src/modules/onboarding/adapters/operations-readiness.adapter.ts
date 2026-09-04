import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  OperationsReadinessPort,
  OperationsReadinessResult,
} from '../ports/operations-readiness.port';
import { User } from '../../identity/entities/user.entity';
import {
  RecipeVersion,
  RecipePublicationState,
} from '../../inventory/entities/recipe-version.entity';
import { Supplier } from '../../inventory/entities/supplier.entity';
import { Product } from '../../inventory/entities/product.entity';

@Injectable()
export class OperationsReadinessAdapter implements OperationsReadinessPort {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RecipeVersion)
    private readonly recipeVersionRepository: Repository<RecipeVersion>,
    @InjectRepository(Supplier)
    private readonly supplierRepository: Repository<Supplier>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  async evaluateOperationsReadiness(
    tenantId: string,
  ): Promise<OperationsReadinessResult> {
    const trimmedTenant = tenantId?.trim();
    if (!trimmedTenant) {
      return {
        operationsReady: false,
        staffCount: 0,
        additionalStaffCount: 0,
        publishedRecipeCount: 0,
        supplierCount: 0,
        categoryCount: 0,
        details: {
          hasAdditionalStaff: false,
          hasPublishedRecipes: false,
          hasSuppliers: false,
          hasCategories: false,
        },
        notes: ['Tenant context is empty or invalid'],
      };
    }

    const staffCount = await this.userRepository.count({
      where: { tenant_id: trimmedTenant, is_active: true },
    });
    const additionalStaffCount = Math.max(0, staffCount - 1);

    const publishedRecipeCount = await this.recipeVersionRepository.count({
      where: {
        tenant_id: trimmedTenant,
        publication_state: RecipePublicationState.PUBLISHED,
        is_active: true,
      },
    });

    const supplierCount = await this.supplierRepository.count({
      where: { tenant_id: trimmedTenant, is_active: true },
    });

    const categoriesRaw = await this.productRepository
      .createQueryBuilder('product')
      .select('DISTINCT product.category_code', 'category_code')
      .where('product.tenant_id = :tenantId', { tenantId: trimmedTenant })
      .andWhere(
        "product.category_code IS NOT NULL AND TRIM(product.category_code) != ''",
      )
      .getRawMany();

    const categoryCount = categoriesRaw.length;

    const details = {
      hasAdditionalStaff: additionalStaffCount > 0,
      hasPublishedRecipes: publishedRecipeCount > 0,
      hasSuppliers: supplierCount > 0,
      hasCategories: categoryCount > 0,
    };

    // Operations readiness is achieved when post-activation enrichment has started
    const operationsReady =
      details.hasAdditionalStaff ||
      details.hasPublishedRecipes ||
      details.hasSuppliers ||
      details.hasCategories;

    const notes: string[] = [];
    if (!details.hasAdditionalStaff) {
      notes.push('INITIAL_OWNER_ONLY_STAFF_OPTIONAL');
    }
    if (!details.hasPublishedRecipes) {
      notes.push('RECIPES_POSTPONED_OPTIONAL');
    }

    return {
      operationsReady,
      staffCount,
      additionalStaffCount,
      publishedRecipeCount,
      supplierCount,
      categoryCount,
      details,
      notes,
    };
  }
}
