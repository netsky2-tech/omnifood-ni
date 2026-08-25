import 'package:flutter/foundation.dart';
import '../../../../../data/daos/local_config_dao.dart';
import '../../../../../data/models/local_config_entity.dart';

class BusinessProfileViewModel extends ChangeNotifier {
  final LocalConfigDao _configDao;

  BusinessProfileViewModel(this._configDao);

  Map<String, String> _config = {
    'business_name': '',
    'ruc': '',
    'address': '',
    'phone': '',
    'legal_footer': '',
    'commercial_exchange_rate': '36.50',
    'bcn_official_exchange_rate': '36.6241',
  };
  Map<String, String> get config => _config;

  double get commercialRate =>
      double.tryParse(_config['commercial_exchange_rate'] ?? '36.50') ?? 36.50;

  double get bcnOfficialRate =>
      double.tryParse(_config['bcn_official_exchange_rate'] ?? '36.6241') ?? 36.6241;

  bool _isLoading = false;
  bool get isLoading => _isLoading;

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
