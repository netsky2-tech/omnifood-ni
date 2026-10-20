import 'dart:async';
import 'dart:convert';
import '../../../data/daos/local_config_dao.dart';
import '../../../data/models/local_config_entity.dart';
import '../../models/config/supervision_policy.dart';
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

  /// SOHO-P3 S1b: owner-configured manual discount caps, projected from the
  /// fiscal snapshot by [FiscalProjectionKeys.maxDiscountAmount] /
  /// [maxDiscountPercent] (same wire contract as the backend: null = NO CAP,
  /// amount may be 0 = forbid all manual discounts, percent in (0, 100]).
  static const String maxDiscountAmountKey = 'max_discount_amount';
  static const String maxDiscountPercentKey = 'max_discount_percent';

  /// The tenant's SUPERVISION policy: who may authorize a sensitive
  /// operation here, and which flows accept a self-authorization.
  ///
  /// It is the tenant's decision, not ours (owner's decision, 2026-10-20): a
  /// food park often has no manager on the floor, and a rule that says "only
  /// an owner or a manager can authorize" does not create a control there, it
  /// creates a DEAD END.
  static const String supervisionPolicyKey = 'supervision_policy';

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

  /// The tenant's supervision policy.
  ///
  /// Absent (or unreadable) = the default for the tenant's operation mode:
  /// the mode already says how much bureaucracy the business has.
  Future<SupervisionPolicy> getSupervisionPolicy() async {
    final entity = await _configDao.getConfigByKey(supervisionPolicyKey);
    final raw = entity?.value.trim();
    if (raw != null && raw.isNotEmpty) {
      try {
        return SupervisionPolicy.fromJson(
          jsonDecode(raw) as Map<String, dynamic>,
        );
      } catch (_) {
        // A corrupt policy must not trap the till: fall back to the default
        // for the mode, which never dead-ends the close box.
      }
    }
    return SupervisionPolicy.forOperationMode(await getOperationMode());
  }

  /// Persists the tenant's supervision policy.
  Future<void> setSupervisionPolicy(SupervisionPolicy policy) async {
    await _configDao.saveConfig(
      LocalConfigEntity(
        key: supervisionPolicyKey,
        value: jsonEncode({
          'authorizingRoles': policy.authorizingRoles.toList(),
          'selfAuthorizationAllowedCloseBox':
              policy.selfAuthorizationAllowedCloseBox,
          'selfAuthorizationAllowedCashDrawer':
              policy.selfAuthorizationAllowedCashDrawer,
          'selfAuthorizationAllowedManualDiscount':
              policy.selfAuthorizationAllowedManualDiscount,
          'supervisorRequiredForModifierQuantity':
              policy.supervisorRequiredForModifierQuantity,
        }),
        description: 'Supervision policy (who authorizes, and what accepts a self-authorization)',
      ),
    );
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

  /// Reads the configured manual discount AMOUNT cap, or null when no cap is
  /// configured. The projection only stores validated finite values, so a
  /// null/unparseable/negative read degrades to "no cap" as defense-in-depth
  /// instead of crashing the sale flow.
  Future<double?> getMaxDiscountAmount() async {
    return _parseDiscountCap(await _configDao.getConfigByKey(maxDiscountAmountKey));
  }

  /// Reads the configured manual discount PERCENT cap (0-100), or null when
  /// no cap is configured. Same defense-in-depth contract as
  /// [getMaxDiscountAmount].
  Future<double?> getMaxDiscountPercent() async {
    return _parseDiscountCap(await _configDao.getConfigByKey(maxDiscountPercentKey));
  }

  double? _parseDiscountCap(LocalConfigEntity? entity) {
    if (entity == null) return null;
    final raw = entity.value.trim();
    if (raw.isEmpty) return null;
    final parsed = double.tryParse(raw);
    if (parsed == null || !parsed.isFinite || parsed < 0) return null;
    return parsed;
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
