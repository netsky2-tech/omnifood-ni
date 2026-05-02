import 'package:freezed_annotation/freezed_annotation.dart';

part 'promotion.freezed.dart';
part 'promotion.g.dart';

enum PromotionType {
  buyXGetYFree, // e.g., 2x1 (Buy 1 Get 1 Free)
  percentageDiscount,
  fixedDiscount,
}

@freezed
class Promotion with _$Promotion {
  const factory Promotion({
    required String id,
    required String name,
    required PromotionType type,
    required String targetProductId,
    @Default(0) int buyQuantity,
    @Default(0) int getQuantity,
    @Default(0.0) double discountValue,
    @Default(true) bool isActive,
  }) = _Promotion;

  factory Promotion.fromJson(Map<String, dynamic> json) => _$PromotionFromJson(json);
}
