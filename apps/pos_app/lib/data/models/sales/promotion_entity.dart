import 'package:floor/floor.dart';

@Entity(tableName: 'promotions')
class PromotionEntity {
  @primaryKey
  final String id;
  final String name;
  final String type; // 'buyXGetYFree', 'percentageDiscount', 'fixedDiscount'
  @ColumnInfo(name: 'target_product_id')
  final String targetProductId;
  @ColumnInfo(name: 'buy_quantity')
  final int buyQuantity;
  @ColumnInfo(name: 'get_quantity')
  final int getQuantity;
  @ColumnInfo(name: 'discount_value')
  final double discountValue;
  @ColumnInfo(name: 'is_active')
  final bool isActive;

  PromotionEntity({
    required this.id,
    required this.name,
    required this.type,
    required this.targetProductId,
    this.buyQuantity = 0,
    this.getQuantity = 0,
    this.discountValue = 0.0,
    this.isActive = true,
  });
}
