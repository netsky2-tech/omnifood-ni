import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { runInTenantTransaction } from '../../../core/database/tenant-transaction';
import {
  CostCalculatorService,
  type RecipeTheoreticalCostResult,
} from '../cost-calculator.service';
import { RecipeService } from '../recipe.service';
import { Product, ProductType } from '../entities/product.entity';
import { Insumo } from '../entities/insumo.entity';
import type { RecipeDetail } from '../entities/recipe-detail.entity';

const MAX_SUB_RECIPE_DEPTH = 5;

export interface DishMargin {
  productId: string;
  productName: string;
  recipeVersionId: string;
  yieldQuantity: number;
  sellingPriceNio: number | null;
  unitTheoreticalCostNio: number;
  grossMarginNio: number | null;
  grossMarginPct: number | null;
  components: RecipeTheoreticalCostResult['components'];
}

export interface DishMarginSkip {
  productId: string;
  productName: string;
  reason: string;
}

export interface DishMarginsResult {
  dishes: DishMargin[];
  /** Products that could not be priced, with the reason — never silently dropped. */
  skipped: DishMarginSkip[];
}

/**
 * R8 (H8): the human surface the theoretical cost never had.
 *
 * `CostCalculatorService.calculateRecipeTheoreticalCost` (batch cost, unit
 * theoretical cost, gross margin Nio/%, per-component breakdown) existed with
 * ZERO callers, and the dashboard showed only an AGGREGATE gross margin. This
 * service turns a product's active published recipe plus its components'
 * current CPPs into the per-dish theoretical cost and gross margin, and rolls
 * a SUB_RECIPE component up through its own recipe (with cycle/depth guards,
 * like the quantity explosion).
 */
@Injectable()
export class TheoreticalCostService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly recipeService: RecipeService,
    private readonly costCalculator: CostCalculatorService,
  ) {}

  async getProductTheoreticalCost(
    tenantId: string,
    productId: string,
  ): Promise<DishMargin> {
    return this.computeProduct(tenantId, productId, new Set<string>(), 0);
  }

  async listDishMargins(tenantId: string): Promise<DishMarginsResult> {
    const products = await runInTenantTransaction(
      this.dataSource,
      tenantId,
      (manager) =>
        manager.getRepository(Product).find({
          where: { tenant_id: tenantId, product_type: ProductType.COMPOUND },
          order: { name: 'ASC' },
        }),
    );

    const preparedProducts = await runInTenantTransaction(
      this.dataSource,
      tenantId,
      (manager) =>
        manager.getRepository(Product).find({
          where: { tenant_id: tenantId, product_type: ProductType.PREPARED },
          order: { name: 'ASC' },
        }),
    );

    const dishes: DishMargin[] = [];
    const skipped: DishMarginSkip[] = [];

    for (const product of [...products, ...preparedProducts]) {
      try {
        dishes.push(await this.getProductTheoreticalCost(tenantId, product.id));
      } catch (error) {
        skipped.push({
          productId: product.id,
          productName: product.name,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { dishes, skipped };
  }

  private async computeProduct(
    tenantId: string,
    productId: string,
    visited: Set<string>,
    depth: number,
  ): Promise<DishMargin> {
    if (visited.has(productId)) {
      throw new BadRequestException(
        `Circular sub-recipe reference detected at product ${productId}`,
      );
    }
    if (depth > MAX_SUB_RECIPE_DEPTH) {
      throw new BadRequestException(
        `Sub-recipe nesting too deep (max ${MAX_SUB_RECIPE_DEPTH}) at product ${productId}`,
      );
    }

    const nextVisited = new Set(visited).add(productId);

    const product = await runInTenantTransaction(
      this.dataSource,
      tenantId,
      (manager) =>
        manager.getRepository(Product).findOne({
          where: { id: productId, tenant_id: tenantId },
        }),
    );
    if (!product) {
      throw new NotFoundException(`Product ${productId} not found`);
    }

    const version = await this.recipeService.findActiveVersion(
      tenantId,
      productId,
    );
    if (!version) {
      throw new NotFoundException(
        `Product ${productId} does not have an active published recipe`,
      );
    }

    const { components } = await this.recipeService.getSnapshot(
      version.id,
      tenantId,
      productId,
    );

    const priced = await this.priceComponents(
      tenantId,
      components,
      nextVisited,
      depth,
    );

    const sellingPriceNio = Number(product.sellPrice ?? 0);
    const theoretical = this.costCalculator.calculateRecipeTheoreticalCost({
      yieldQuantity: Number(version.yield_quantity ?? 1) || 1,
      sellingPriceNio: sellingPriceNio > 0 ? sellingPriceNio : undefined,
      components: priced,
    });

    return {
      productId,
      productName: product.name,
      recipeVersionId: version.id,
      yieldQuantity: theoretical.yieldQuantity,
      sellingPriceNio: sellingPriceNio > 0 ? sellingPriceNio : null,
      unitTheoreticalCostNio: theoretical.unitTheoreticalCostNio,
      grossMarginNio: theoretical.grossMarginNio ?? null,
      grossMarginPct: theoretical.grossMarginPct ?? null,
      components: theoretical.components,
    };
  }

  private async priceComponents(
    tenantId: string,
    components: RecipeDetail[],
    visited: Set<string>,
    depth: number,
  ): Promise<RecipeTheoreticalCostResult['components']> {
    const priced: RecipeTheoreticalCostResult['components'] = [];

    for (const component of components) {
      const grossQuantity = Number(component.gross_quantity);
      const technicalShrinkPct = Number(component.technical_shrink_pct ?? 0);

      if (component.ingredient_type === 'SUB_RECIPE') {
        const sub = await this.computeProduct(
          tenantId,
          component.insumo_id,
          visited,
          depth + 1,
        );
        priced.push({
          ingredientId: component.insumo_id,
          ingredientName: component.ingredient_name ?? undefined,
          ingredientType: 'SUB_RECIPE',
          grossQuantity,
          technicalShrinkPct,
          // One unit of the sub-recipe carries its own theoretical unit cost.
          unitCostNio: sub.unitTheoreticalCostNio,
          totalCostNio: Number(
            (grossQuantity * sub.unitTheoreticalCostNio).toFixed(4),
          ),
          costPercentage: 0,
        });
        continue;
      }

      const insumo = await runInTenantTransaction(
        this.dataSource,
        tenantId,
        (manager) =>
          manager
            .getRepository(Insumo)
            .findOne({ where: { id: component.insumo_id, tenant_id: tenantId } }),
      );
      if (!insumo) {
        throw new NotFoundException(
          `Insumo ${component.insumo_id} not found for tenant ${tenantId}`,
        );
      }

      const unitCostNio = Number(insumo.averageCost ?? 0);
      priced.push({
        ingredientId: component.insumo_id,
        ingredientName: component.ingredient_name ?? insumo.name,
        ingredientType: component.ingredient_type,
        grossQuantity,
        technicalShrinkPct,
        unitCostNio,
        totalCostNio: Number((grossQuantity * unitCostNio).toFixed(4)),
        costPercentage: 0,
      });
    }

    return priced;
  }
}
