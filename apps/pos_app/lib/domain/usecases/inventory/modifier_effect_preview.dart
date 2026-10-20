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
    this.markedQuantity,
    this.unitsMismatch = false,
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

  /// The quantity the CASHIER MARKED for this option, when they marked one.
  ///
  /// It is the number that will really be applied, and it is expressed in
  /// the AFFECTED insumo's own unit — not in the recipe component's unit.
  /// The dialog announces it verbatim, so the cashier never reads a number
  /// that the stock movement will not carry.
  final double? markedQuantity;

  /// The affected insumo and the recipe component are kept in DIFFERENT
  /// units, so the inherited number means something else in the affected
  /// insumo's unit: the quantity CANNOT be inherited and the operator has
  /// to mark one (the resolver refuses the inherited number with
  /// `UNIT_MISMATCH`).
  ///
  /// The dialog says so instead of announcing a number that will never be
  /// applied — the operator must not read "18 g" and believe the almond
  /// milk will leave in grams.
  final bool unitsMismatch;

  /// What the quantity field shows when it is empty.
  ///
  /// The affected insumo's unit when the inherited number cannot be used
  /// (the operator types the number in THAT unit), the inherited number
  /// when it can, and "Heredar" when there is no recipe to inherit from.
  String get quantityHint {
    if (unitsMismatch) return unit ?? '';
    if (inheritedQuantity == null) return 'Heredar';
    return _formatQuantity(inheritedQuantity!);
  }

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
  ///
  /// The number it announces is ALWAYS the number that will be applied:
  /// the marked one when the cashier marked it, the inherited one when it
  /// can be inherited, and NO number (with an explicit request to mark
  /// one) when the units do not allow inheriting.
  String get explanation {
    final marked = markedQuantity;
    if (marked != null) {
      final amount =
          '${_formatQuantity(marked)}${unit == null ? '' : ' $unit'}';
      return 'Cantidad marcada por el cajero: $amount.';
    }
    if (quantityIsMarked) {
      // The cashier marked a quantity the dialog does not know the number
      // of: announce the fact, NEVER the inherited number (it would be
      // read as the marked one).
      return 'Cantidad marcada por el cajero.';
    }
    if (unitsMismatch) return _unitsMismatchSentence;
    final quantity = inheritedQuantity;
    final amount = quantity == null
        ? null
        : '${_formatQuantity(quantity)}${inheritedUnit == null ? '' : ' $inheritedUnit'}';
    switch (effect) {
      case 'ADD':
        final what = insumoName ?? 'el insumo';
        return amount == null
            ? 'Suma $what al consumo de la receta.'
            : 'Suma $amount de $what al consumo de la receta.';
      case 'REMOVE':
        final what = targetName ?? 'un componente';
        return amount == null
            ? 'No se consume $what.'
            : 'No se consume $what: $amount vuelven al inventario.';
      case 'SWAP':
        final out = targetName ?? 'el componente';
        final into = insumoName ?? 'el sustituto';
        return amount == null
            ? 'No se consume $out; entra $into en su lugar.'
            : 'No se consume $out; entran $amount de $into en su lugar.';
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

  /// The units do not allow inheriting the recipe's number.
  ///
  /// It says WHY in the operator's own units (the component's and the
  /// insumo's) and asks for the number, instead of announcing a quantity
  /// that the stock movement will never carry.
  String get _unitsMismatchSentence {
    final what = insumoName ?? 'el insumo';
    final into = unit == null ? 'la unidad del insumo' : unit!;
    final from = inheritedUnit == null
        ? 'la unidad del componente de la receta'
        : inheritedUnit!;
    return 'No se puede heredar la cantidad: $what se mide en $into y el '
        'componente de la receta en $from. Marque la cantidad a aplicar.';
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
  double? markedQuantity,
  bool unitsMismatch = false,
}) {
  return ModifierEffectPreview(
    effect: option.inventoryEffect,
    insumoName: insumoName,
    targetName: targetName,
    unit: unit,
    inheritedQuantity: unitsMismatch ? null : inheritedQuantity,
    inheritedUnit: inheritedUnit,
    quantityIsMarked: quantityIsMarked,
    factor: option.effectFactor,
    markedQuantity: markedQuantity,
    unitsMismatch: unitsMismatch,
  );
}
