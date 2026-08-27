import 'package:freezed_annotation/freezed_annotation.dart';

part 'promotion.freezed.dart';
part 'promotion.g.dart';

enum PromotionType {
  buyXGetYFree, // e.g., 2x1 (Buy 1 Get 1 Free)
  percentageDiscount,
  fixedDiscount,
  comboPackage,
}

@freezed
class Promotion with _$Promotion {
  const factory Promotion({
    required String id,
    required String name,
    required PromotionType type,
    String? targetProductId,
    String? targetCategoryId,
    @Default(0) int buyQuantity,
    @Default(0) int getQuantity,
    @Default(0.0) double discountValue,
    @Default(0.0) double minOrderAmount,
    @Default([]) List<int> daysOfWeek, // 1 = Monday, 7 = Sunday
    String? startTime, // "HH:mm" e.g., "17:00"
    String? endTime, // "HH:mm" e.g., "20:00"
    int? startDate, // timestamp millis
    int? endDate, // timestamp millis
    @Default(0) int priority,
    @Default(true) bool isStackable,
    @Default(true) bool isActive,
  }) = _Promotion;

  factory Promotion.fromJson(Map<String, dynamic> json) => _$PromotionFromJson(json);
}
