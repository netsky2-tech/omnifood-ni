import '../../../domain/services/sales/dgi_numbering_service.dart';
import '../../daos/local_config_dao.dart';
import '../../models/local_config_entity.dart';

class DgiNumberingServiceImpl implements DgiNumberingService {
  final LocalConfigDao _configDao;

  static const String _keyPrefix = 'dgi_prefix';
  static const String _keyStart = 'dgi_range_start';
  static const String _keyEnd = 'dgi_range_end';
  static const String _keyCurrent = 'dgi_current_number';

  DgiNumberingServiceImpl(this._configDao);

  @override
  Future<void> initializeRange({
    required String prefix,
    required int start,
    required int end,
  }) async {
    await _configDao.saveConfig(LocalConfigEntity(key: _keyPrefix, value: prefix));
    await _configDao.saveConfig(LocalConfigEntity(key: _keyStart, value: start.toString()));
    await _configDao.saveConfig(LocalConfigEntity(key: _keyEnd, value: end.toString()));
    
    // Only set current if it doesn't exist
    final current = await _configDao.getConfigByKey(_keyCurrent);
    if (current == null) {
      await _configDao.saveConfig(LocalConfigEntity(key: _keyCurrent, value: start.toString()));
    }
  }

  @override
  Future<String> getNextNumber() async {
    final prefix = await _configDao.getConfigByKey(_keyPrefix);
    final current = await _configDao.getConfigByKey(_keyCurrent);

    if (prefix == null || current == null) {
      throw Exception('DGI Numbering range not initialized');
    }

    // Format: prefix + 8 digits (standard DGI)
    final numStr = current.value.padLeft(8, '0');
    return '${prefix.value}$numStr';
  }

  @override
  Future<void> incrementNumber() async {
    final current = await _configDao.getConfigByKey(_keyCurrent);
    if (current == null) throw Exception('DGI Numbering range not initialized');

    final next = int.parse(current.value) + 1;
    await _configDao.saveConfig(LocalConfigEntity(key: _keyCurrent, value: next.toString()));
  }

  @override
  Future<bool> isRangeExhausted() async {
    final current = await _configDao.getConfigByKey(_keyCurrent);
    final end = await _configDao.getConfigByKey(_keyEnd);

    if (current == null || end == null) return true;

    return int.parse(current.value) >= int.parse(end.value);
  }
}
