import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import '../../../../../data/daos/fiscal_config_local_dao.dart';
import '../../../../../data/daos/local_config_dao.dart';
import '../../../../../data/models/fiscal_config_local_entity.dart';
import '../../../../../data/models/local_config_entity.dart';
import '../../../../../data/services/sync_service.dart';

import '../../../../domain/models/config/tax_regime.dart';
import '../../../../domain/models/config/tenant_operation_mode.dart';

import '../../../../domain/repositories/inventory/inventory_repository.dart';

class BusinessProfileViewModel extends ChangeNotifier {
  final LocalConfigDao _configDao;
  final FiscalConfigLocalDao? _fiscalConfigLocalDao;
  final InventoryRepository? _inventoryRepository;
  SyncService? _syncService;
  StreamSubscription<InboundSyncResult>? _syncSubscription;

  BusinessProfileViewModel(
    this._configDao, [
    this._inventoryRepository,
    SyncService? syncService,
    this._fiscalConfigLocalDao,
  ]) {
    _syncService = syncService;
    if (syncService != null) {
      _syncSubscription = syncService.onInboundSync.listen((event) {
        loadConfig();
      });
    }
  }

  Map<String, String> _config = {
    'business_name': '',
    'ruc': '',
    'address': '',
    'phone': '',
    'legal_footer': '',
    'commercial_exchange_rate': '36.50',
    'bcn_official_exchange_rate': '36.6241',
    'checkout_fx_mode': 'COMMERCIAL',
    'operation_mode': 'FOODPARK_QSR',
    // D-16 (JD-A-001): NONE of the sequence keys is prefilled — the prefix
    // and cursor are real fiscal configuration from SOHO's authorization
    // letter. Blank here + the saveConfig skip below means an untouched
    // profile leaves the sequence UNCONFIGURED (the numbering service fails
    // closed) and the activation runner provisions it at the approved gate.
    'dgi_prefix': '',
    'dgi_range_start': '',
    'dgi_range_end': '',
    'dgi_current_number': '',
    'dgi_authorization_code': '',
    'dgi_authorization_date': '',
    'dgi_authorization_document': '',
    'tax_regime': 'REGIMEN_GENERAL',
  };
  Map<String, String> get config => _config;

  TaxRegime? get taxRegime => TaxRegime.fromString(_config['tax_regime']);

  void setTaxRegime(TaxRegime regime) {
    _config['tax_regime'] = regime.code;
    notifyListeners();
  }

  TenantOperationMode get operationMode =>
      TenantOperationMode.fromString(_config['operation_mode']);

  void setOperationMode(TenantOperationMode mode) {
    _config['operation_mode'] = mode.code;
    notifyListeners();
  }

  String get checkoutFxMode => _config['checkout_fx_mode'] ?? 'COMMERCIAL';

  void setCheckoutFxMode(String mode) {
    _config['checkout_fx_mode'] = mode;
    notifyListeners();
  }

  double get commercialRate =>
      double.tryParse(_config['commercial_exchange_rate'] ?? '36.50') ?? 36.50;

  double get bcnOfficialRate =>
      double.tryParse(_config['bcn_official_exchange_rate'] ?? '36.6241') ?? 36.6241;

  double get activeCheckoutRate =>
      checkoutFxMode == 'BCN_OFFICIAL' ? bcnOfficialRate : commercialRate;

  bool _isLoading = false;
  bool get isLoading => _isLoading;

  bool _isFetchingBcnRate = false;
  bool get isFetchingBcnRate => _isFetchingBcnRate;

  Future<double> fetchOfficialBcnRate([Future<double> Function()? bcnFetcher]) async {
    _isFetchingBcnRate = true;
    notifyListeners();
    try {
      final double rate;
      if (bcnFetcher != null) {
        rate = await bcnFetcher();
      } else if (_inventoryRepository != null) {
        rate = await _inventoryRepository!.fetchOfficialBcnRateByInvoiceDate(DateTime.now());
      } else {
        throw Exception('Servicio de inventario no disponible para consultar BCN');
      }
      _config['bcn_official_exchange_rate'] = rate.toStringAsFixed(4);
      await _configDao.saveConfig(LocalConfigEntity(
        key: 'bcn_official_exchange_rate',
        value: rate.toStringAsFixed(4),
      ));
      return rate;
    } finally {
      _isFetchingBcnRate = false;
      notifyListeners();
    }
  }

  Future<void> loadConfig() async {
    _isLoading = true;
    notifyListeners();
    try {
      LocalConfigEntity? primaryBusinessNameEntity;
      final keys = _config.keys.toList();
      for (final key in keys) {
        final entity = await _configDao.getConfigByKey(key);
        if (entity != null) {
          _config[key] = entity.value;
          if (key == 'business_name') {
            primaryBusinessNameEntity = entity;
          }
        }
      }

      final primaryConfigFound = primaryBusinessNameEntity != null;
      final rawPrimaryBusinessName = primaryBusinessNameEntity?.value;
      final primaryBusinessNamePresent =
          rawPrimaryBusinessName != null && rawPrimaryBusinessName.trim().isNotEmpty;

      debugPrint('PRIMARY_CONFIG_FOUND: $primaryConfigFound');
      debugPrint('PRIMARY_BUSINESS_NAME_PRESENT: $primaryBusinessNamePresent');

      final fiscalFallbackTriggered = !primaryBusinessNamePresent;
      debugPrint('FISCAL_FALLBACK_TRIGGERED: $fiscalFallbackTriggered');

      // Fallback: if business_name is absent or blank, try reading from fiscal_config_local
      if (fiscalFallbackTriggered) {
        _config['business_name'] = '';
        await _loadFromFiscalConfigLocal();
      }

      final vmBusinessName = _config['business_name'];
      final vmBusinessNamePresent =
          vmBusinessName != null && vmBusinessName.trim().isNotEmpty;
      debugPrint('VIEW_MODEL_BUSINESS_NAME_PRESENT: $vmBusinessNamePresent');
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> _loadFromFiscalConfigLocal() async {
    if (_fiscalConfigLocalDao == null) {
      debugPrint('FISCAL_BUSINESS_NAME_PRESENT: false');
      return;
    }
    try {
      // Get the tenant_id from local_configs first
      final tenantEntity = await _configDao.getConfigByKey('tenant_id');
      final tenantId = tenantEntity?.value;
      if (tenantId == null || tenantId.trim().isEmpty) {
        debugPrint('FISCAL_BUSINESS_NAME_PRESENT: false');
        return;
      }

      final fiscalEntity = await _fiscalConfigLocalDao!.getByTenantId(tenantId);
      if (fiscalEntity == null) {
        debugPrint('FISCAL_BUSINESS_NAME_PRESENT: false');
        return;
      }

      final payload = jsonDecode(fiscalEntity.payload);
      final businessName = payload['businessName']?.toString();
      final fiscalBusinessNamePresent =
          businessName != null && businessName.trim().isNotEmpty;
      debugPrint('FISCAL_BUSINESS_NAME_PRESENT: $fiscalBusinessNamePresent');

      if (fiscalBusinessNamePresent) {
        _config['business_name'] = businessName;
      }
      final ruc = payload['ruc']?.toString();
      if (ruc != null && ruc.trim().isNotEmpty) {
        _config['ruc'] = ruc;
      }
      final fiscalRegime = payload['fiscalRegime']?.toString();
      if (fiscalRegime != null && fiscalRegime.trim().isNotEmpty) {
        _config['tax_regime'] = fiscalRegime;
      }
    } catch (_) {
      debugPrint('FISCAL_BUSINESS_NAME_PRESENT: false');
      debugPrint('FISCAL_FALLBACK_ERROR: true');
    }
  }

  /// D-1 extension to the form: saving OTHER profile fields must never
  /// resurrect or rewrite the persisted fiscal sequence. A blank range
  /// value in the form means "not configured" — it is never written over an
  /// existing sequence row.
  static const Set<String> _sequenceKeys = {
    'dgi_prefix',
    'dgi_range_start',
    'dgi_range_end',
    'dgi_current_number',
  };

  Future<void> saveConfig(Map<String, String> newConfig) async {
    _isLoading = true;
    notifyListeners();
    try {
      for (final entry in newConfig.entries) {
        if (_sequenceKeys.contains(entry.key) &&
            entry.value.trim().isEmpty) {
          // Blank sequence value = leave the persisted row untouched.
          continue;
        }
        await _configDao.saveConfig(LocalConfigEntity(
          key: entry.key,
          value: entry.value,
        ));
      }
      _config = Map.from(newConfig);
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  @override
  void dispose() {
    _syncSubscription?.cancel();
    super.dispose();
  }
}
