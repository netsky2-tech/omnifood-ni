import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/usecases/inventory/modifier_effect_preview.dart';

/// R28 (decision D2): the modifiers dialog tells the cashier what the
/// option does to the stock and lets them MARK the quantity to apply.
///
/// These specs pin the WORDS the operator reads. The rule: calm, concrete,
/// no implementation vocabulary, and it says how much leaves the stock.
void main() {
  EffectiveModifierOption option({
    String effect = 'ADD',
    String? insumoId = 'ins-cafe',
    String? targetId = 'ins-cafe',
    double? factor,
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

  test('an ADD says what it adds and how much', () {
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
    expect(preview.acceptsMarkedQuantity, isTrue);
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
    expect(preview.acceptsMarkedQuantity, isTrue);
  });

  test('a REMOVE says the component returns to the stock', () {
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
    // The quantity of a removal is the component's own: the cashier marks
    // how many TIMES the option applies, not the grams.
    expect(preview.acceptsMarkedQuantity, isFalse);
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
    expect(preview.acceptsMarkedQuantity, isFalse);
  });

  test('a marked quantity is announced, not silently applied', () {
    final preview = buildModifierEffectPreview(
      option: option(),
      insumoName: 'Café en Grano',
      targetName: 'Café en Grano',
      unit: 'g',
      inheritedQuantity: 18,
      inheritedUnit: 'g',
      quantityIsMarked: true,
      markedQuantity: 30,
    );
    expect(preview.explanation, contains('marcada'));
  });

  test('a marked option NEVER announces the inherited number', () {
    // The rig found this: the dialog said "Cantidad marcada por el cajero:
    // 18 g" while the cashier had marked 30 — the inherited number was
    // announced as the marked one. When the number is not known, the copy
    // says so instead of announcing a number that will not be applied.
    final preview = buildModifierEffectPreview(
      option: option(),
      insumoName: 'Café en Grano',
      targetName: 'Café en Grano',
      unit: 'g',
      inheritedQuantity: 18,
      inheritedUnit: 'g',
      quantityIsMarked: true,
    );
    expect(preview.explanation, isNot(contains('18 g')));
  });

  test('a MARKED quantity is the number announced, in the insumo unit', () {
    // The rig: the cashier marked 150 ml of almond milk and the dialog
    // announced "Cantidad marcada por el cajero: 18 g" — the INHERITED
    // number, in the component's unit. The number the stock movement
    // carries is the marked one, in the insumo's unit.
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
      quantityIsMarked: true,
      markedQuantity: 150,
    );
    expect(preview.explanation, contains('150 ml'));
    expect(preview.explanation, isNot(contains('18 g')));
  });

  test('mismatched units ask for a marked quantity instead of a number', () {
    // The rig (V9): the option adds almond milk (ml) but inherits from the
    // coffee component (g). The resolver refuses the inherited number
    // (UNIT_MISMATCH), so the dialog must NOT announce "18 g" — it must
    // ask the cashier for the number, in the insumo's unit.
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
    expect(preview.explanation, contains('No se puede heredar'));
    expect(preview.explanation, contains('ml'));
    expect(preview.explanation, contains('g'));
    expect(preview.explanation, isNot(contains('18 g')));
    // The number that will be applied is the marked one, in ml.
    expect(preview.quantityHint, 'ml');
  });

  test('the quantity hint is the inherited number when it can be inherited', () {
    final preview = buildModifierEffectPreview(
      option: option(),
      insumoName: 'Café en Grano',
      targetName: 'Café en Grano',
      unit: 'g',
      inheritedQuantity: 18,
      inheritedUnit: 'g',
    );
    expect(preview.quantityHint, '18');
  });
}
