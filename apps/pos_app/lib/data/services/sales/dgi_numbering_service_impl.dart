import '../../../domain/services/sales/dgi_numbering_service.dart';
import '../../daos/local_config_dao.dart';
import '../../daos/sales/invoice_dao.dart';
import '../../models/local_config_entity.dart';

class DgiNumberingServiceImpl implements DgiNumberingService {
  final LocalConfigDao _configDao;
  final InvoiceDao? _invoiceDao;

  static const String _keyPrefix = 'dgi_prefix';
  static const String _keyStart = 'dgi_range_start';
  static const String _keyEnd = 'dgi_range_end';
  static const String _keyCurrent = 'dgi_current_number';

  DgiNumberingServiceImpl(this._configDao, [this._invoiceDao]);

  int _extractSequenceNumber(String invoiceNumber) {
    final match = RegExp(r'(\d+)$').firstMatch(invoiceNumber.trim());
    if (match != null) {
      return int.tryParse(match.group(1) ?? '') ?? 0;
    }
    return 0;
  }

  Future<int> _resolveNextSequence(int configuredCurrent) async {
    if (_invoiceDao != null) {
      final lastInvoiceNumber = await _invoiceDao.getLastInvoiceNumber();
      if (lastInvoiceNumber != null && lastInvoiceNumber.isNotEmpty) {
        final lastSequence = _extractSequenceNumber(lastInvoiceNumber);
        if (lastSequence >= configuredCurrent) {
          return lastSequence + 1;
        }
      }
    }
    return configuredCurrent;
  }

  @override
  Future<void> initializeRange({
    required String prefix,
    required int start,
    required int end,
  }) async {
    await _configDao.saveConfig(LocalConfigEntity(key: _keyPrefix, value: prefix));
    await _configDao.saveConfig(LocalConfigEntity(key: _keyStart, value: start.toString()));
    await _configDao.saveConfig(LocalConfigEntity(key: _keyEnd, value: end.toString()));
    
    final current = await _configDao.getConfigByKey(_keyCurrent);
    if (current == null) {
      await _configDao.saveConfig(LocalConfigEntity(key: _keyCurrent, value: start.toString()));
    }
  }

  @override
  Future<String> getNextNumber() async {
    var prefix = await _configDao.getConfigByKey(_keyPrefix);
    var current = await _configDao.getConfigByKey(_keyCurrent);

    if (prefix == null || current == null) {
      await initializeRange(prefix: '001-001-01-', start: 1, end: 1000000);
      prefix = await _configDao.getConfigByKey(_keyPrefix);
      current = await _configDao.getConfigByKey(_keyCurrent);
    }

    final parsedCurrent = int.tryParse(current?.value ?? '1') ?? 1;
    final validSequence = await _resolveNextSequence(parsedCurrent);

    final numStr = validSequence.toString().padLeft(8, '0');
    return '${prefix?.value ?? '001-001-01-'}$numStr';
  }

  @override
  Future<void> incrementNumber() async {
    final current = await _configDao.getConfigByKey(_keyCurrent);
    final parsedCurrent = int.tryParse(current?.value ?? '1') ?? 1;
    final validSequence = await _resolveNextSequence(parsedCurrent);

    final next = validSequence + 1;
    await _configDao.saveConfig(LocalConfigEntity(key: _keyCurrent, value: next.toString()));
  }

  @override
  Future<bool> isRangeExhausted() async {
    final current = await _configDao.getConfigByKey(_keyCurrent);
    final end = await _configDao.getConfigByKey(_keyEnd);

    if (current == null || end == null) {
      await initializeRange(prefix: '001-001-01-', start: 1, end: 1000000);
      return false;
    }

    final parsedCurrent = int.tryParse(current.value) ?? 1;
    final validSequence = await _resolveNextSequence(parsedCurrent);
    final parsedEnd = int.tryParse(end.value) ?? 1000000;

    return validSequence >= parsedEnd;
  }
}
