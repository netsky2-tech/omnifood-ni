import { BadRequestException, Injectable } from '@nestjs/common';
import { RecipeDetail } from './entities/recipe-detail.entity';

const SCALE_4 = 4;
const DEFAULT_MAX_BOM_DEPTH = 5;
const round4 = (value: number): number => Number(value.toFixed(SCALE_4));

export interface ExplodeBomInput {
  snapshotComponents: RecipeDetail[];
  orderQuantity: number;
}

export interface ExplodeRecursiveBomInput {
  rootProductId: string;
  orderQuantity: number;
  getRecipeComponents: (productId: string) => Promise<RecipeDetail[]> | RecipeDetail[];
  maxDepth?: number;
}

@Injectable()
export class BomExplosionService {
  /**
   * Single-level BOM explosion.
   */
  explode(input: ExplodeBomInput): Map<string, number> {
    const totals = new Map<string, number>();

    for (const component of input.snapshotComponents) {
      const previous = totals.get(component.insumo_id) ?? 0;
      const exploded = round4(Number(component.quantity) * input.orderQuantity);
      totals.set(component.insumo_id, round4(previous + exploded));
    }

    return new Map(
      [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)),
    );
  }

  /**
   * Multi-level recursive BOM explosion with DAG cycle detection and depth limit.
   */
  async explodeRecursive(input: ExplodeRecursiveBomInput): Promise<Map<string, number>> {
    const maxDepth = input.maxDepth ?? DEFAULT_MAX_BOM_DEPTH;
    const totals = new Map<string, number>();
    const visitedStack = new Set<string>();

    await this._explodeInternal(
      input.rootProductId,
      input.orderQuantity,
      input.getRecipeComponents,
      totals,
      visitedStack,
      0,
      maxDepth,
    );

    return new Map(
      [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)),
    );
  }

  private async _explodeInternal(
    currentProductId: string,
    currentMultiplier: number,
    getRecipeComponents: (productId: string) => Promise<RecipeDetail[]> | RecipeDetail[],
    totals: Map<string, number>,
    visitedStack: Set<string>,
    currentDepth: number,
    maxDepth: number,
  ): Promise<void> {
    if (currentDepth > maxDepth) {
      throw new BadRequestException(
        `Profundidad máxima de BOM excedida (${maxDepth} niveles). Verifique que no existan sub-recetas excesivamente anidadas.`,
      );
    }

    if (visitedStack.has(currentProductId)) {
      const cyclePath = [...visitedStack, currentProductId].join(' -> ');
      throw new BadRequestException(
        `Dependencia circular detectada en receta: ${cyclePath}`,
      );
    }

    visitedStack.add(currentProductId);

    const components = await getRecipeComponents(currentProductId);

    for (const component of components) {
      const normalizedQuantity = round4(Number(component.quantity) * currentMultiplier);

      if (component.ingredient_type === 'SUB_RECIPE') {
        await this._explodeInternal(
          component.insumo_id,
          normalizedQuantity,
          getRecipeComponents,
          totals,
          visitedStack,
          currentDepth + 1,
          maxDepth,
        );
      } else {
        const previous = totals.get(component.insumo_id) ?? 0;
        totals.set(component.insumo_id, round4(previous + normalizedQuantity));
      }
    }

    visitedStack.delete(currentProductId);
  }
}
