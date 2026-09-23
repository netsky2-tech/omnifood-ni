import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
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
import { runInTenantTransaction } from '../../../core/database/tenant-transaction';

@Injectable()
export class OperationsReadinessAdapter implements OperationsReadinessPort {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RecipeVersion)
    private readonly recipeVersionRepository: Repository<RecipeVersion>,
    @InjectRepository(Supplier)
    // Issue #512 slice 3: the suppliers readiness count now resolves from
    // the tenant-bound transaction manager; the pooled injection stays so
    // the constructor signature (and the module wiring) is untouched, the
    // slice-2 precedent for the unused recipe_versions injection.
    private readonly supplierRepository: Repository<Supplier>,
    // Issue #512 slice 1 part A: the `products` categories read resolves its
    // repository from the tenant-bound transaction manager.
    private readonly dataSource: DataSource,
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

    // Issue #512 slice 2 part A: the recipe_versions readiness count reads
    // through the tenant-bound transaction manager (same transaction as the
    // categories read). Under FORCE RLS an unbound pooled read fails closed
    // (zero rows / error), it is not a cross-tenant leak.
    // Issue #512 slice 3 part A: the supplier count joins the same bound
    // transaction, so the `suppliers` FORCE RLS policies see the tenant
    // GUC instead of failing closed on a pooled read.
    const { publishedRecipeCount, categoryCount, supplierCount } =
      await runInTenantTransaction(
        this.dataSource,
        trimmedTenant,
        async (manager) => {
          const publishedRecipeCount = await manager
            .getRepository(RecipeVersion)
            .count({
              where: {
                tenant_id: trimmedTenant,
                publication_state: RecipePublicationState.PUBLISHED,
                is_active: true,
              },
            });

          const categoriesRaw = await manager
            .getRepository(Product)
            .createQueryBuilder('product')
            .select('DISTINCT product.category_code', 'category_code')
            .where('product.tenant_id = :tenantId', { tenantId: trimmedTenant })
            .andWhere(
              "product.category_code IS NOT NULL AND TRIM(product.category_code) != ''",
            )
            .getRawMany();

          const supplierCount = await manager.getRepository(Supplier).count({
            where: { tenant_id: trimmedTenant, is_active: true },
          });

          return {
            publishedRecipeCount,
            categoryCount: categoriesRaw.length,
            supplierCount,
          };
        },
      );

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
