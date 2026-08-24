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
      unitCostNio: (json['unitCostNio'] as num?)?.toDouble(),
      sourceDocumentType: json['sourceDocumentType'] as String?,
      sourceDocumentId: json['sourceDocumentId'] as String?,
      originMovementId: json['originMovementId'] as String?,
      originInvoiceItemId: json['originInvoiceItemId'] as String?,
      batchDeductions: (json['batchDeductions'] as List<dynamic>?)
          ?.map((e) => BatchDeduction.fromJson(e as Map<String, dynamic>))
          .toList(),
      estadoCosteo: json['estadoCosteo'] as int?,
      intentosCount: json['intentosCount'] as int?,
      bloqueoMotivo: json['bloqueoMotivo'] as String?,
      autorizadoPorUsuarioId: json['autorizadoPorUsuarioId'] as String?,
      fechaAutorizacion: json['fechaAutorizacion'] as String?,
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
      'unitCostNio': instance.unitCostNio,
      'sourceDocumentType': instance.sourceDocumentType,
      'sourceDocumentId': instance.sourceDocumentId,
      'originMovementId': instance.originMovementId,
      'originInvoiceItemId': instance.originInvoiceItemId,
      'batchDeductions':
          instance.batchDeductions?.map((e) => e.toJson()).toList(),
      'estadoCosteo': instance.estadoCosteo,
      'intentosCount': instance.intentosCount,
      'bloqueoMotivo': instance.bloqueoMotivo,
      'autorizadoPorUsuarioId': instance.autorizadoPorUsuarioId,
      'fechaAutorizacion': instance.fechaAutorizacion,
    };

const _$MovementTypeEnumMap = {
  MovementType.sale: 'sale',
  MovementType.purchase: 'purchase',
  MovementType.production: 'production',
  MovementType.shrinkage: 'shrinkage',
  MovementType.adjustment: 'adjustment',
  MovementType.reversal: 'reversal',
};
