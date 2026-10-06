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

  ModifierOptionEntity({
    required this.id,
    required this.groupId,
    required this.name,
    this.priceDelta = 0.0,
    this.isDefault = false,
    this.sortOrder = 0,
    this.isActive = true,
  });
}
