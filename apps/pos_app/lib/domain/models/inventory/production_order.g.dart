// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'production_order.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$ProductionOrderImpl _$$ProductionOrderImplFromJson(
        Map<String, dynamic> json) =>
    _$ProductionOrderImpl(
      id: json['id'] as String,
      recipeVersionId: json['recipeVersionId'] as String,
      producedInsumoId: json['producedInsumoId'] as String,
      orderQuantity: (json['orderQuantity'] as num).toDouble(),
      operationDate: DateTime.parse(json['operationDate'] as String),
    );

Map<String, dynamic> _$$ProductionOrderImplToJson(
        _$ProductionOrderImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'recipeVersionId': instance.recipeVersionId,
      'producedInsumoId': instance.producedInsumoId,
      'orderQuantity': instance.orderQuantity,
      'operationDate': instance.operationDate.toIso8601String(),
    };
