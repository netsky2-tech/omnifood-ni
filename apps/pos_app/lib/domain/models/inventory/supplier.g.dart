// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'supplier.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$SupplierImpl _$$SupplierImplFromJson(Map<String, dynamic> json) =>
    _$SupplierImpl(
      id: json['id'] as String,
      name: json['name'] as String,
      phone: json['phone'] as String?,
      contactPerson: json['contact_person'] as String?,
      creditTerms: json['credit_terms'] as String?,
      isActive: json['isActive'] as bool? ?? true,
    );

Map<String, dynamic> _$$SupplierImplToJson(_$SupplierImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'name': instance.name,
      'phone': instance.phone,
      'contact_person': instance.contactPerson,
      'credit_terms': instance.creditTerms,
      'isActive': instance.isActive,
    };
