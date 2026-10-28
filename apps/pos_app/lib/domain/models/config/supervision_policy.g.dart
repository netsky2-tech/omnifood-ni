// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'supervision_policy.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$SupervisionPolicyImpl _$$SupervisionPolicyImplFromJson(
        Map<String, dynamic> json) =>
    _$SupervisionPolicyImpl(
      authorizingRoles: (json['authorizingRoles'] as List<dynamic>?)
              ?.map((e) => e as String)
              .toSet() ??
          const <String>{'OWNER', 'MANAGER'},
      selfAuthorizationAllowedCloseBox:
          json['selfAuthorizationAllowedCloseBox'] as bool? ?? true,
      selfAuthorizationAllowedCashDrawer:
          json['selfAuthorizationAllowedCashDrawer'] as bool? ?? false,
      selfAuthorizationAllowedManualDiscount:
          json['selfAuthorizationAllowedManualDiscount'] as bool? ?? false,
      supervisorRequiredForModifierQuantity:
          json['supervisorRequiredForModifierQuantity'] as bool? ?? false,
    );

Map<String, dynamic> _$$SupervisionPolicyImplToJson(
        _$SupervisionPolicyImpl instance) =>
    <String, dynamic>{
      'authorizingRoles': instance.authorizingRoles.toList(),
      'selfAuthorizationAllowedCloseBox':
          instance.selfAuthorizationAllowedCloseBox,
      'selfAuthorizationAllowedCashDrawer':
          instance.selfAuthorizationAllowedCashDrawer,
      'selfAuthorizationAllowedManualDiscount':
          instance.selfAuthorizationAllowedManualDiscount,
      'supervisorRequiredForModifierQuantity':
          instance.supervisorRequiredForModifierQuantity,
    };
