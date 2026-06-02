import { Injectable } from '@nestjs/common';
import { RecipeDetail } from './entities/recipe-detail.entity';

const SCALE_4 = 4;
const round4 = (value: number): number => Number(value.toFixed(SCALE_4));

export interface ExplodeBomInput {
  snapshotComponents: RecipeDetail[];
  orderQuantity: number;
}

@Injectable()
export class BomExplosionService {
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
}
