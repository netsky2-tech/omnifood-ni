import 'package:floor/floor.dart';
import 'kitchen_order_entity.dart';

@Entity(
  tableName: 'kitchen_order_items',
  foreignKeys: [
    ForeignKey(
      childColumns: ['kitchen_order_id'],
      parentColumns: ['id'],
      entity: KitchenOrderEntity,
      onDelete: ForeignKeyAction.cascade,
    ),
  ],
  indices: [
    Index(value: ['kitchen_order_id']),
  ],
)
class KitchenOrderItemEntity {
  @primaryKey
  final String id;

  @ColumnInfo(name: 'kitchen_order_id')
  final String kitchenOrderId;

  @ColumnInfo(name: 'product_id')
  final String productId;

  @ColumnInfo(name: 'product_name')
  final String productName;

  @ColumnInfo(name: 'quantity')
  final double quantity;

  @ColumnInfo(name: 'status')
  final String status;

  @ColumnInfo(name: 'notes')
  final String? notes;

  @ColumnInfo(name: 'modifiers_json')
  final String? modifiersJson;

  const KitchenOrderItemEntity({
    required this.id,
    required this.kitchenOrderId,
    required this.productId,
    required this.productName,
    required this.quantity,
    required this.status,
    this.notes,
    this.modifiersJson,
  });
}
