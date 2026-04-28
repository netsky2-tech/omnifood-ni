// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'inventory_adjustment.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$InventoryAdjustmentImpl _$$InventoryAdjustmentImplFromJson(
        Map<String, dynamic> json) =>
    _$InventoryAdjustmentImpl(
      id: json['id'] as String,
      ingredientId: json['ingredientId'] as String,
      delta: (json['delta'] as num).toDouble(),
      reason: json['reason'] as String,
      timestamp: DateTime.parse(json['timestamp'] as String),
    );

Map<String, dynamic> _$$InventoryAdjustmentImplToJson(
        _$InventoryAdjustmentImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'ingredientId': instance.ingredientId,
      'delta': instance.delta,
      'reason': instance.reason,
      'timestamp': instance.timestamp.toIso8601String(),
    };
