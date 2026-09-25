import '../../../domain/services/sales/dgi_numbering_service.dart';
import '../../daos/local_config_dao.dart';
import '../../daos/sales/invoice_dao.dart';
import '../../models/local_config_entity.dart';

/// D-21 (and B2a D-16/D-18/D-1 heritage): fail-closed DGI numbering with no
/// range concept. Computerized systems issue consecutive, progressive,
/// gapless numbers — unbounded. The three self-heals that used to
/// materialize invented ranges (boot 1-1000, missing-config 1-1000000,
/// parse-fallback 1) are gone, and the exhaustion gate is gone with the
/// range: an unconfigured or corrupt sequence is the single named failure
/// state, not something to paper over.
class DgiNumberingServiceImpl implements DgiNumberingService {
  final LocalConfigDao _configDao;
  final InvoiceDao? _invoiceDao;

  static const String _keyPrefix = 'dgi_prefix';
  static const String _keyStart = 'dgi_range_start';
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
  /// falls back to the configured cursor. Works for both folio formats
  /// (plain `3` and padded `001-001-01-00000003`): the trailing decimal run
  /// is the consecutivo either way.
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
      // D-18 spirit: a corrupt/unparseable cursor is the same named
      // configuration state as an absent one — never a self-healed default.
      throw const FiscalSequenceUnconfiguredError(
        'La serie fiscal no está configurada para este negocio. Configure la autorización fiscal DGI (consecutivo inicial) antes de facturar.',
      );
    }
    return parsed;
  }

  @override
  Future<void> initializeRange({
    required String prefix,
    required int start,
    int? end,
  }) async {
    // D-21: [end] is retired and ignored — computerized systems have no
    // range; the `dgi_range_end` key is never read or written.
    await _configDao.saveConfig(
      LocalConfigEntity(key: _keyPrefix, value: prefix),
    );
    await _configDao.saveConfig(
      LocalConfigEntity(key: _keyStart, value: start.toString()),
    );

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
    // D-21: the prefix is optional. Blank/absent → the folio is the plain
    // decimal consecutivo with no padding and no prefix (1, 2, 3, ...).
    final prefix = prefixEntity?.value.trim() ?? '';
    final configuredCurrent = await _readConfiguredCurrent();
    final validSequence = await _resolveNextSequence(configuredCurrent);

    if (prefix.isEmpty) {
      return validSequence.toString();
    }
    // Prefix present → preserved format: prefix + zero-padded 8-digit folio.
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
}
