import 'package:freezed_annotation/freezed_annotation.dart';
import 'tenant_operation_mode.dart';

part 'tenant_config.freezed.dart';
part 'tenant_config.g.dart';

@freezed
class TenantConfig with _$TenantConfig {
  const TenantConfig._();

  const factory TenantConfig({
    @Default(TenantOperationMode.foodparkQsr) TenantOperationMode operationMode,
    @Default('') String tenantId,
    @Default('') String tenantName,
    @Default(false) bool buzzerPagerRequired,
    @Default(false) bool tableServiceEnabled,
    @Default(false) bool autoPrintKitchenTicket,
    @Default(<String, dynamic>{}) Map<String, dynamic> customSettings,
  }) = _TenantConfig;

  factory TenantConfig.fromJson(Map<String, dynamic> json) =>
      _$TenantConfigFromJson(json);

  bool get isFoodParkQsr => operationMode.isFoodParkQsr;
  bool get isRestaurant => operationMode.isRestaurant;
  bool get isHybrid => operationMode.isHybrid;
  bool get supportsTables => operationMode.supportsTables || tableServiceEnabled;
  bool get supportsBuzzerPager => operationMode.supportsBuzzerPager || buzzerPagerRequired;
}
