import 'package:pos_app/domain/models/inventory/product.dart';

/// De dónde sale la cantidad que el efecto va a aplicar al inventario.
enum ModifierEffectQuantitySource {
  /// Un supervisor la ajustó a mano, con autorización y motivo.
  override,

  /// La cantidad que el backoffice configuró para la opción.
  declared,

  /// La cantidad del componente de la receta (cuando no hay configurada).
  inherited,

  /// No hay ninguna cantidad: el efecto queda pendiente de que se defina.
  none,
}

/// Qué hace el efecto de inventario de una opción sobre el stock, en las palabras
/// del operador, y la cantidad que REALMENTE se va a aplicar.
///
/// R28 (decisión del owner): el backoffice manda. La cantidad del extra no es
/// "cuántos extras" (eso lo resuelve el grupo, repitiendo la opción), es
/// "cuánto stock sale" por unidad vendida: un dato de catálogo, no un dato que
/// el mostrador pueda adivinar. El cajero marca la opción; el sistema aplica la
/// cantidad y la pantalla la dice.
///
/// La precedencia es la del resolver (`marcada > declarada > heredada`), y esta
/// clase la refleja: la pantalla anuncia SIEMPRE el número que se va a aplicar.
///
/// Pure: no I/O, no clock, no randomness. El diálogo aporta los hechos (el
/// componente de la receta, el nombre y la unidad del insumo) y pide aquí las
/// palabras y el número.
class ModifierEffectPreview {
  const ModifierEffectPreview({
    required this.effect,
    required this.insumoName,
    required this.targetName,
    required this.unit,
    required this.declaredQuantity,
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

  /// The quantity the BACKOFFICE configured for this option, in the affected
  /// insumo's own consumption unit.
  ///
  /// This is the number that wins over the recipe's: the tenant configured it
  /// on purpose, and the screen must announce it — not the recipe's number.
  final double? declaredQuantity;

  /// The quantity the recipe component consumes per sold unit.
  final double? inheritedQuantity;

  /// The unit that inherited quantity is expressed in.
  final String? inheritedUnit;

  /// Whether a supervisor marked an explicit quantity for this option.
  final bool quantityIsMarked;

  /// The multiplier of a SCALE.
  final double? factor;

  /// The quantity a supervisor marked, in the affected insumo's own unit.
  final double? markedQuantity;

  /// The affected insumo and the recipe component are kept in DIFFERENT units,
  /// so the recipe's number means something else in the affected insumo's unit:
  /// the quantity CANNOT be inherited (the resolver refuses it with
  /// `UNIT_MISMATCH`).
  ///
  /// A DECLARED quantity is not affected by this: the backoffice configures it
  /// in the affected insumo's own unit, so it always applies.
  final bool unitsMismatch;

  /// Whether the effect consumes a quantity of its own.
  ///
  /// ADD and SWAP do (they add or substitute a quantity of stock). REMOVE drops
  /// the whole component (its quantity is the component's own) and SCALE
  /// multiplies it by a factor.
  bool get takesQuantity => effect == 'ADD' || effect == 'SWAP';

  /// The quantity that will REALLY be applied.
  ///
  /// The marked one wins (it is a supervisor's authorized decision), then the
  /// declared one (the backoffice's configuration), then the recipe's — and the
  /// recipe's only counts when the units mean the same thing.
  double? get effectiveQuantity {
    if (!takesQuantity) return null;
    if (quantityIsMarked) return markedQuantity;
    if (declaredQuantity != null) return declaredQuantity;
    if (unitsMismatch) return null;
    return inheritedQuantity;
  }

  /// Where the effective quantity comes from.
  ModifierEffectQuantitySource get quantitySource {
    if (!takesQuantity) return ModifierEffectQuantitySource.none;
    if (quantityIsMarked) {
      return markedQuantity == null
          ? ModifierEffectQuantitySource.none
          : ModifierEffectQuantitySource.override;
    }
    if (declaredQuantity != null) {
      return ModifierEffectQuantitySource.declared;
    }
    if (!unitsMismatch && inheritedQuantity != null) {
      return ModifierEffectQuantitySource.inherited;
    }
    return ModifierEffectQuantitySource.none;
  }

  /// The unit the announced number is expressed in.
  ///
  /// The recipe's number carries the COMPONENT's unit; a declared or marked
  /// number carries the AFFECTED insumo's unit.
  String? get effectiveUnit =>
      quantitySource == ModifierEffectQuantitySource.inherited
          ? inheritedUnit
          : unit;

  /// The effect has no quantity: it will not touch the stock until someone
  /// defines one.
  ///
  /// The sale still goes through (the effect never blocks a sale) and the line
  /// carries the fact, so the backoffice can list it.
  bool get isPending => takesQuantity && effectiveQuantity == null;

  /// The unit in which a quantity would be marked.
  String? get markingUnit => unit;

  /// The sentence the operator reads.
  ///
  /// Calm and concrete: what leaves the stock and how much. No implementation
  /// vocabulary (§39.4): the number announced is ALWAYS the number that will
  /// be applied, and where it comes from is the backoffice's business, not the
  /// cashier's.
  String get explanation {
    switch (effect) {
      case 'ADD':
        final what = insumoName ?? 'el insumo';
        final amount = _amountText;
        return amount == null
            ? 'Saca $what del inventario.'
            : 'Saca $amount de $what del inventario.';
      case 'REMOVE':
        final what = targetName ?? 'un componente';
        final amount = _componentAmountText;
        return amount == null
            ? 'No sale $what del inventario.'
            : 'No salen $amount de $what del inventario.';
      case 'SWAP':
        final out = targetName ?? 'el componente';
        final into = insumoName ?? 'el sustituto';
        final amount = _amountText;
        return amount == null
            ? 'No sale $out; entra $into en su lugar.'
            : 'No sale $out; entran $amount de $into en su lugar.';
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

  /// The calm note for the case where the effect has no quantity.
  ///
  /// It says what is true and does not ask the cashier for a number: the extra
  /// sells, and its stock effect waits until someone defines the quantity.
  String get pendingNote =>
      'Este extra todavía no tiene una cantidad configurada: se vende igual y su '
      'consumo de inventario queda pendiente de que se defina.';

  /// The announced amount of the effect, with its unit.
  String? get _amountText {
    final quantity = effectiveQuantity;
    if (quantity == null) return null;
    final unit = effectiveUnit;
    return '${_formatQuantity(quantity)}${unit == null ? '' : ' $unit'}';
  }

  /// The component's own quantity, for the effects that do not take one
  /// (REMOVE drops the whole component).
  String? get _componentAmountText {
    final quantity = inheritedQuantity;
    if (quantity == null) return null;
    final unit = inheritedUnit;
    return '${_formatQuantity(quantity)}${unit == null ? '' : ' $unit'}';
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
/// The DECLARED quantity is read from the option itself: the backoffice
/// configured it, and it wins over the recipe's number — that is the whole
/// point of the change (the screen used to announce the recipe's number while
/// the stock movement carried the configured one).
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
    declaredQuantity: option.effectQuantity,
    inheritedQuantity: unitsMismatch ? null : inheritedQuantity,
    inheritedUnit: inheritedUnit,
    quantityIsMarked: quantityIsMarked,
    factor: option.effectFactor,
    markedQuantity: markedQuantity,
    unitsMismatch: unitsMismatch,
  );
}
