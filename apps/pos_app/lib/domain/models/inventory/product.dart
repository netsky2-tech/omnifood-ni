import 'package:freezed_annotation/freezed_annotation.dart';
import '../fulfillment/fulfillment_contracts.dart';

part 'product.freezed.dart';
part 'product.g.dart';

@freezed
class Product with _$Product {
  const factory Product({
    required String id,
    required String name,
    required String uom,
    required double stock,
    required double averageCost,
    required double sellPrice,
    @Default(true) bool isActive,
    String? sku,
    String? barcode,
    String? category,
    /// T0.5c: resolved category identity (catalog_values.id). Promotions
    /// match strictly on this id, never on the free-text [category].
    String? categoryId,
    String? imageUrl,
    @Default(false) bool isPrepared,
    @Default('SIMPLE') String productType,
    String? mappingVersionId,
    String? insumoId,
    String? createdAt,
    InventoryPolicy? inventoryPolicy,
    String? directStockInsumoId,
    /// B2e D-3 fail-closed default: 0.0 (exempt).
    /// A product without an explicit synced rate is treated as exempt, never
    /// silently taxed at an invented 15%. The backend payload is the rate's
    /// source of truth; whether IVA applies at sale time is decided by the
    /// active fiscal regime (calculator/receipt layer), not by this default.
    @Default(0.0) double taxRate,
    @Default(false) bool isTaxExempt,
    @Default([]) List<ProductVariant> variants,
    @Default([]) List<Modifier> availableModifiers,
    /// T2.3: effective modifier groups resolved at load time from the local
    /// mirror, mirroring the server's category-inheritance + per-product
    /// exception rule. Empty when the mirror has nothing for the product.
    @Default([]) List<EffectiveModifierGroup> availableModifierGroups,
  }) = _Product;

  factory Product.fromJson(Map<String, dynamic> json) =>
      _$ProductFromJson(json);
}

extension ProductFiscalX on Product {
  /// Resolves the canonical tax treatment:
  /// A product is genuinely exempt if [isTaxExempt] is explicitly true OR [taxRate] is 0.0.
  bool get isGenuinelyExempt => isTaxExempt || taxRate == 0.0;

  /// Canonical effective nominal tax rate for the product under standard regime.
  /// If the product is exempt ([isGenuinelyExempt] == true), the effective rate is strictly 0.0.
  /// Resolves contradictory states deterministically (e.g. taxRate: 0.15 + isTaxExempt: true => 0.0).
  double get effectiveTaxRate => isGenuinelyExempt ? 0.0 : (taxRate < 0.0 ? 0.0 : taxRate);
}

@freezed
class ProductVariant with _$ProductVariant {
  const factory ProductVariant({
    required String id,
    required String name, // e.g., "Grande", "Vainilla"
    required double priceAdjustment,
  }) = _ProductVariant;

  factory ProductVariant.fromJson(Map<String, dynamic> json) =>
      _$ProductVariantFromJson(json);
}

@freezed
class Modifier with _$Modifier {
  const factory Modifier({
    required String id,
    required String name,
    required double extraPrice,
    /// How many units of this option the line includes. Defaults to 1 so
    /// old persisted payloads (name + extraPrice only, invoice history
    /// included) keep loading as quantity 1.
    @Default(1) int quantity,
    /// R28: the BACKEND's option id. The identity travels with the line so
    /// the sale can say WHICH option was sold — the name alone was free
    /// text ("Grupo: Opción") and proved nothing.
    ///
    /// NULL for the legacy local modifiers: the cloud has never known those
    /// options, and inventing an identifier for them would put a fiction in
    /// a fiscal record.
    String? optionId,
    /// The backend's group id. Null for the legacy local modifiers, for the
    /// same reason.
    String? groupId,
    /// R28: the option's INVENTORY effect. 'NONE' means price-only, which
    /// is what every option that never declared an effect is.
    @Default('NONE') String inventoryEffect,
    /// The insumo the effect acts ON: added (ADD) or substituted in (SWAP).
    String? effectInsumoId,
    /// The insumo of the recipe component the effect affects.
    String? effectTargetInsumoId,
    /// The quantity to apply per sold unit. Null = inherited from the
    /// recipe component; it is never 0, because "nothing" is not a
    /// quantity.
    double? effectQuantity,
    /// The multiplier of a SCALE.
    double? effectFactor,
    /// ME-04: the TRUTH of the effect, as the sale knew it.
    ///
    /// 'APPLIED' — the effect moved the stock. 'PENDING' — the sale went
    /// through but the effect did NOT touch the stock, and
    /// [effectSkipReason] says why. Null — the line carries no effect at
    /// all (a price-only option, or a terminal that predates this wire).
    ///
    /// It is written at SALE TIME (the resolver is the only place that
    /// knows), never guessed in the dialog: a line that says APPLIED when
    /// the stock did not move would be a lie in the cloud.
    String? effectStatus,
    /// ME-04: why the effect did not apply. The same vocabulary the
    /// resolver and the backoffice use (INCOMPLETE, UNIT_MISMATCH,
    /// INSUMSO_NOT_IN_CATALOG, COMPONENT_NOT_IN_RECIPE).
    String? effectSkipReason,
    /// ME-04: where the applied quantity came from: 'DECLARED' (the
    /// backoffice configured it), 'INHERITED' (the recipe's component) or
    /// 'OVERRIDE' (a supervisor marked it).
    String? effectQuantitySource,
    /// ME-04: the supervisor who authorized a quantity override, and the
    /// evidence of that authorization (the credential used and the reason).
    /// Null when nobody had to authorize anything.
    String? effectAuthorizedBy,
    String? effectAuthorizationMethod,
    String? effectAuthorizationReason,
  }) = _Modifier;

  factory Modifier.fromJson(Map<String, dynamic> json) =>
      _$ModifierFromJson(json);
}

/// R28: whether the option declares an effect on the stock at all.
extension ModifierInventoryEffect on Modifier {
  bool get hasInventoryEffect => inventoryEffect != 'NONE';
}

/// One selectable option inside an effective modifier group. Kept minimal:
/// the selector only needs identity, label, price delta and the default
/// flag.
@freezed
class EffectiveModifierOption with _$EffectiveModifierOption {
  const factory EffectiveModifierOption({
    required String id,
    required String name,
    required double priceDelta,
    required bool isDefault,
    /// R28: the option's INVENTORY effect, mirrored from the catalogue
    /// delta. 'NONE' means the option is price-only.
    @Default('NONE') String inventoryEffect,
    /// The insumo the effect acts ON: added (ADD) or substituted in (SWAP).
    String? effectInsumoId,
    /// The insumo of the recipe component the effect affects.
    String? effectTargetInsumoId,
    /// The quantity to apply per sold unit. Null = inherited.
    double? effectQuantity,
    /// The multiplier of a SCALE.
    double? effectFactor,
  }) = _EffectiveModifierOption;

  factory EffectiveModifierOption.fromJson(Map<String, dynamic> json) =>
      _$EffectiveModifierOptionFromJson(json);
}

/// One effective modifier group for a product, resolved on-device. [source]
/// is exactly 'category' (inherited through the product's category) or
/// 'product' (the product's own exception, which wins when both exist).
/// Position in the enclosing list is the deterministic display order; no
/// sort field is carried.
@freezed
class EffectiveModifierGroup with _$EffectiveModifierGroup {
  const factory EffectiveModifierGroup({
    required String id,
    required String name,
    required int minSelected,
    required int maxSelected,
    required bool allowQuantities,
    required String source,
    @Default([]) List<EffectiveModifierOption> options,
  }) = _EffectiveModifierGroup;

  factory EffectiveModifierGroup.fromJson(Map<String, dynamic> json) =>
      _$EffectiveModifierGroupFromJson(json);
}
