// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'tax_configuration.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$TaxConfigurationImpl _$$TaxConfigurationImplFromJson(
        Map<String, dynamic> json) =>
    _$TaxConfigurationImpl(
      id: json['id'] as String,
      name: json['name'] as String,
      rate: (json['rate'] as num).toDouble(),
      isActive: json['isActive'] as bool? ?? true,
      isDefault: json['isDefault'] as bool? ?? false,
    );

Map<String, dynamic> _$$TaxConfigurationImplToJson(
        _$TaxConfigurationImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'name': instance.name,
      'rate': instance.rate,
      'isActive': instance.isActive,
      'isDefault': instance.isDefault,
    };
