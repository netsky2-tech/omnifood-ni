// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'user.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$UserImpl _$$UserImplFromJson(Map<String, dynamic> json) => _$UserImpl(
      id: json['id'] as String,
      name: json['name'] as String,
      role: $enumDecode(_$UserRoleEnumMap, json['role']),
      pinHash: json['pin_hash'] as String?,
      isActive: json['isActive'] as bool? ?? true,
      email: json['email'] as String?,
      tenantId: json['tenant_id'] as String?,
    );

Map<String, dynamic> _$$UserImplToJson(_$UserImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'name': instance.name,
      'role': _$UserRoleEnumMap[instance.role]!,
      'pin_hash': instance.pinHash,
      'isActive': instance.isActive,
      'email': instance.email,
      'tenant_id': instance.tenantId,
    };

const _$UserRoleEnumMap = {
  UserRole.owner: 'OWNER',
  UserRole.manager: 'MANAGER',
  UserRole.cashier: 'CASHIER',
  UserRole.waiter: 'WAITER',
};
