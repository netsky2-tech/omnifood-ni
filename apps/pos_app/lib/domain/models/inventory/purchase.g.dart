// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'purchase.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$PurchaseImpl _$$PurchaseImplFromJson(Map<String, dynamic> json) =>
    _$PurchaseImpl(
      id: json['id'] as String,
      insumoId: json['insumoId'] as String,
      supplierId: json['supplierId'] as String,
      quantity: (json['quantity'] as num).toDouble(),
      unitCost: (json['unitCost'] as num).toDouble(),
      timestamp: DateTime.parse(json['timestamp'] as String),
    );

Map<String, dynamic> _$$PurchaseImplToJson(_$PurchaseImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'insumoId': instance.insumoId,
      'supplierId': instance.supplierId,
      'quantity': instance.quantity,
      'unitCost': instance.unitCost,
      'timestamp': instance.timestamp.toIso8601String(),
    };
