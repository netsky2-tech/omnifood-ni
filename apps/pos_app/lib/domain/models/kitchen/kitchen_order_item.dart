import 'package:freezed_annotation/freezed_annotation.dart';

part 'kitchen_order_item.freezed.dart';
part 'kitchen_order_item.g.dart';

@freezed
class KitchenOrderItem with _$KitchenOrderItem {
  const factory KitchenOrderItem({
    required String id,
    required String kitchenOrderId,
    required String productId,
    required String productName,
    required double quantity,
    @Default('PENDIENTE') String status,
    String? notes,
    @Default([]) List<String> modifiers,
  }) = _KitchenOrderItem;

  factory KitchenOrderItem.fromJson(Map<String, dynamic> json) =>
      _$KitchenOrderItemFromJson(json);
}
