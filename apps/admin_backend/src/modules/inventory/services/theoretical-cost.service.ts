import {
  BadRequestException,
  Injectable,
  Logger,
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
import { MovementType } from '../entities/inventory-movement.entity';
import type { RecipeDetail } from '../entities/recipe-detail.entity';

const MAX_SUB_RECIPE_DEPTH = 5;

/** The four-decimal scale the costs are kept at (NUMERIC(14,4)). */
const round4 = (value: number): number => Number(value.toFixed(4));

/**
 * Machine code of a skipped dish. The code is the contract; the `reason` is
 * operator copy. Nhilos backoffice experience standard AP-10 forbids a raw
 * technical error as the primary explanation, §39.4 forbids implementation
 * vocabulary, and §30.3 keeps raw ids in a support detail instead of the
 * surface — so the wire error message never becomes the reason an operator
 * reads.
 */
export type DishMarginSkipCode =
  | 'NO_ACTIVE_RECIPE'
  | 'SUB_RECIPE_NO_ACTIVE_RECIPE'
  | 'MISSING_COMPONENT'
  | 'CIRCULAR_SUB_RECIPE'
  | 'NESTING_TOO_DEEP'
  | 'UNEXPECTED';

/**
 * A pricing gap with its own code and its own operator copy. Two families
 * keep the HTTP semantics the single-dish route already had: the missing
 * recipe/component class answers 404 (`SkipNotFound`) and the recipe-graph
 * class answers 400 (`SkipBadRequest`). The list route reads `code`, never the
 * message.
 */
class SkipNotFound extends NotFoundException {
  constructor(
    readonly code: DishMarginSkipCode,
    message: string,
  ) {
    super(message);
  }
}

class SkipBadRequest extends BadRequestException {
  constructor(
    readonly code: DishMarginSkipCode,
    message: string,
  ) {
    super(message);
  }
}

type DishMarginSkipError = SkipNotFound | SkipBadRequest;

const isSkipError = (error: unknown): error is DishMarginSkipError =>
  (error instanceof SkipNotFound || error instanceof SkipBadRequest) &&
  typeof error.code === 'string';

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
  /**
   * R28 / M5 — the SECOND figure: what the dish actually cost when it was
   * sold in the period, per unit.
   *
   * It is a FACT read from the kardex (the movements' cost at the moment they
   * happened), while `unitTheoreticalCostNio` is an ESTIMATE computed with
   * the components' CURRENT CPPs. The two differ when the extras consumed
   * stock the recipe does not declare (the almond milk that replaced the
   * whole milk, the extra shot of coffee) and when the CPPs moved since the
   * recipe was written.
   *
   * NULL when the dish was not sold in the period: "no sales" is not "zero
   * cost" (§27, AP-02).
   */
  unitsSold: number | null;
  unitActualCostNio: number | null;
  actualCostNio: number | null;
  /**
   * The gap between the two figures, per unit. It is POSITIVE when the dish
   * cost more than the recipe says (the extras, or a CPP that moved).
   */
  costGapNio: number | null;
}

export interface DishMarginSkip {
  productId: string;
  productName: string;
  /** Machine code of the gap — the contract the UI maps over. */
  reasonCode: DishMarginSkipCode;
  /** Operator copy: calm Spanish, names things, never a raw id or wire error. */
  reason: string;
}

export interface DishMarginsResult {
  dishes: DishMargin[];
  /** Products that could not be priced, with the reason — never silently dropped. */
  skipped: DishMarginSkip[];
  /**
   * R28 / M5 — the aggregate of the two figures over the period.
   *
   * `extrasImpactNio` is the headline the industry surfaces ("Modifiers
   * added $1,140 of food cost"): what the period's sales cost MINUS what
   * the recipes said they would cost. It carries BOTH the extras' effect and
   * the CPP drift, and the surface says so — the difference between a recipe
   * written today and the stock that left the shop is never attributable to
   * one cause alone.
   */
  period: { from: string | null; to: string | null };
  unitsSold: number;
  totalActualCostNio: number;
  totalTheoreticalCostNio: number;
  extrasImpactNio: number;
  extrasImpactPct: number | null;
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
  private readonly logger = new Logger(TheoreticalCostService.name);

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

  async listDishMargins(
    tenantId: string,
    period?: { from?: string; to?: string },
  ): Promise<DishMarginsResult> {
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
        const message = error instanceof Error ? error.message : String(error);
        if (isSkipError(error)) {
          skipped.push({
            productId: product.id,
            productName: product.name,
            reasonCode: error.code,
            reason: error.message,
          });
          continue;
        }
        // Technical detail stays in the log (§30.3); the surface gets a calm,
        // generic sentence that never leaks an id or a wire error (AP-10).
        this.logger.warn(
          `Dish margin skipped for product ${product.id} (${product.name}): ${message}`,
        );
        skipped.push({
          productId: product.id,
          productName: product.name,
          reasonCode: 'UNEXPECTED',
          reason:
            'No se pudo calcular el costo de este plato. Revise su receta.',
        });
      }
    }

    // R28 / M5: the SECOND figure — what the dishes actually cost when they
    // were sold in the period, read from the kardex. The first figure (the
    // theoretical cost) is an estimate with the components' CURRENT CPPs;
    // this one is the fact of what left the stock.
    const actuals = await this.actualCostByProduct(tenantId, period);

    let totalUnitsSold = 0;
    let totalActualCostNio = 0;
    let totalTheoreticalCostNio = 0;
    for (const dish of dishes) {
      const actual = actuals.get(dish.productId);
      if (!actual || actual.unitsSold <= 0) {
        // No sales in the period is NOT a zero cost (§27, AP-02).
        dish.unitsSold = null;
        dish.unitActualCostNio = null;
        dish.actualCostNio = null;
        dish.costGapNio = null;
        continue;
      }
      const unitActualCostNio = round4(actual.costNio / actual.unitsSold);
      dish.unitsSold = actual.unitsSold;
      dish.unitActualCostNio = unitActualCostNio;
      dish.actualCostNio = round4(actual.costNio);
      dish.costGapNio = round4(unitActualCostNio - dish.unitTheoreticalCostNio);

      totalUnitsSold += actual.unitsSold;
      totalActualCostNio += actual.costNio;
      totalTheoreticalCostNio += actual.unitsSold * dish.unitTheoreticalCostNio;
    }

    const extrasImpactNio = round4(
      totalActualCostNio - totalTheoreticalCostNio,
    );

    return {
      dishes,
      skipped,
      period: {
        from: period?.from ?? null,
        to: period?.to ?? null,
      },
      unitsSold: totalUnitsSold,
      totalActualCostNio: round4(totalActualCostNio),
      totalTheoreticalCostNio: round4(totalTheoreticalCostNio),
      extrasImpactNio,
      extrasImpactPct:
        totalTheoreticalCostNio > 0
          ? round4((extrasImpactNio / totalTheoreticalCostNio) * 100)
          : null,
    };
  }

  /**
   * R28 / M5 — what each dish ACTUALLY cost in the period, read from the
   * kardex.
   *
   * The SALE movements carry the line they came from
   * (`originInvoiceItemId`), and the line carries the product: the sum of the
   * movements' cost is the cost of what left the stock for that dish, and
   * the line's quantity is what was sold. Dividing gives the cost per unit
   * AS SOLD — which, since R28, already carries the effect of the extras
   * (the almond milk that replaced the whole milk, the extra shot).
   *
   * The period is read on the movement's BUSINESS moment (`occurred_at`),
   * the same clock the reports use.
   */
  private async actualCostByProduct(
    tenantId: string,
    period?: { from?: string; to?: string },
  ): Promise<Map<string, { costNio: number; unitsSold: number }>> {
    try {
      return await runInTenantTransaction(
        this.dataSource,
        tenantId,
        async (manager) => {
          let fromDate: Date | null = null;
          let toDate: Date | null = null;
          if (period?.from) {
            fromDate = new Date(period.from);
          }
          if (period?.to) {
            const to = period.to.trim();
            toDate =
              to.length === 10 ? new Date(`${to}T23:59:59.999Z`) : new Date(to);
          }

          const params: unknown[] = [tenantId, MovementType.SALE];
          let dateConditions = '';
          if (fromDate) {
            params.push(fromDate);
            dateConditions += ` AND mov.occurred_at >= $${params.length}`;
          }
          if (toDate) {
            params.push(toDate);
            dateConditions += ` AND mov.occurred_at <= $${params.length}`;
          }

          // The cost of what left the stock, per product. The movement carries
          // the line it came from, and the line carries the product.
          const costRows = await manager.query<
            Array<{
              product_id: string;
              total_cost: string | number;
            }>
          >(
            `
            SELECT item.product_id, COALESCE(SUM(mov.total_cost_nio), 0) AS total_cost
            FROM inventory_kardex mov
            INNER JOIN invoice_items item
              ON item.id::text = mov.origin_invoice_item_id
              AND item.tenant_id = $1
            WHERE mov.tenant_id = $1
              AND mov.type = $2
              AND mov.origin_invoice_item_id IS NOT NULL
              ${dateConditions}
            GROUP BY item.product_id
            `,
            params,
          );

          // The units sold, counted ONCE per line. The join above repeats a
          // line once per movement (one per insumo), so the quantity can NOT
          // come from it: it is summed over the DISTINCT lines.
          const lineRows = await manager.query<
            Array<{
              product_id: string;
              units: string | number;
            }>
          >(
            `
            SELECT item.product_id, COALESCE(SUM(item.quantity), 0) AS units
            FROM invoice_items item
            WHERE item.tenant_id = $1
              AND item.id::text IN (
                SELECT origin_invoice_item_id
                FROM inventory_kardex mov
                WHERE mov.tenant_id = $1
                  AND mov.type = $2
                  AND mov.origin_invoice_item_id IS NOT NULL
                  ${dateConditions}
              )
            GROUP BY item.product_id
            `,
            params,
          );

          const unitsByProduct = new Map<string, number>(
            lineRows.map((row) => [
              String(row.product_id),
              Number(row.units ?? 0),
            ]),
          );

          const result = new Map<
            string,
            { costNio: number; unitsSold: number }
          >();
          for (const row of costRows) {
            const pId = String(row.product_id);
            result.set(pId, {
              costNio: Number(row.total_cost ?? 0),
              unitsSold: unitsByProduct.get(pId) ?? 0,
            });
          }
          return result;
        },
      );
    } catch (err) {
      this.logger.error(
        `Failed to compute actual costs by product for tenant ${tenantId}: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
      );
      return new Map();
    }
  }

  private async computeProduct(
    tenantId: string,
    productId: string,
    visited: Set<string>,
    depth: number,
    componentLabel?: string,
  ): Promise<DishMargin> {
    if (visited.has(productId)) {
      throw new SkipBadRequest(
        'CIRCULAR_SUB_RECIPE',
        componentLabel
          ? `La receta tiene una referencia circular: “${componentLabel}” ya forma parte de este plato.`
          : 'La receta tiene una referencia circular entre sub-recetas.',
      );
    }
    if (depth > MAX_SUB_RECIPE_DEPTH) {
      throw new SkipBadRequest(
        'NESTING_TOO_DEEP',
        componentLabel
          ? `“${componentLabel}” supera el máximo de ${MAX_SUB_RECIPE_DEPTH} niveles de sub-recetas.`
          : `La receta supera el máximo de ${MAX_SUB_RECIPE_DEPTH} niveles de sub-recetas.`,
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
      // A dish reached as a component is named by its recipe label; the
      // operator reads a name, never the id the error carried before (S13).
      throw new SkipNotFound(
        componentLabel ? 'SUB_RECIPE_NO_ACTIVE_RECIPE' : 'NO_ACTIVE_RECIPE',
        componentLabel
          ? `La sub-receta “${componentLabel}” no tiene una receta publicada vigente.`
          : 'No tiene una receta publicada vigente. Cree y publique la receta para ver su costo y margen.',
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
      // R28 / M5: the "as sold" figures are filled by the caller, which is
      // the only place that knows the PERIOD. A single dish's theoretical
      // cost has no period, so these stay null here.
      unitsSold: null,
      unitActualCostNio: null,
      actualCostNio: null,
      costGapNio: null,
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
          component.ingredient_name ?? undefined,
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
          manager.getRepository(Insumo).findOne({
            where: { id: component.insumo_id, tenant_id: tenantId },
          }),
      );
      if (!insumo) {
        throw new SkipNotFound(
          'MISSING_COMPONENT',
          component.ingredient_name
            ? `El ingrediente “${component.ingredient_name}” ya no existe en el catálogo de insumos.`
            : 'La receta referencia un ingrediente que ya no existe en el catálogo de insumos.',
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
