// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'tenant_config.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$TenantConfigImpl _$$TenantConfigImplFromJson(Map<String, dynamic> json) =>
    _$TenantConfigImpl(
      operationMode: $enumDecodeNullable(
              _$TenantOperationModeEnumMap, json['operationMode']) ??
          TenantOperationMode.foodparkQsr,
      tenantId: json['tenantId'] as String? ?? '',
      tenantName: json['tenantName'] as String? ?? '',
      buzzerPagerRequired: json['buzzerPagerRequired'] as bool? ?? false,
      tableServiceEnabled: json['tableServiceEnabled'] as bool? ?? false,
      autoPrintKitchenTicket: json['autoPrintKitchenTicket'] as bool? ?? false,
      customSettings: json['customSettings'] as Map<String, dynamic>? ??
          const <String, dynamic>{},
    );

Map<String, dynamic> _$$TenantConfigImplToJson(_$TenantConfigImpl instance) =>
    <String, dynamic>{
      'operationMode': _$TenantOperationModeEnumMap[instance.operationMode]!,
      'tenantId': instance.tenantId,
      'tenantName': instance.tenantName,
      'buzzerPagerRequired': instance.buzzerPagerRequired,
      'tableServiceEnabled': instance.tableServiceEnabled,
      'autoPrintKitchenTicket': instance.autoPrintKitchenTicket,
      'customSettings': instance.customSettings,
    };

const _$TenantOperationModeEnumMap = {
  TenantOperationMode.foodparkQsr: 'FOODPARK_QSR',
  TenantOperationMode.restaurant: 'RESTAURANT',
  TenantOperationMode.hybrid: 'HYBRID',
};
