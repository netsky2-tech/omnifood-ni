import 'dart:async';
import '../../../data/daos/local_config_dao.dart';
import '../../../data/models/local_config_entity.dart';
import '../../models/config/tenant_config.dart';
import '../../models/config/tenant_operation_mode.dart';

/// Service responsible for managing tenant operational mode and adaptive POS configuration.
/// Offline-first persisted in local SQLite [local_configs] table.
class TenantConfigService {
  TenantConfigService(this._configDao);

  static const String operationModeKey = 'operation_mode';
  static const String tenantIdKey = 'tenant_id';
  static const String tenantNameKey = 'tenant_name';
  static const String tenantSlugKey = 'tenant_slug';
  static const String buzzerPagerRequiredKey = 'buzzer_pager_required';
  static const String tableServiceEnabledKey = 'table_service_enabled';
  static const String autoPrintKitchenTicketKey = 'auto_print_kitchen_ticket';

  final LocalConfigDao _configDao;
  final StreamController<TenantOperationMode> _modeStreamController =
      StreamController<TenantOperationMode>.broadcast();

  /// Stream of operation mode changes for reactive UI updates across the POS.
  Stream<TenantOperationMode> get onOperationModeChanged =>
      _modeStreamController.stream;

  /// Resolves the current operational mode from local SQLite config.
  /// Defaults cleanly to [TenantOperationMode.foodparkQsr] if unconfigured or corrupt.
  Future<TenantOperationMode> getOperationMode({
    TenantOperationMode defaultMode = TenantOperationMode.foodparkQsr,
  }) async {
    final entity = await _configDao.getConfigByKey(operationModeKey);
    return TenantOperationMode.fromString(entity?.value, defaultMode: defaultMode);
  }

  /// Persists the selected operational mode and notifies stream subscribers.
  Future<void> setOperationMode(TenantOperationMode mode) async {
    await _configDao.saveConfig(
      LocalConfigEntity(
        key: operationModeKey,
        value: mode.code,
        description: 'Tenant operation mode (${mode.displayName})',
      ),
    );
    _modeStreamController.add(mode);
  }

  /// Hydrates the full [TenantConfig] aggregate from local SQLite.
  Future<TenantConfig> getTenantConfig() async {
    final mode = await getOperationMode();
    final tenantIdEntity = await _configDao.getConfigByKey(tenantIdKey);
    final tenantNameEntity = await _configDao.getConfigByKey(tenantNameKey);
    final tenantSlugEntity = await _configDao.getConfigByKey(tenantSlugKey);
    final buzzerEntity = await _configDao.getConfigByKey(buzzerPagerRequiredKey);
    final tableEntity = await _configDao.getConfigByKey(tableServiceEnabledKey);
    final printEntity = await _configDao.getConfigByKey(autoPrintKitchenTicketKey);

    final buzzerRequired = buzzerEntity?.value.trim().toLowerCase() == 'true';
    final tableServiceExplicit = tableEntity?.value.trim().toLowerCase() == 'true';

    return TenantConfig(
      operationMode: mode,
      tenantId: tenantIdEntity?.value ?? '',
      tenantName: tenantNameEntity?.value ?? '',
      tenantSlug: tenantSlugEntity?.value ?? '',
      buzzerPagerRequired: buzzerRequired,
      tableServiceEnabled: tableEntity != null
          ? tableServiceExplicit
          : mode.supportsTables,
      autoPrintKitchenTicket: printEntity?.value.trim().toLowerCase() == 'true',
    );
  }

  /// Saves the complete [TenantConfig] aggregate into local SQLite.
  Future<void> saveTenantConfig(TenantConfig config) async {
    await setOperationMode(config.operationMode);
    await _configDao.saveConfig(
      LocalConfigEntity(
        key: tenantIdKey,
        value: config.tenantId,
        description: 'Tenant unique identifier',
      ),
    );
    await _configDao.saveConfig(
      LocalConfigEntity(
        key: tenantNameKey,
        value: config.tenantName,
        description: 'Tenant display name',
      ),
    );
    if (config.tenantSlug.isNotEmpty) {
      await _configDao.saveConfig(
        LocalConfigEntity(
          key: tenantSlugKey,
          value: config.tenantSlug,
          description: 'Tenant slug from device provisioning (pre-auth routing hint)',
        ),
      );
    }
    await _configDao.saveConfig(
      LocalConfigEntity(
        key: buzzerPagerRequiredKey,
        value: config.buzzerPagerRequired.toString(),
        description: 'Whether buzzer/pager is required on sale checkout',
      ),
    );
    await _configDao.saveConfig(
      LocalConfigEntity(
        key: tableServiceEnabledKey,
        value: config.tableServiceEnabled.toString(),
        description: 'Whether dine-in table layout is enabled',
      ),
    );
    await _configDao.saveConfig(
      LocalConfigEntity(
        key: autoPrintKitchenTicketKey,
        value: config.autoPrintKitchenTicket.toString(),
        description: 'Whether kitchen tickets are auto-printed on order park/sale',
      ),
    );
  }

  /// Reads the stored tenant slug (empty for legacy installs without one).
  Future<String> getTenantSlug() async {
    final entity = await _configDao.getConfigByKey(tenantSlugKey);
    return entity?.value ?? '';
  }

  /// Write-through persistence for the tenant slug captured from the device
  /// provisioning/confirm response (issue #556). Blank slugs are ignored so
  /// legacy installs keep an absent key and the legacy wire contract.
  Future<void> persistTenantSlug(String slug) async {
    final trimmed = slug.trim();
    if (trimmed.isEmpty) return;
    await _configDao.saveConfig(
      LocalConfigEntity(
        key: tenantSlugKey,
        value: trimmed,
        description: 'Tenant slug from device provisioning (pre-auth routing hint)',
      ),
    );
  }

  /// Write-through persistence for the tenant id captured from the pre-auth
  /// linking claim (issue #556). Blank ids are ignored; this is pre-auth
  /// context, never authority.
  Future<void> persistTenantId(String tenantId) async {
    final trimmed = tenantId.trim();
    if (trimmed.isEmpty) return;
    await _configDao.saveConfig(
      LocalConfigEntity(
        key: tenantIdKey,
        value: trimmed,
        description: 'Tenant unique identifier',
      ),
    );
  }

  Future<bool> isFoodParkQsr() async => (await getOperationMode()).isFoodParkQsr;
  Future<bool> isRestaurant() async => (await getOperationMode()).isRestaurant;
  Future<bool> isHybrid() async => (await getOperationMode()).isHybrid;
  Future<bool> supportsTables() async => (await getOperationMode()).supportsTables;
  Future<bool> supportsBuzzerPager() async => (await getOperationMode()).supportsBuzzerPager;

  void dispose() {
    _modeStreamController.close();
  }
}
