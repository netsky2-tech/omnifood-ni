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
    );
    expect(preview.explanation, contains('marcada'));
  });
}
