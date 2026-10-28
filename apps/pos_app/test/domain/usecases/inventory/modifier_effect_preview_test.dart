import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/usecases/inventory/modifier_effect_preview.dart';

/// R28 (decisión del owner: "el backoffice manda, el cajero marca"): el
/// diálogo anuncia SIEMPRE la cantidad que se va a aplicar, y esa cantidad la
/// configura el backoffice.
///
/// Estas specs fijan las PALABRAS y el NÚMERO que el cajero lee:
///
///  1. La cantidad **configurada** gana sobre la de la receta — el bug que
///     la campaña encontró: el POS anunciaba 15 ml mientras aplicaba los
///     25 ml configurados.
///  2. Sin cantidad configurada, se anuncia la de la receta, **sin** decir
///     «heredar» (el vocabulario de implementación no va a la pantalla del
///     cajero: §39.4).
///  3. Sin ninguna cantidad, el efecto queda **pendiente** y se dice con
///     calma: no se le pide un número al cajero y la venta no se bloquea.
void main() {
  EffectiveModifierOption option({
    String effect = 'ADD',
    String? insumoId = 'ins-cafe',
    String? targetId = 'ins-cafe',
    double? factor,
    double? effectQuantity,
  }) =>
      EffectiveModifierOption(
        id: 'opt-1',
        name: 'Extra shot',
        priceDelta: 15,
        isDefault: false,
        inventoryEffect: effect,
        effectInsumoId: insumoId,
        effectTargetInsumoId: targetId,
        effectFactor: factor,
        effectQuantity: effectQuantity,
      );

  test('a price-only option has no preview at all (no noise)', () {
    final preview = buildModifierEffectPreview(
      option: option(effect: 'NONE', insumoId: null, targetId: null),
      insumoName: null,
      targetName: null,
      unit: null,
      inheritedQuantity: null,
      inheritedUnit: null,
    );
    expect(preview.explanation, isEmpty);
  });

  test('an ADD says what it takes out of the stock and how much', () {
    final preview = buildModifierEffectPreview(
      option: option(),
      insumoName: 'Café en Grano',
      targetName: 'Café en Grano',
      unit: 'g',
      inheritedQuantity: 18,
      inheritedUnit: 'g',
    );
    expect(preview.explanation, contains('Café en Grano'));
    expect(preview.explanation, contains('18 g'));
    expect(preview.explanation, contains('inventario'));
  });

  test('the CONFIGURED quantity wins over the recipe quantity', () {
    // The bug the campaign found: the backoffice configured 25 ml and the
    // recipe said 15 ml. The screen announced the recipe's number while the
    // stock movement carried the configured one.
    final preview = buildModifierEffectPreview(
      option: option(effectQuantity: 25),
      insumoName: 'Jarabe',
      targetName: 'Jarabe',
      unit: 'ml',
      inheritedQuantity: 15,
      inheritedUnit: 'ml',
    );
    expect(preview.explanation, contains('25 ml'));
    expect(preview.explanation, isNot(contains('15 ml')));
    expect(preview.effectiveQuantity, 25);
    expect(
      preview.quantitySource,
      ModifierEffectQuantitySource.declared,
    );
  });

  test('without a configured quantity, the recipe quantity is announced', () {
    final preview = buildModifierEffectPreview(
      option: option(),
      insumoName: 'Café en Grano',
      targetName: 'Café en Grano',
      unit: 'g',
      inheritedQuantity: 18,
      inheritedUnit: 'g',
    );
    expect(preview.explanation, contains('18 g'));
    expect(
      preview.quantitySource,
      ModifierEffectQuantitySource.inherited,
    );
  });

  test('the operator never reads the word "heredar"', () {
    final preview = buildModifierEffectPreview(
      option: option(),
      insumoName: 'Café en Grano',
      targetName: 'Café en Grano',
      unit: 'g',
      inheritedQuantity: 18,
      inheritedUnit: 'g',
    );
    expect(preview.explanation.toLowerCase(), isNot(contains('hered')));
    expect(preview.pendingNote.toLowerCase(), isNot(contains('hered')));
  });

  test('a SWAP says what leaves and what enters', () {
    final preview = buildModifierEffectPreview(
      option: option(
        effect: 'SWAP',
        insumoId: 'ins-almendras',
        targetId: 'ins-leche',
      ),
      insumoName: 'Leche de Almondras',
      targetName: 'Leche Entera',
      unit: 'ml',
      inheritedQuantity: 150,
      inheritedUnit: 'ml',
    );
    expect(preview.explanation, contains('Leche Entera'));
    expect(preview.explanation, contains('Leche de Almondras'));
    expect(preview.explanation, contains('150 ml'));
  });

  test('a REMOVE says the component does not leave the stock', () {
    final preview = buildModifierEffectPreview(
      option: option(
        effect: 'REMOVE',
        insumoId: null,
        targetId: 'ins-cebolla',
      ),
      insumoName: null,
      targetName: 'Cebolla',
      unit: null,
      inheritedQuantity: 30,
      inheritedUnit: 'g',
    );
    expect(preview.explanation, contains('Cebolla'));
    expect(preview.explanation, contains('30 g'));
    expect(preview.explanation, contains('No sale'));
    // The quantity of a removal is the component's own: the operator never
    // marks it.
    expect(preview.takesQuantity, isFalse);
  });

  test('a SCALE says the multiplier', () {
    final preview = buildModifierEffectPreview(
      option: option(
        effect: 'SCALE',
        insumoId: null,
        targetId: 'ins-cafe',
        factor: 2,
      ),
      insumoName: null,
      targetName: 'Café en Grano',
      unit: 'g',
      inheritedQuantity: 18,
      inheritedUnit: 'g',
    );
    expect(preview.explanation, contains('x2'));
    expect(preview.takesQuantity, isFalse);
  });

  test('a supervisor override wins over everything', () {
    final preview = buildModifierEffectPreview(
      option: option(effectQuantity: 25),
      insumoName: 'Jarabe',
      targetName: 'Jarabe',
      unit: 'ml',
      inheritedQuantity: 15,
      inheritedUnit: 'ml',
      quantityIsMarked: true,
      markedQuantity: 30,
    );
    expect(preview.explanation, contains('30 ml'));
    expect(preview.explanation, isNot(contains('25 ml')));
    expect(
      preview.quantitySource,
      ModifierEffectQuantitySource.override,
    );
  });

  test('mismatched units do NOT announce a number that will not be applied', () {
    // The rig (V9): the option adds almond milk (ml) but the component it
    // targets is coffee (g). The resolver refuses the inherited number
    // (UNIT_MISMATCH), so the screen must not announce "18 g".
    final preview = buildModifierEffectPreview(
      option: option(
        insumoId: 'ins-almendras',
        targetId: 'ins-cafe',
      ),
      insumoName: 'Leche de Almondras',
      targetName: 'Café en Grano',
      unit: 'ml',
      inheritedQuantity: 18,
      inheritedUnit: 'g',
      unitsMismatch: true,
    );
    expect(preview.explanation, isNot(contains('18 g')));
    expect(preview.isPending, isTrue);
  });

  test('without any quantity, the effect is PENDING and the note is calm', () {
    final preview = buildModifierEffectPreview(
      option: option(effectQuantity: null),
      insumoName: 'Jarabe',
      targetName: 'Jarabe',
      unit: 'ml',
      inheritedQuantity: null,
      inheritedUnit: null,
    );
    expect(preview.isPending, isTrue);
    expect(preview.effectiveQuantity, isNull);
    expect(
      preview.quantitySource,
      ModifierEffectQuantitySource.none,
    );
    expect(preview.pendingNote, contains('se vende igual'));
    expect(preview.pendingNote.toLowerCase(), isNot(contains('marque')));
  });

  test('a configured quantity is never pending', () {
    final preview = buildModifierEffectPreview(
      option: option(effectQuantity: 25),
      insumoName: 'Jarabe',
      targetName: 'Jarabe',
      unit: 'ml',
      inheritedQuantity: null,
      inheritedUnit: null,
    );
    expect(preview.isPending, isFalse);
    expect(preview.effectiveQuantity, 25);
  });

  test('the unit of the announced number follows its origin', () {
    final inherited = buildModifierEffectPreview(
      option: option(),
      insumoName: 'Café en Grano',
      targetName: 'Café en Grano',
      unit: 'g',
      inheritedQuantity: 18,
      inheritedUnit: 'g',
    );
    expect(inherited.effectiveUnit, 'g');

    final declared = buildModifierEffectPreview(
      option: option(effectQuantity: 25),
      insumoName: 'Jarabe',
      targetName: 'Jarabe',
      unit: 'ml',
      inheritedQuantity: 15,
      inheritedUnit: 'ml',
    );
    expect(declared.effectiveUnit, 'ml');
  });
}
