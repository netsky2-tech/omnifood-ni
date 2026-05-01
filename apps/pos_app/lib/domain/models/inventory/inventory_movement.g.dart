// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'inventory_movement.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$InventoryMovementImpl _$$InventoryMovementImplFromJson(
        Map<String, dynamic> json) =>
    _$InventoryMovementImpl(
      id: json['id'] as String,
      insumoId: json['insumoId'] as String,
      type: $enumDecode(_$MovementTypeEnumMap, json['type']),
      quantity: (json['quantity'] as num).toDouble(),
      previousStock: (json['previousStock'] as num).toDouble(),
      newStock: (json['newStock'] as num).toDouble(),
      timestamp: DateTime.parse(json['timestamp'] as String),
      reason: json['reason'] as String?,
      userId: json['userId'] as String?,
    );

Map<String, dynamic> _$$InventoryMovementImplToJson(
        _$InventoryMovementImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'insumoId': instance.insumoId,
      'type': _$MovementTypeEnumMap[instance.type]!,
      'quantity': instance.quantity,
      'previousStock': instance.previousStock,
      'newStock': instance.newStock,
      'timestamp': instance.timestamp.toIso8601String(),
      'reason': instance.reason,
      'userId': instance.userId,
    };

const _$MovementTypeEnumMap = {
  MovementType.sale: 'sale',
  MovementType.purchase: 'purchase',
  MovementType.shrinkage: 'shrinkage',
  MovementType.adjustment: 'adjustment',
  MovementType.reversal: 'reversal',
};
