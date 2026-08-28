import 'package:freezed_annotation/freezed_annotation.dart';
import 'kitchen_order_item.dart';

part 'kitchen_order.freezed.dart';
part 'kitchen_order.g.dart';

@freezed
class KitchenOrder with _$KitchenOrder {
  const factory KitchenOrder({
    required String id,
    required String ticketId,
    String? tableNumber,
    String? tableName,
    String? waiterName,
    @Default('COCINA') String station,
    @Default('PENDIENTE') String status,
    required DateTime createdAt,
    DateTime? startedAt,
    DateTime? readyAt,
    DateTime? servedAt,
    String? notes,
    @Default([]) List<KitchenOrderItem> items,
  }) = _KitchenOrder;

  factory KitchenOrder.fromJson(Map<String, dynamic> json) =>
      _$KitchenOrderFromJson(json);
}
