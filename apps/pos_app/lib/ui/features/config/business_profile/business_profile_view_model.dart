import 'package:flutter/foundation.dart';
import '../../../../../data/daos/local_config_dao.dart';
import '../../../../../data/models/local_config_entity.dart';

import '../../../../domain/models/config/tenant_operation_mode.dart';

import '../../../../domain/repositories/inventory/inventory_repository.dart';

class BusinessProfileViewModel extends ChangeNotifier {
  final LocalConfigDao _configDao;
  final InventoryRepository? _inventoryRepository;

  BusinessProfileViewModel(this._configDao, [this._inventoryRepository]);

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
    'dgi_prefix': '001-001-01-',
    'dgi_range_start': '1',
    'dgi_range_end': '10000',
    'dgi_current_number': '1',
    'dgi_authorization_code': '',
  };
  Map<String, String> get config => _config;

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
      final keys = _config.keys.toList();
      for (final key in keys) {
        final entity = await _configDao.getConfigByKey(key);
        if (entity != null) {
          _config[key] = entity.value;
        }
      }
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> saveConfig(Map<String, String> newConfig) async {
    _isLoading = true;
    notifyListeners();
    try {
      for (final entry in newConfig.entries) {
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
}
