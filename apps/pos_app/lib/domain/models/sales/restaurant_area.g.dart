// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'restaurant_area.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$RestaurantAreaImpl _$$RestaurantAreaImplFromJson(Map<String, dynamic> json) =>
    _$RestaurantAreaImpl(
      id: json['id'] as String,
      name: json['name'] as String,
      displayOrder: json['displayOrder'] as int? ?? 0,
      isActive: json['isActive'] as bool? ?? true,
    );

Map<String, dynamic> _$$RestaurantAreaImplToJson(
        _$RestaurantAreaImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'name': instance.name,
      'displayOrder': instance.displayOrder,
      'isActive': instance.isActive,
    };
