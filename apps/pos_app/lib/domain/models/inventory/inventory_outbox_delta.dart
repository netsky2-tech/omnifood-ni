import 'package:freezed_annotation/freezed_annotation.dart';

part 'inventory_outbox_delta.freezed.dart';
part 'inventory_outbox_delta.g.dart';

@freezed
class InventoryOutboxDelta with _$InventoryOutboxDelta {
  const factory InventoryOutboxDelta({
    required String idempotencyKey,
    required String sourceDeviceId,
    required int sourceSequence,
    required String documentType,
    required List<InventoryOutboxMovement> movements,
  }) = _InventoryOutboxDelta;

  factory InventoryOutboxDelta.fromJson(Map<String, dynamic> json) =>
      _$InventoryOutboxDeltaFromJson(json);
}

@freezed
class InventoryOutboxMovement with _$InventoryOutboxMovement {
  const factory InventoryOutboxMovement({
    required String insumoId,
    required double quantity,
    double? unitCostNio,
  }) = _InventoryOutboxMovement;

  factory InventoryOutboxMovement.fromJson(Map<String, dynamic> json) =>
      _$InventoryOutboxMovementFromJson(json);
}
