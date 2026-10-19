import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/usecases/inventory/modifier_deviation_resolver.dart';
import 'package:pos_app/domain/usecases/inventory/sub_recipe_bom_explosion.dart';
import 'package:pos_app/domain/usecases/inventory/validated_sale_inventory_authority.dart';

/// R28 / M3 — the demand a line really consumes.
///
/// The recipe's leaves are the baseline; the modifiers CORRECT them:
/// an extra shot ADDS coffee, "no onion" REMOVES the onion, almond milk
/// SWAPS the recipe's whole milk (the whole milk is NOT consumed) and a
/// double shot SCALEs the coffee.
///
/// The SOHO guarantee (D6) is the point of several of these cases: an
/// effect the company cannot apply must NEVER break the sale. It degrades
/// the inventory and says why.
void main() {
  const resolver = ModifierDeviationResolver();

  // The capuccino: 18 g of coffee, 150 ml of whole milk.
  const coffeeComponent = AuthorityComponent(
    id: 'cmp-cafe',
    tenantId: 't1',
    recipeId: 'rec-cap',
    insumoId: 'ins-cafe',
    quantityPerSaleUnit: 18,
  );
  const milkComponent = AuthorityComponent(
    id: 'cmp-leche',
    tenantId: 't1',
    recipeId: 'rec-cap',
    insumoId: 'ins-leche',
    quantityPerSaleUnit: 150,
  );

  final coffeeLeaf = BomLeaf(
    insumoId: 'ins-cafe',
    quantityPerSaleUnit: 18,
    rootComponentId: 'cmp-cafe',
  );
  final milkLeaf = BomLeaf(
    insumoId: 'ins-leche',
    quantityPerSaleUnit: 150,
    rootComponentId: 'cmp-leche',
  );

  final catalog = {
    'ins-cafe': const AuthorityInsumo(
      id: 'ins-cafe',
      tenantId: 't1',
      consumptionUom: 'G',
    ),
    'ins-leche': const AuthorityInsumo(
      id: 'ins-leche',
      tenantId: 't1',
      consumptionUom: 'ML',
    ),
    'ins-almendras': const AuthorityInsumo(
      id: 'ins-almendras',
      tenantId: 't1',
      consumptionUom: 'ML',
    ),
  };

  DeviationResolution resolve(
    List<Modifier> modifiers, {
    List<BomLeaf>? leaves,
    Map<String, AuthorityInsumo>? insumos,
  }) =>
      resolver.resolve(
        leaves: leaves ?? [coffeeLeaf, milkLeaf],
        rootComponents: const [coffeeComponent, milkComponent],
        modifiers: modifiers,
        insumosById: insumos ?? catalog,
      );

  double quantityOf(DeviationResolution resolution, String insumoId) {
    for (final leaf in resolution.leaves) {
      if (leaf.insumoId == insumoId) return leaf.quantityPerSaleUnit;
    }
    return 0;
  }

  group('la cantidad se hereda (D2)', () {
    test('un extra de shot suma la cantidad de la receta al café', () {
      final resolution = resolve([
        const Modifier(
          id: 'opt-shot',
          name: 'Extra shot',
          extraPrice: 15,
          optionId: 'opt-shot',
          groupId: 'grp-extras',
          inventoryEffect: 'ADD',
          effectInsumoId: 'ins-cafe',
          effectTargetInsumoId: 'ins-cafe',
        ),
      ]);

      // The recipe's 18 g of coffee, plus the inherited 18 g of the extra.
      expect(quantityOf(resolution, 'ins-cafe'), 36);
      expect(quantityOf(resolution, 'ins-leche'), 150);
      expect(resolution.effects.single.applied, isTrue);
      expect(resolution.effects.single.quantityPerSaleUnit, 18);
    });

    test('una cantidad marcada por el operador manda sobre la heredada', () {
      final resolution = resolve([
        const Modifier(
          id: 'opt-shot',
          name: 'Extra shot',
          extraPrice: 15,
          optionId: 'opt-shot',
          inventoryEffect: 'ADD',
          effectInsumoId: 'ins-cafe',
          effectTargetInsumoId: 'ins-cafe',
          effectQuantity: 9,
        ),
      ]);

      expect(quantityOf(resolution, 'ins-cafe'), 27);
    });
  });

  group('el reemplazo (SWAP)', () {
    test('la leche entera NO se consume y la de almendras sí', () {
      final resolution = resolve([
        const Modifier(
          id: 'opt-almendras',
          name: 'Leche: Almendras',
          extraPrice: 10,
          optionId: 'opt-almendras',
          groupId: 'grp-leche',
          inventoryEffect: 'SWAP',
          effectTargetInsumoId: 'ins-leche',
          effectInsumoId: 'ins-almendras',
        ),
      ]);

      // The whole milk is NOT downloaded: the customer received almond milk.
      expect(quantityOf(resolution, 'ins-leche'), 0);
      // The substitute takes the component's own quantity.
      expect(quantityOf(resolution, 'ins-almendras'), 150);
      expect(quantityOf(resolution, 'ins-cafe'), 18);
      expect(resolution.effects.single.applied, isTrue);
    });

    test('el insumo que entra no lleva el id del componente de la receta', () {
      // The backend validates a binding's recipeComponentId against the
      // ROOT recipe's details: the substitute is not a component, so it
      // travels WITHOUT one.
      final resolution = resolve([
        const Modifier(
          id: 'opt-almendras',
          name: 'Leche: Almendras',
          extraPrice: 10,
          optionId: 'opt-almendras',
          inventoryEffect: 'SWAP',
          effectTargetInsumoId: 'ins-leche',
          effectInsumoId: 'ins-almendras',
        ),
      ]);

      for (final leaf in resolution.leaves) {
        if (leaf.insumoId == 'ins-almendras') {
          expect(leaf.rootComponentId, isNull);
        }
      }
    });
  });

  group('la remoción y la multiplicación', () {
    test('sin cebolla: la cebolla no se consume', () {
      final resolution = resolve([
        const Modifier(
          id: 'opt-sin-cebolla',
          name: 'Sin cebolla',
          extraPrice: 0,
          optionId: 'opt-sin-cebolla',
          inventoryEffect: 'REMOVE',
          effectTargetInsumoId: 'ins-leche',
        ),
      ]);

      expect(quantityOf(resolution, 'ins-leche'), 0);
      expect(quantityOf(resolution, 'ins-cafe'), 18);
    });

    test('café x2: el café se multiplica', () {
      final resolution = resolve([
        const Modifier(
          id: 'opt-doble',
          name: 'Café doble',
          extraPrice: 10,
          optionId: 'opt-doble',
          inventoryEffect: 'SCALE',
          effectTargetInsumoId: 'ins-cafe',
          effectFactor: 2,
        ),
      ]);

      expect(quantityOf(resolution, 'ins-cafe'), 36);
      expect(quantityOf(resolution, 'ins-leche'), 150);
    });
  });

  group('la garantía de SOHO (D6): el efecto NUNCA bloquea la venta', () {
    test('un insumo que la empresa no tiene registrado NO se descuenta', () {
      final resolution = resolve([
        const Modifier(
          id: 'opt-almendras',
          name: 'Leche: Almendras',
          extraPrice: 10,
          optionId: 'opt-almendras',
          inventoryEffect: 'SWAP',
          effectTargetInsumoId: 'ins-leche',
          effectInsumoId: 'ins-almendras-que-no-existe',
        ),
      ]);

      // The line keeps the recipe's demand: the swap did not apply.
      expect(quantityOf(resolution, 'ins-leche'), 150);
      expect(quantityOf(resolution, 'ins-almendras'), 0);
      expect(
        resolution.effects.single.skipReason,
        ModifierEffectSkipReason.insumoNotInCatalog,
      );
    });

    test('una unidad distinta sin cantidad marcada NO hereda un número equivocado', () {
      // The inherited number is in the TARGET's unit (ML); the affected
      // insumo is kept in L. The operator has to mark the quantity.
      final resolution = resolve(
        [
          const Modifier(
            id: 'opt-almendras',
            name: 'Leche: Almendras',
            extraPrice: 10,
            optionId: 'opt-almendras',
            inventoryEffect: 'SWAP',
            effectTargetInsumoId: 'ins-leche',
            effectInsumoId: 'ins-almendras',
          ),
        ],
        insumos: {
          ...catalog,
          'ins-almendras': const AuthorityInsumo(
            id: 'ins-almendras',
            tenantId: 't1',
            consumptionUom: 'L',
          ),
        },
      );

      expect(quantityOf(resolution, 'ins-leche'), 150);
      expect(
        resolution.effects.single.skipReason,
        ModifierEffectSkipReason.unitMismatch,
      );
    });

    test('un efecto que nombra un componente que la receta no tiene se ignora', () {
      final resolution = resolve([
        const Modifier(
          id: 'opt-sin-cebolla',
          name: 'Sin cebolla',
          extraPrice: 0,
          optionId: 'opt-sin-cebolla',
          inventoryEffect: 'REMOVE',
          effectTargetInsumoId: 'ins-cebolla',
        ),
      ]);

      expect(quantityOf(resolution, 'ins-cafe'), 18);
      expect(
        resolution.effects.single.skipReason,
        ModifierEffectSkipReason.componentNotInRecipe,
      );
    });

    test('una opción SIN efecto no toca la demanda', () {
      final resolution = resolve([
        const Modifier(
          id: 'opt-legacy',
          name: 'Extra shot',
          extraPrice: 15,
        ),
      ]);

      expect(quantityOf(resolution, 'ins-cafe'), 18);
      expect(quantityOf(resolution, 'ins-leche'), 150);
      expect(resolution.effects, isEmpty);
    });
  });
}
