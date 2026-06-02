// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'inventory_outbox_delta.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$InventoryOutboxDeltaImpl _$$InventoryOutboxDeltaImplFromJson(
        Map<String, dynamic> json) =>
    _$InventoryOutboxDeltaImpl(
      idempotencyKey: json['idempotencyKey'] as String,
      sourceDeviceId: json['sourceDeviceId'] as String,
      sourceSequence: json['sourceSequence'] as int,
      documentType: json['documentType'] as String,
      movements: (json['movements'] as List<dynamic>)
          .map((e) =>
              InventoryOutboxMovement.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$$InventoryOutboxDeltaImplToJson(
        _$InventoryOutboxDeltaImpl instance) =>
    <String, dynamic>{
      'idempotencyKey': instance.idempotencyKey,
      'sourceDeviceId': instance.sourceDeviceId,
      'sourceSequence': instance.sourceSequence,
      'documentType': instance.documentType,
      'movements': instance.movements,
    };

_$InventoryOutboxMovementImpl _$$InventoryOutboxMovementImplFromJson(
        Map<String, dynamic> json) =>
    _$InventoryOutboxMovementImpl(
      insumoId: json['insumoId'] as String,
      quantity: (json['quantity'] as num).toDouble(),
      unitCostNio: (json['unitCostNio'] as num?)?.toDouble(),
    );

Map<String, dynamic> _$$InventoryOutboxMovementImplToJson(
        _$InventoryOutboxMovementImpl instance) =>
    <String, dynamic>{
      'insumoId': instance.insumoId,
      'quantity': instance.quantity,
      'unitCostNio': instance.unitCostNio,
    };
