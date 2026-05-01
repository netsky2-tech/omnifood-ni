// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'insumo.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$InsumoImpl _$$InsumoImplFromJson(Map<String, dynamic> json) => _$InsumoImpl(
      id: json['id'] as String,
      name: json['name'] as String,
      consumptionUom: json['consumptionUom'] as String,
      stock: (json['stock'] as num).toDouble(),
      averageCost: (json['averageCost'] as num).toDouble(),
      parLevel: (json['parLevel'] as num?)?.toDouble(),
      warehouseId: json['warehouse_id'] as String?,
      isPerishable: json['is_perishable'] as bool? ?? false,
    );

Map<String, dynamic> _$$InsumoImplToJson(_$InsumoImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'name': instance.name,
      'consumptionUom': instance.consumptionUom,
      'stock': instance.stock,
      'averageCost': instance.averageCost,
      'parLevel': instance.parLevel,
      'warehouse_id': instance.warehouseId,
      'is_perishable': instance.isPerishable,
    };
