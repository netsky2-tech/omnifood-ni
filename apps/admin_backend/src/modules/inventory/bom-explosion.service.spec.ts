import { BadRequestException } from '@nestjs/common';
import { BomExplosionService } from './bom-explosion.service';
import { RecipeDetail } from './entities/recipe-detail.entity';

describe('BomExplosionService', () => {
  const service = new BomExplosionService();

  describe('single-level explode', () => {
    it('explodes snapshot components deterministically at 4 decimals', () => {
      const totals = service.explode({
        orderQuantity: 2,
        snapshotComponents: [
          { insumo_id: 'ins-2', quantity: 0.3333 },
          { insumo_id: 'ins-1', quantity: 0.1 },
        ] as never,
      });

      expect([...totals.keys()]).toEqual(['ins-1', 'ins-2']);
      expect(totals.get('ins-1')).toBe(0.2);
      expect(totals.get('ins-2')).toBe(0.6666);
    });

    it('aggregates repeated insumo lines with stable rounding', () => {
      const totals = service.explode({
        orderQuantity: 3,
        snapshotComponents: [
          { insumo_id: 'ins-1', quantity: 0.1111 },
          { insumo_id: 'ins-1', quantity: 0.2222 },
        ] as never,
      });

      expect(totals.get('ins-1')).toBe(0.9999);
    });
  });

  describe('multi-level recursive explosion (DAG)', () => {
    it('recursively explodes multi-level sub-recipes down to base raw insumos', async () => {
      // Lasagna -> (Pasta: 0.2 kg INSUMO, Salsa Bolognese: 0.3 kg SUB_RECIPE)
      // Salsa Bolognese -> (Carne Molida: 0.5 kg INSUMO, Fondo de Res: 0.2 L SUB_RECIPE)
      // Fondo de Res -> (Huesos de Res: 0.4 kg INSUMO, Agua: 1.0 L INSUMO)
      const mockDatabase = new Map<string, RecipeDetail[]>([
        [
          'prod-lasagna',
          [
            { insumo_id: 'ins-pasta', ingredient_type: 'INSUMO', quantity: 0.2 } as RecipeDetail,
            { insumo_id: 'prod-salsa-bolognese', ingredient_type: 'SUB_RECIPE', quantity: 0.3 } as RecipeDetail,
          ],
        ],
        [
          'prod-salsa-bolognese',
          [
            { insumo_id: 'ins-carne', ingredient_type: 'INSUMO', quantity: 0.5 } as RecipeDetail,
            { insumo_id: 'prod-fondo-res', ingredient_type: 'SUB_RECIPE', quantity: 0.2 } as RecipeDetail,
          ],
        ],
        [
          'prod-fondo-res',
          [
            { insumo_id: 'ins-huesos', ingredient_type: 'INSUMO', quantity: 0.4 } as RecipeDetail,
            { insumo_id: 'ins-agua', ingredient_type: 'INSUMO', quantity: 1.0 } as RecipeDetail,
          ],
        ],
      ]);

      const totals = await service.explodeRecursive({
        rootProductId: 'prod-lasagna',
        orderQuantity: 2,
        getRecipeComponents: async (id) => mockDatabase.get(id) ?? [],
      });

      // 2 portions of Lasagna:
      // Pasta: 2 * 0.2 = 0.4 kg
      // Salsa Bolognese: 2 * 0.3 = 0.6 kg of sauce
      // -> Carne Molida: 0.6 * 0.5 = 0.3 kg
      // -> Fondo de Res: 0.6 * 0.2 = 0.12 L
      //    -> Huesos: 0.12 * 0.4 = 0.048 kg
      //    -> Agua: 0.12 * 1.0 = 0.12 L
      expect(totals.get('ins-pasta')).toBe(0.4);
      expect(totals.get('ins-carne')).toBe(0.3);
      expect(totals.get('ins-huesos')).toBe(0.048);
      expect(totals.get('ins-agua')).toBe(0.12);
    });

    it('detects circular dependency and throws BadRequestException (DAG enforcement)', async () => {
      // Prod A -> Prod B -> Prod C -> Prod A (Cycle!)
      const cyclicDb = new Map<string, RecipeDetail[]>([
        [
          'prod-a',
          [{ insumo_id: 'prod-b', ingredient_type: 'SUB_RECIPE', quantity: 1.0 } as RecipeDetail],
        ],
        [
          'prod-b',
          [{ insumo_id: 'prod-c', ingredient_type: 'SUB_RECIPE', quantity: 1.0 } as RecipeDetail],
        ],
        [
          'prod-c',
          [{ insumo_id: 'prod-a', ingredient_type: 'SUB_RECIPE', quantity: 1.0 } as RecipeDetail],
        ],
      ]);

      await expect(
        service.explodeRecursive({
          rootProductId: 'prod-a',
          orderQuantity: 1,
          getRecipeComponents: async (id) => cyclicDb.get(id) ?? [],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects recursion exceeding maximum allowable depth (max 5 levels)', async () => {
      // 7 levels deep: Level 1 -> Level 2 -> Level 3 -> Level 4 -> Level 5 -> Level 6 -> Level 7
      const deepDb = new Map<string, RecipeDetail[]>();
      for (let i = 1; i <= 6; i++) {
        deepDb.set(`level-${i}`, [
          { insumo_id: `level-${i + 1}`, ingredient_type: 'SUB_RECIPE', quantity: 1.0 } as RecipeDetail,
        ]);
      }
      deepDb.set('level-7', [
        { insumo_id: 'ins-leaf', ingredient_type: 'INSUMO', quantity: 1.0 } as RecipeDetail,
      ]);

      await expect(
        service.explodeRecursive({
          rootProductId: 'level-1',
          orderQuantity: 1,
          getRecipeComponents: async (id) => deepDb.get(id) ?? [],
        }),
      ).rejects.toThrow('Profundidad máxima de BOM excedida');
    });
  });
});
