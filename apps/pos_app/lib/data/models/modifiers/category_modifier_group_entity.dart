import 'package:floor/floor.dart';

/// Local mirror of one backend `category_modifier_groups` row: a group
/// attached to a product CATEGORY (catalog value). [catalogCode] is the
/// denormalized `catalog_values.code` the backend ships — a debug/display
/// aid; identity matching stays on [catalogValueId].
@Entity(
  tableName: 'category_modifier_groups',
  indices: [Index(value: ['catalog_value_id'])],
)
class CategoryModifierGroupEntity {
  @primaryKey
  final String id;
  @ColumnInfo(name: 'catalog_value_id')
  final String catalogValueId;
  @ColumnInfo(name: 'catalog_code')
  final String catalogCode;
  @ColumnInfo(name: 'group_id')
  final String groupId;
  @ColumnInfo(name: 'sort_order')
  final int sortOrder;

  CategoryModifierGroupEntity({
    required this.id,
    required this.catalogValueId,
    this.catalogCode = '',
    required this.groupId,
    this.sortOrder = 0,
  });
}
