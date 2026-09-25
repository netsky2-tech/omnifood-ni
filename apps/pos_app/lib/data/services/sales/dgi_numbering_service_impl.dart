import '../../../domain/services/sales/dgi_numbering_service.dart';
import '../../daos/local_config_dao.dart';
import '../../daos/sales/invoice_dao.dart';
import '../../models/local_config_entity.dart';

/// D-16/D-18: fail-closed DGI numbering. The three self-heals that used to
/// materialize invented ranges (boot 1-1000, missing-config 1-1000000,
/// parse-fallback 1) are gone: an unconfigured sequence is a named
/// configuration state, not something to paper over.
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

  /// D-18: the persisted last folio is authoritative — a number is never
  /// reused even when the config cursor lags behind (crash between print
  /// and cursor save). An undetermined last folio (no persisted invoice)
  /// falls back to the configured cursor.
  Future<int> _resolveNextSequence(int configuredCurrent) async {
    if (_invoiceDao != null) {
      final lastInvoice = await _invoiceDao.getLastInvoice();
      if (lastInvoice != null && lastInvoice.number.isNotEmpty) {
        final lastSequence = _extractSequenceNumber(lastInvoice.number);
        if (lastSequence >= configuredCurrent) {
          return lastSequence + 1;
        }
      }
    }
    return configuredCurrent;
  }

  Future<int> _readConfiguredCurrent() async {
    final current = await _configDao.getConfigByKey(_keyCurrent);
    final parsed = int.tryParse(current?.value ?? '');
    if (parsed == null || parsed < 1) {
      throw const FiscalSequenceUnconfiguredError(
        'La serie fiscal no está configurada para este negocio. Configure el rango DGI antes de facturar.',
      );
    }
    return parsed;
  }

  Future<int?> _readConfiguredEnd() async {
    final end = await _configDao.getConfigByKey(_keyEnd);
    // D-16: a null/blank end is the legitimate unbounded state, not a
    // default to fabricate.
    if (end == null || end.value.trim().isEmpty) return null;
    final parsed = int.tryParse(end.value);
    if (parsed == null) {
      throw const FiscalSequenceUnconfiguredError(
        'El rango DGI configurado es inválido. Corrija la configuración antes de facturar.',
      );
    }
    return parsed;
  }

  @override
  Future<void> initializeRange({
    required String prefix,
    required int start,
    required int? end,
  }) async {
    await _configDao.saveConfig(
      LocalConfigEntity(key: _keyPrefix, value: prefix),
    );
    await _configDao.saveConfig(
      LocalConfigEntity(key: _keyStart, value: start.toString()),
    );
    // D-16: an absent end is stored as absent (no row), never as a number.
    if (end != null) {
      await _configDao.saveConfig(
        LocalConfigEntity(key: _keyEnd, value: end.toString()),
      );
    }

    final current = await _configDao.getConfigByKey(_keyCurrent);
    // D-1: never overwrite a persisted fiscal sequence.
    if (current == null) {
      await _configDao.saveConfig(
        LocalConfigEntity(key: _keyCurrent, value: start.toString()),
      );
    }
  }

  @override
  Future<String> getNextNumber() async {
    final prefixEntity = await _configDao.getConfigByKey(_keyPrefix);
    final prefix = prefixEntity?.value.trim() ?? '';
    if (prefix.isEmpty) {
      throw const FiscalSequenceUnconfiguredError(
        'La serie fiscal no está configurada para este negocio. Configure el rango DGI antes de facturar.',
      );
    }
    final configuredCurrent = await _readConfiguredCurrent();
    final validSequence = await _resolveNextSequence(configuredCurrent);

    final end = await _readConfiguredEnd();
    if (end != null && validSequence > end) {
      throw const FiscalSequenceExhaustedError(
        'El rango autorizado DGI se agotó. No se reutilizan ni extienden correlativos; solicite un rango nuevo.',
      );
    }

    final numStr = validSequence.toString().padLeft(8, '0');
    return '$prefix$numStr';
  }

  @override
  Future<void> incrementNumber() async {
    final configuredCurrent = await _readConfiguredCurrent();
    final validSequence = await _resolveNextSequence(configuredCurrent);

    // `_resolveNextSequence` already advances past a persisted invoice.
    // Do not advance twice when the configured cursor still points at that
    // invoice; only increment the cursor when no persisted invoice forced
    // the next sequence forward.
    final next = validSequence == configuredCurrent
        ? validSequence + 1
        : validSequence;
    await _configDao.saveConfig(
      LocalConfigEntity(key: _keyCurrent, value: next.toString()),
    );
  }

  @override
  Future<bool> isRangeExhausted() async {
    final configuredCurrent = await _readConfiguredCurrent();
    final end = await _readConfiguredEnd();
    // D-16: a series without a documented end is never exhausted.
    if (end == null) return false;

    final validSequence = await _resolveNextSequence(configuredCurrent);
    return validSequence > end;
  }
}
