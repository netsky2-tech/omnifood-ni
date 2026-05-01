// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'uom_conversion.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$UomConversionImpl _$$UomConversionImplFromJson(Map<String, dynamic> json) =>
    _$UomConversionImpl(
      id: json['id'] as String,
      insumoId: json['insumoId'] as String,
      unitName: json['unitName'] as String,
      factor: (json['factor'] as num).toDouble(),
      isDefault: json['isDefault'] as bool? ?? false,
    );

Map<String, dynamic> _$$UomConversionImplToJson(_$UomConversionImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'insumoId': instance.insumoId,
      'unitName': instance.unitName,
      'factor': instance.factor,
      'isDefault': instance.isDefault,
    };
