import 'package:freezed_annotation/freezed_annotation.dart';

part 'inventory_movement.freezed.dart';
part 'inventory_movement.g.dart';

enum MovementType {
  sale,
  purchase,
  shrinkage,
  adjustment,
  reversal,
}

@freezed
class InventoryMovement with _$InventoryMovement {
  const factory InventoryMovement({
    required String id,
    required String insumoId,
    required MovementType type,
    required double quantity,
    required double previousStock,
    required double newStock,
    required DateTime timestamp,
    String? reason,
    String? userId,
  }) = _InventoryMovement;

  factory InventoryMovement.fromJson(Map<String, dynamic> json) => _$InventoryMovementFromJson(json);
}
