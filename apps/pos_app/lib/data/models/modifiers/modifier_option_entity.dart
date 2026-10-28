import 'package:floor/floor.dart';

/// Local mirror of one backend `modifier_options` row (selectable option
/// inside a modifier group). [priceDelta] is the amount added to the
/// product's base price and may be negative (discount options). Tombstones
/// ([isActive] false) ride along so soft-deletes mirror.
@Entity(
  tableName: 'modifier_options',
  indices: [Index(value: ['group_id'])],
)
class ModifierOptionEntity {
  @primaryKey
  final String id;
  @ColumnInfo(name: 'group_id')
  final String groupId;
  final String name;
  @ColumnInfo(name: 'price_delta')
  final double priceDelta;
  @ColumnInfo(name: 'is_default')
  final bool isDefault;
  @ColumnInfo(name: 'sort_order')
  final int sortOrder;
  @ColumnInfo(name: 'is_active')
  final bool isActive;

  /// R28: the option's INVENTORY effect (NONE / ADD / REMOVE / SWAP /
  /// SCALE). 'NONE' means the option is price-only, which is what every
  /// option that never declared an effect is — the local mirror therefore
  /// behaves EXACTLY as before R28 for them.
  @ColumnInfo(name: 'inventory_effect')
  final String inventoryEffect;

  /// The insumo the effect acts ON: added (ADD) or substituted in (SWAP).
  @ColumnInfo(name: 'effect_insumo_id')
  final String? effectInsumoId;

  /// The insumo of the recipe component the effect affects.
  @ColumnInfo(name: 'effect_target_insumo_id')
  final String? effectTargetInsumoId;

  /// The quantity to apply per sold unit. Null = inherited from the recipe
  /// component; it is never 0, because "nothing" is not a quantity.
  @ColumnInfo(name: 'effect_quantity')
  final double? effectQuantity;

  /// The multiplier of a SCALE.
  @ColumnInfo(name: 'effect_factor')
  final double? effectFactor;

  ModifierOptionEntity({
    required this.id,
    required this.groupId,
    required this.name,
    this.priceDelta = 0.0,
    this.isDefault = false,
    this.sortOrder = 0,
    this.isActive = true,
    this.inventoryEffect = 'NONE',
    this.effectInsumoId,
    this.effectTargetInsumoId,
    this.effectQuantity,
    this.effectFactor,
  });
}
