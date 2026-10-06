import 'package:floor/floor.dart';

/// Local mirror of one backend `product_modifier_groups` row: a per-product
/// exception attaching a group to a single PRODUCT.
@Entity(
  tableName: 'product_modifier_groups',
  indices: [Index(value: ['product_id'])],
)
class ProductModifierGroupEntity {
  @primaryKey
  final String id;
  @ColumnInfo(name: 'product_id')
  final String productId;
  @ColumnInfo(name: 'group_id')
  final String groupId;
  @ColumnInfo(name: 'sort_order')
  final int sortOrder;

  ProductModifierGroupEntity({
    required this.id,
    required this.productId,
    required this.groupId,
    this.sortOrder = 0,
  });
}
