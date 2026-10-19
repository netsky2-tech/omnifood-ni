import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/usecases/inventory/sub_recipe_bom_explosion.dart';
import 'package:pos_app/domain/usecases/inventory/validated_sale_inventory_authority.dart';

/// Why a declared effect was NOT applied to the demand.
///
/// Every reason here is a **fail-soft** outcome: the sale goes through, the
/// stock is not touched by that effect, and the reason is reported so the
/// operator (and the dashboard) can see it. This is the SOHO guarantee
/// (R28, D6) in code: **a failure of this feature degrades the inventory,
/// never the sale**.
enum ModifierEffectSkipReason {
  /// The insumo the effect acts on is not in this company's catalog. A
  /// tenant that never registered the insumo keeps selling exactly as
  /// before; the effect simply does not touch the stock.
  insumoNotInCatalog,

  /// The quantity the effect would inherit is expressed in another unit
  /// than the insumo it applies to, so the operator has to mark the
  /// quantity explicitly instead of inheriting a wrong number.
  unitMismatch,

  /// The effect names a component the recipe does not have.
  componentNotInRecipe,

  /// The effect is incomplete: it names neither a component nor a quantity.
  incomplete;

  /// The vocabulary of the SHARED conformance contract
  /// (`fixtures/modifier-deviation/v1/vectors.json`), which the cloud's
  /// mirror speaks verbatim. The two sides must name the same reasons the
  /// same way, or the contract cannot compare them.
  String get wireName => switch (this) {
        ModifierEffectSkipReason.insumoNotInCatalog => 'INSUMSO_NOT_IN_CATALOG',
        ModifierEffectSkipReason.unitMismatch => 'UNIT_MISMATCH',
        ModifierEffectSkipReason.componentNotInRecipe =>
          'COMPONENT_NOT_IN_RECIPE',
        ModifierEffectSkipReason.incomplete => 'INCOMPLETE',
      };
}

/// What happened to ONE declared effect.
class AppliedModifierEffect {
  const AppliedModifierEffect({
    required this.optionId,
    required this.effect,
    this.insumoId,
    this.quantityPerSaleUnit,
    this.skipReason,
  });

  final String optionId;

  /// NONE / ADD / REMOVE / SWAP / SCALE.
  final String effect;

  /// The insumo the effect acted on (the substitute for a SWAP).
  final String? insumoId;

  /// The quantity applied per sold unit, when the effect applied.
  final double? quantityPerSaleUnit;

  /// NULL when the effect was applied.
  final ModifierEffectSkipReason? skipReason;

  bool get applied => skipReason == null;
}

/// The result of resolving a line's deviations over its recipe's leaves.
class DeviationResolution {
  const DeviationResolution({
    required this.leaves,
    required this.effects,
  });

  /// The demand the line really consumes, after the deviations.
  final List<BomLeaf> leaves;

  /// What happened to each declared effect (applied or skipped with a
  /// reason). The reasons are the operator's evidence.
  final List<AppliedModifierEffect> effects;
}

/// Resolves the INVENTORY EFFECT of a line's modifiers over the recipe's
/// consumption (R28).
///
/// The demand of a line is the recipe's leaves, corrected by what the
/// operator chose at the register:
///
///   ADD    — contributes an insumo (an extra shot of coffee adds coffee).
///   REMOVE — takes a component out ("no onion": the onion is not consumed).
///   SWAP   — replaces a component (almond milk instead of whole milk: the
///            whole milk is NOT consumed and the almond milk is).
///   SCALE  — multiplies a component (a double shot).
///
/// THE QUANTITY IS INHERITED: the effect takes the recipe component's own
/// per-sold-unit quantity, unless the operator marked one (D2). The
/// inherited number belongs to the TARGET's unit, so an effect that applies
/// to another insumo only inherits when the units match; otherwise the
/// operator has to mark the quantity, and until then the effect does not
/// touch the stock.
///
/// Pure and synchronous over the already-hydrated authority facts: no
/// database reads, no clock, no randomness. The database reads live in
/// `CheckoutInventoryPreparationService`, which must hydrate every insumo
/// the effects reference — and an insumo it cannot hydrate is exactly the
/// one this resolver skips.
class ModifierDeviationResolver {
  const ModifierDeviationResolver();

  DeviationResolution resolve({
    required List<BomLeaf> leaves,
    required List<AuthorityComponent> rootComponents,
    required List<Modifier> modifiers,
    required Map<String, AuthorityInsumo> insumosById,
  }) {
    var result = List<BomLeaf>.of(leaves);
    final effects = <AppliedModifierEffect>[];

    for (final modifier in modifiers) {
      if (!modifier.hasInventoryEffect) continue;

      final effect = modifier.inventoryEffect;
      final optionId = modifier.optionId ?? modifier.id;

      // The component of the recipe the effect acts on.
      AuthorityComponent? target;
      if (modifier.effectTargetInsumoId != null) {
        target = _findComponent(
          rootComponents,
          modifier.effectTargetInsumoId!,
        );
        if (target == null) {
          effects.add(
            AppliedModifierEffect(
              optionId: optionId,
              effect: effect,
              skipReason: ModifierEffectSkipReason.componentNotInRecipe,
            ),
          );
          continue;
        }
      }

      _EffectResult applied;
      switch (effect) {
        case 'REMOVE':
          applied = _applyRemove(result, target!, optionId, effect);
          break;
        case 'SWAP':
          applied = _applySwap(
            result,
            target!,
            modifier,
            optionId,
            insumosById,
          );
          break;
        case 'SCALE':
          applied = _applyScale(result, target!, modifier, optionId);
          break;
        case 'ADD':
        default:
          applied = _applyAdd(
            result,
            target,
            modifier,
            optionId,
            insumosById,
          );
          break;
      }
      if (applied.applied) {
        result = applied.leaves;
        effects.add(applied.effect);
      } else {
        effects.add(
          AppliedModifierEffect(
            optionId: optionId,
            effect: effect,
            insumoId: applied.effect.insumoId,
            skipReason: applied.effect.skipReason,
          ),
        );
      }
    }

    return DeviationResolution(leaves: result, effects: effects);
  }

  AuthorityComponent? _findComponent(
    List<AuthorityComponent> components,
    String insumoId,
  ) {
    for (final component in components) {
      if (component.ingredientType == AuthorityIngredientType.subRecipe) {
        continue;
      }
      if (component.insumoId == insumoId) return component;
    }
    return null;
  }

  /// The unit of a component: what the recipe declared, falling back to the
  /// insumo's own consumption unit (the recipe writes the insumo's unit).
  String? _unitOf(
    AuthorityComponent component,
    Map<String, AuthorityInsumo> insumosById,
  ) {
    final insumo = insumosById[component.insumoId];
    return insumo?.consumptionUom;
  }

  _EffectResult _applyRemove(
    List<BomLeaf> leaves,
    AuthorityComponent target,
    String optionId,
    String effect,
  ) {
    // The component's leaf stops being consumed. The whole milk of the
    // recipe is NOT downloaded: the customer received almond milk instead.
    final remaining = leaves
        .where((leaf) => leaf.rootComponentId != target.id)
        .toList(growable: false);
    return _EffectResult.applied(
      leaves: remaining,
      effect: AppliedModifierEffect(
        optionId: optionId,
        effect: effect,
        insumoId: target.insumoId,
        quantityPerSaleUnit: 0,
      ),
    );
  }

  _EffectResult _applySwap(
    List<BomLeaf> leaves,
    AuthorityComponent target,
    Modifier modifier,
    String optionId,
    Map<String, AuthorityInsumo> insumosById,
  ) {
    final substituteId = modifier.effectInsumoId;
    if (substituteId == null) {
      return _EffectResult.skipped(
        const AppliedModifierEffect(
          optionId: '',
          effect: 'SWAP',
          skipReason: ModifierEffectSkipReason.incomplete,
        ),
      );
    }
    // THE SOHO GUARANTEE: an insumo this company has not registered cannot
    // be deducted. The effect does not apply and the sale goes through.
    final substitute = insumosById[substituteId];
    if (substitute == null) {
      return _EffectResult.skipped(
        AppliedModifierEffect(
          optionId: optionId,
          effect: 'SWAP',
          insumoId: substituteId,
          skipReason: ModifierEffectSkipReason.insumoNotInCatalog,
        ),
      );
    }
    final quantity = _resolveQuantity(
      modifier,
      target,
      insumosById,
      substituteId,
      optionId: optionId,
      effect: 'SWAP',
    );
    if (quantity == null) {
      return _EffectResult.skipped(
        AppliedModifierEffect(
          optionId: optionId,
          effect: 'SWAP',
          insumoId: substituteId,
          skipReason: ModifierEffectSkipReason.unitMismatch,
        ),
      );
    }

    // The replaced component is not consumed; the substitute is, in the
    // component's own quantity.
    final result = leaves
        .where((leaf) => leaf.rootComponentId != target.id)
        .toList();
    _mergeLeaf(
      result,
      insumoId: substituteId,
      quantityPerSaleUnit: quantity,
      rootComponentId: null,
    );
    return _EffectResult.applied(
      leaves: result,
      effect: AppliedModifierEffect(
        optionId: optionId,
        effect: 'SWAP',
        insumoId: substituteId,
        quantityPerSaleUnit: quantity,
      ),
    );
  }

  _EffectResult _applyScale(
    List<BomLeaf> leaves,
    AuthorityComponent target,
    Modifier modifier,
    String optionId,
  ) {
    final factor = modifier.effectFactor;
    if (factor == null || factor <= 0) {
      return _EffectResult.skipped(
        AppliedModifierEffect(
          optionId: optionId,
          effect: 'SCALE',
          skipReason: ModifierEffectSkipReason.incomplete,
        ),
      );
    }
    var applied = false;
    final result = leaves.map((leaf) {
      if (leaf.rootComponentId != target.id) return leaf;
      applied = true;
      return BomLeaf(
        insumoId: leaf.insumoId,
        quantityPerSaleUnit: roundQuantity(
          leaf.quantityPerSaleUnit * factor,
        ),
        rootComponentId: leaf.rootComponentId,
      );
    }).toList(growable: false);

    return _EffectResult.applied(
      leaves: result,
      effect: AppliedModifierEffect(
        optionId: optionId,
        effect: 'SCALE',
        insumoId: target.insumoId,
        quantityPerSaleUnit: applied
            ? target.quantityPerSaleUnit * factor
            : null,
      ),
    );
  }

  _EffectResult _applyAdd(
    List<BomLeaf> leaves,
    AuthorityComponent? target,
    Modifier modifier,
    String optionId,
    Map<String, AuthorityInsumo> insumosById,
  ) {
    final insumoId = modifier.effectInsumoId;
    if (insumoId == null) {
      return _EffectResult.skipped(
        const AppliedModifierEffect(
          optionId: '',
          effect: 'ADD',
          skipReason: ModifierEffectSkipReason.incomplete,
        ),
      );
    }
    // THE SOHO GUARANTEE, again: an insumo the company has not registered
    // cannot be deducted, so the effect does not apply.
    if (!insumosById.containsKey(insumoId)) {
      return _EffectResult.skipped(
        AppliedModifierEffect(
          optionId: optionId,
          effect: 'ADD',
          insumoId: insumoId,
          skipReason: ModifierEffectSkipReason.insumoNotInCatalog,
        ),
      );
    }
    final quantity = _resolveQuantity(
      modifier,
      target,
      insumosById,
      insumoId,
      optionId: optionId,
      effect: 'ADD',
    );
    if (quantity == null) {
      return _EffectResult.skipped(
        AppliedModifierEffect(
          optionId: optionId,
          effect: 'ADD',
          insumoId: insumoId,
          skipReason: target == null
              ? ModifierEffectSkipReason.incomplete
              : ModifierEffectSkipReason.unitMismatch,
        ),
      );
    }

    final result = List<BomLeaf>.of(leaves);
    _mergeLeaf(
      result,
      insumoId: insumoId,
      quantityPerSaleUnit: quantity,
      rootComponentId: null,
    );
    return _EffectResult.applied(
      leaves: result,
      effect: AppliedModifierEffect(
        optionId: optionId,
        effect: 'ADD',
        insumoId: insumoId,
        quantityPerSaleUnit: quantity,
      ),
    );
  }

  /// The quantity the effect applies per sold unit.
  ///
  /// The operator's explicit quantity wins. Otherwise the quantity is
  /// INHERITED from the recipe component — but only when the inherited
  /// number means the same thing in the affected insumo's unit. When the
  /// units differ, the effect waits for an explicit quantity instead of
  /// deducting a wrong number.
  double? _resolveQuantity(
    Modifier modifier,
    AuthorityComponent? target,
    Map<String, AuthorityInsumo> insumosById,
    String affectedInsumoId, {
    required String optionId,
    required String effect,
  }) {
    final explicit = modifier.effectQuantity;
    if (explicit != null) {
      if (explicit <= 0) return null;
      return roundQuantity(explicit);
    }
    if (target == null) return null;

    final affectedUnit = insumosById[affectedInsumoId]?.consumptionUom;
    final targetUnit = _unitOf(target, insumosById);
    if (affectedUnit != null &&
        targetUnit != null &&
        affectedUnit.toUpperCase() != targetUnit.toUpperCase()) {
      return null;
    }
    return roundQuantity(target.quantityPerSaleUnit);
  }

  /// Adds the quantity to the leaf of that insumo, or creates it. A leaf
  /// that already exists keeps its recipe component: the insumo IS a
  /// component of the recipe, and the backend validates that id against the
  /// recipe's details.
  void _mergeLeaf(
    List<BomLeaf> leaves, {
    required String insumoId,
    required double quantityPerSaleUnit,
    required String? rootComponentId,
  }) {
    for (var i = 0; i < leaves.length; i++) {
      if (leaves[i].insumoId != insumoId) continue;
      final existing = leaves[i];
      leaves[i] = BomLeaf(
        insumoId: existing.insumoId,
        quantityPerSaleUnit: roundQuantity(
          existing.quantityPerSaleUnit + quantityPerSaleUnit,
        ),
        rootComponentId: existing.rootComponentId,
      );
      return;
    }
    leaves.add(
      BomLeaf(
        insumoId: insumoId,
        quantityPerSaleUnit: roundQuantity(quantityPerSaleUnit),
        rootComponentId: rootComponentId,
      ),
    );
  }
}

/// The inventory quantities are rounded to the same four decimals the
/// backend keeps (NUMERIC(14,4)), so the terminal and the cloud agree on
/// the number instead of differing by a float epsilon.
double roundQuantity(double value) {
  final factor = 10000.0;
  return (value * factor).roundToDouble() / factor;
}

/// The outcome of ONE effect: the demand it produced (when it applied) and
/// what happened to it.
class _EffectResult {
  const _EffectResult._({
    required this.leaves,
    required this.effect,
    required this.applied,
  });

  final List<BomLeaf> leaves;
  final AppliedModifierEffect effect;
  final bool applied;

  factory _EffectResult.applied({
    required List<BomLeaf> leaves,
    required AppliedModifierEffect effect,
  }) =>
      _EffectResult._(leaves: leaves, effect: effect, applied: true);

  factory _EffectResult.skipped(AppliedModifierEffect effect) =>
      _EffectResult._(leaves: const [], effect: effect, applied: false);
}
