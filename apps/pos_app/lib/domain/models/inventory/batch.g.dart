// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'batch.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$BatchImpl _$$BatchImplFromJson(Map<String, dynamic> json) => _$BatchImpl(
      id: json['id'] as String,
      insumoId: json['insumoId'] as String,
      batchNumber: json['batchNumber'] as String,
      expirationDate: DateTime.parse(json['expirationDate'] as String),
      remainingStock: (json['remainingStock'] as num).toDouble(),
      cost: (json['cost'] as num).toDouble(),
    );

Map<String, dynamic> _$$BatchImplToJson(_$BatchImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'insumoId': instance.insumoId,
      'batchNumber': instance.batchNumber,
      'expirationDate': instance.expirationDate.toIso8601String(),
      'remainingStock': instance.remainingStock,
      'cost': instance.cost,
    };
