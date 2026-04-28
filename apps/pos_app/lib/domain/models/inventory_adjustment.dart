import 'package:freezed_annotation/freezed_annotation.dart';

part 'inventory_adjustment.freezed.dart';
part 'inventory_adjustment.g.dart';

@freezed
class InventoryAdjustment with _$InventoryAdjustment {
  const factory InventoryAdjustment({
    required String id,
    required String ingredientId,
    required double delta,
    required String reason,
    required DateTime timestamp,
  }) = _InventoryAdjustment;

  factory InventoryAdjustment.fromJson(Map<String, dynamic> json) => _$InventoryAdjustmentFromJson(json);
}
