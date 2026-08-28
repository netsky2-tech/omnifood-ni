import 'package:floor/floor.dart';

@Entity(tableName: 'promotions')
class PromotionEntity {
  @primaryKey
  final String id;
  final String name;
  final String type; // 'buyXGetYFree', 'percentageDiscount', 'fixedDiscount', 'comboPackage'
  @ColumnInfo(name: 'target_product_id')
  final String? targetProductId;
  @ColumnInfo(name: 'target_category_id')
  final String? targetCategoryId;
  @ColumnInfo(name: 'buy_quantity')
  final int buyQuantity;
  @ColumnInfo(name: 'get_quantity')
  final int getQuantity;
  @ColumnInfo(name: 'discount_value')
  final double discountValue;
  @ColumnInfo(name: 'min_order_amount')
  final double minOrderAmount;
  @ColumnInfo(name: 'days_of_week')
  final String? daysOfWeek; // comma-separated e.g. "5,6"
  @ColumnInfo(name: 'start_time')
  final String? startTime; // "HH:mm"
  @ColumnInfo(name: 'end_time')
  final String? endTime; // "HH:mm"
  @ColumnInfo(name: 'start_date')
  final int? startDate;
  @ColumnInfo(name: 'end_date')
  final int? endDate;
  @ColumnInfo(name: 'priority')
  final int priority;
  @ColumnInfo(name: 'is_stackable')
  final bool isStackable;
  @ColumnInfo(name: 'is_active')
  final bool isActive;

  PromotionEntity({
    required this.id,
    required this.name,
    required this.type,
    this.targetProductId,
    this.targetCategoryId,
    this.buyQuantity = 0,
    this.getQuantity = 0,
    this.discountValue = 0.0,
    this.minOrderAmount = 0.0,
    this.daysOfWeek,
    this.startTime,
    this.endTime,
    this.startDate,
    this.endDate,
    this.priority = 0,
    this.isStackable = true,
    this.isActive = true,
  });
}
