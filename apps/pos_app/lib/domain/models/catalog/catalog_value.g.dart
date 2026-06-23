// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'catalog_value.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$CatalogValueImpl _$$CatalogValueImplFromJson(Map<String, dynamic> json) =>
    _$CatalogValueImpl(
      id: json['id'] as String,
      catalogType: CatalogType.fromJson(json['catalogType'] as String),
      code: json['code'] as String,
      name: json['name'] as String,
      isActive: json['isActive'] as bool? ?? true,
      sortOrder: json['sortOrder'] as int? ?? 0,
    );

Map<String, dynamic> _$$CatalogValueImplToJson(_$CatalogValueImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'catalogType': CatalogType.toJson(instance.catalogType),
      'code': instance.code,
      'name': instance.name,
      'isActive': instance.isActive,
      'sortOrder': instance.sortOrder,
    };
