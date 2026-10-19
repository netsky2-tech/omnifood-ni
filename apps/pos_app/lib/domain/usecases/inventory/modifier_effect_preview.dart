import 'package:pos_app/domain/models/inventory/product.dart';

/// What an option's inventory effect DOES to the stock, in the operator's
/// words, and the quantity it would apply.
///
/// R28 (owner decision D2): the operator sees, right in the modifiers
/// dialog, what the option takes out of the stock and HOW MUCH, and may
/// MARK the quantity to apply. When the field is left empty the quantity is
/// INHERITED from the recipe component the effect targets — the operator
/// does not have to know the recipe to sell a drink with almond milk, but
/// he can see exactly what leaves the stock.
///
/// Pure: no I/O, no clock, no randomness. The dialog collects the facts
/// (the recipe component, the insumo's name and unit) and asks this for the
/// words and the number.
class ModifierEffectPreview {
  const ModifierEffectPreview({
    required this.effect,
    required this.insumoName,
    required this.targetName,
    required this.unit,
    required this.inheritedQuantity,
    required this.inheritedUnit,
    required this.quantityIsMarked,
    required this.factor,
  });

  /// ADD / REMOVE / SWAP / SCALE.
  final String effect;

  /// The insumo that ENTERS the stock (ADD) or replaces the component (SWAP).
  final String? insumoName;

  /// The recipe component the effect acts on.
  final String? targetName;

  /// The unit the affected insumo is kept in.
  final String? unit;

  /// The quantity inherited from the recipe component, per sold unit.
  final double? inheritedQuantity;

  /// The unit that inherited quantity is expressed in.
  final String? inheritedUnit;

  /// Whether the operator marked an explicit quantity for this option.
  final bool quantityIsMarked;

  /// The multiplier of a SCALE.
  final double? factor;

  /// Whether the effect has a quantity the operator may mark.
  ///
  /// ADD and SWAP do (they add or replace a quantity of stock). REMOVE and
  /// SCALE do not: the quantity is the component's own, and the operator
  /// marks how many TIMES it applies with the option's own quantity, which
  /// the dialog already offers.
  bool get acceptsMarkedQuantity =>
      effect == 'ADD' || effect == 'SWAP';

  /// The sentence the operator reads.
  ///
  /// Calm and concrete: what leaves the stock, what enters it, and how
  /// much. No implementation vocabulary (§39.4).
  String get explanation {
    final quantity = inheritedQuantity;
    final amount = quantity == null
        ? null
        : '${_formatQuantity(quantity)}${inheritedUnit == null ? '' : ' $inheritedUnit'}';
    switch (effect) {
      case 'ADD':
        final what = insumoName ?? 'el insumo';
        final verb = amount == null
            ? 'Suma $what al consumo de la receta.'
            : 'Suma $amount de $what al consumo de la receta.';
        return quantityIsMarked
            ? 'Cantidad marcada por el cajero: $amount.'
            : verb;
      case 'REMOVE':
        final what = targetName ?? 'un componente';
        return amount == null
            ? 'No se consume $what.'
            : 'No se consume $what: $amount vuelven al inventario.';
      case 'SWAP':
        final out = targetName ?? 'el componente';
        final into = insumoName ?? 'el sustituto';
        final verb = amount == null
            ? 'No se consume $out; entra $into en su lugar.'
            : 'No se consume $out; entran $amount de $into en su lugar.';
        return quantityIsMarked
            ? 'Cantidad marcada por el cajero: $amount.'
            : verb;
      case 'SCALE':
        final what = targetName ?? 'el componente';
        final times = factor == null ? null : _formatQuantity(factor!);
        return times == null
            ? 'Multiplica el consumo de $what.'
            : 'Multiplica x$times el consumo de $what.';
      default:
        return '';
    }
  }

  static String _formatQuantity(double value) {
    final rounded = (value * 10000).roundToDouble() / 10000;
    return rounded == rounded.truncateToDouble()
        ? rounded.toStringAsFixed(0)
        : rounded.toString();
  }
}

/// Builds the preview of an option's effect.
///
/// [inheritedQuantity] is the quantity the effect inherits from the recipe
/// component it targets (per sold unit) and [inheritedUnit] the unit that
/// quantity is expressed in; the affected insumo's own unit is [unit].
///
/// The preview is only about WORDS and the number the operator sees; the
/// resolution that turns the effect into a demand lives in
/// `ModifierDeviationResolver`, and both sides of the wire share the
/// conformance contract in `fixtures/modifier-deviation/v1/vectors.json`.
ModifierEffectPreview buildModifierEffectPreview({
  required EffectiveModifierOption option,
  required String? insumoName,
  required String? targetName,
  required String? unit,
  required double? inheritedQuantity,
  required String? inheritedUnit,
  bool quantityIsMarked = false,
}) {
  return ModifierEffectPreview(
    effect: option.inventoryEffect,
    insumoName: insumoName,
    targetName: targetName,
    unit: unit,
    inheritedQuantity: inheritedQuantity,
    inheritedUnit: inheritedUnit,
    quantityIsMarked: quantityIsMarked,
    factor: option.effectFactor,
  );
}
