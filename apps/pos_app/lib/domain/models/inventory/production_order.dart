import 'package:freezed_annotation/freezed_annotation.dart';

part 'production_order.freezed.dart';
part 'production_order.g.dart';

@freezed
class ProductionOrder with _$ProductionOrder {
  const factory ProductionOrder({
    required String id,
    required String recipeVersionId,
    required String producedInsumoId,
    required double orderQuantity,
    required DateTime operationDate,
  }) = _ProductionOrder;

  factory ProductionOrder.fromJson(Map<String, dynamic> json) =>
      _$ProductionOrderFromJson(json);
}
