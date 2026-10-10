import 'package:flutter/foundation.dart';
import '../../../../core/localization/display_name_resolver.dart';
import '../../../../domain/models/inventory/product.dart';
import '../../../../domain/models/sales/invoice.dart';
import '../../../../domain/models/sales/invoice_item.dart';
import '../../../../domain/models/sales/payment.dart';
import '../../../../data/database/app_database.dart';
import '../../../../data/mappers/sales_mapper.dart';

/// Contextual metadata for an invoice row in the sales history (§12.2, PX-003)
class InvoiceRowContext {
  final String cashierName;
  final String itemsSummary;
  final String paymentMethodSummary;

  const InvoiceRowContext({
    required this.cashierName,
    required this.itemsSummary,
    required this.paymentMethodSummary,
  });
}

/// SOHO P3 S3a: money reconciliation over a filtered sales-history set.
/// Cancelled (anulada) invoices are counted in [cancelledCount] but NEVER
/// contribute to the money sums — a cancelled invoice inflating the day's
/// revenue would be a false reconciliation against the cash drawer / Z
/// report.
class SalesHistoryTotals {
  final int invoiceCount;
  final int cancelledCount;
  final double subtotalSum;
  final double taxSum;
  final double totalSum;

  const SalesHistoryTotals({
    required this.invoiceCount,
    required this.cancelledCount,
    required this.subtotalSum,
    required this.taxSum,
    required this.totalSum,
  });

  const SalesHistoryTotals.empty()
    : this(
        invoiceCount: 0,
        cancelledCount: 0,
        subtotalSum: 0,
        taxSum: 0,
        totalSum: 0,
      );
}

class SalesHistoryViewModel extends ChangeNotifier {
  final AppDatabase _database;

  SalesHistoryViewModel(this._database);

  List<Invoice> _invoices = [];
  List<Invoice> get invoices => _invoices;

  /// SOHO P3 S3a: honest failure signal. Null = the last load succeeded.
  /// When set, the UI must render an error state — NOT an "empty history",
  /// which would be indistinguishable from "no sales today" and, in a
  /// fiscal product, a lie the cashier cannot detect.
  String? _loadErrorMessage;
  String? get loadErrorMessage => _loadErrorMessage;
  bool get hasLoadError => _loadErrorMessage != null;

  /// SOHO P3 S3a: rows whose per-invoice context reads (items/payments)
  /// failed. Their row context is absent (the row renders degraded) but the
  /// count makes the degradation visible instead of silent.
  int _rowContextFailureCount = 0;
  int get rowContextFailureCount => _rowContextFailureCount;

  static const String loadFailureMessage =
      'No se pudo leer el historial de ventas. Verifique el almacenamiento local del terminal.';

  /// SOHO P3 S3a: bounded display window. Totals are always computed over
  /// the FULL filtered set; only the rows handed to the UI are windowed.
  static const int pageSize = 50;
  int _visibleCount = pageSize;

  final Map<String, InvoiceRowContext> _rowContexts = {};
  InvoiceRowContext? getRowContext(String invoiceId) => _rowContexts[invoiceId];

  bool _isLoading = false;
  bool get isLoading => _isLoading;

  String _searchQuery = '';
  String get searchQuery => _searchQuery;

  Future<void> loadInvoices() async {
    _isLoading = true;
    notifyListeners();
    try {
      final entities = await _database.invoiceDao.getAllInvoices();
      _invoices = entities.map(SalesMapper.toInvoiceDomain).toList();
      // SOHO P3 S3a: a successful read clears any previous failure signal.
      _loadErrorMessage = null;
      _rowContextFailureCount = 0;
      _rowContexts.clear();
      _visibleCount = pageSize;

      // D-14: build the id→name map once per view load. findAllUsers()
      // (not the active-only query) on purpose: historical attribution must
      // survive a user later being deactivated or deleted.
      try {
        _userNamesById = await loadUserNameMap();
      } catch (_) {
        // Fail honest: an unresolved id renders the fallback label, never
        // the raw UUID.
        _userNamesById = const {};
      }

      // Populate rich context for invoice rows (§12.2, PX-003). S3a: the
      // per-invoice read lives behind an overridable seam so a row-context
      // failure is countable (and testable) instead of silent.
      for (final invoice in _invoices) {
        try {
          _rowContexts[invoice.id] = await loadRowContext(invoice);
        } catch (_) {
          // S3a: fail visible — the row renders without context, but the
          // count exposes that degradation happened.
          _rowContextFailureCount++;
        }
      }
    } catch (_) {
      // SOHO P3 S3a: HONEST FAILURE. The previous `catch (_) {}` made a
      // failed invoice read render as an empty history — indistinguishable
      // from "no sales today". The retained data (if any) plus
      // [loadErrorMessage] let the UI distinguish "no sales" from "could
      // not read sales".
      _loadErrorMessage = loadFailureMessage;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// SOHO P3 S3a: overridable seam for ONE invoice's row context, so tests
  /// can force a per-row read failure without corrupting the database.
  /// Called once per invoice per load (two child reads per invoice — the
  /// N+1 is a known performance observation, deliberately not refactored
  /// in this unit).
  @protected
  Future<InvoiceRowContext> loadRowContext(Invoice invoice) async {
    final items = await _database.invoiceItemDao.getItemsByInvoiceId(
      invoice.id,
    );
    final payments = await _database.paymentDao.getPaymentsByInvoiceId(
      invoice.id,
    );

    final itemsSummary = items.isEmpty
        ? ''
        : items
              .map((it) {
                final qty = it.quantity % 1 == 0
                    ? it.quantity.toInt().toString()
                    : it.quantity.toString();
                return '${qty}x ${it.productName}';
              })
              .join(', ');

    String paymentSummary = '';
    if (payments.isNotEmpty) {
      final methods = payments
          .map((p) => _formatPaymentMethod(p.method))
          .toSet()
          .toList();
      paymentSummary = methods.length == 1 ? methods.first : 'Mixto';
    }

    // D-14: resolve through the shared resolver so an unknown id
    // renders the honest fallback, never the raw UUID (PX-003's
    // `?? invoice.userId` would have leaked it back into the row).
    final cashierName = userNameFor(invoice.userId);

    return InvoiceRowContext(
      cashierName: cashierName,
      itemsSummary: itemsSummary,
      paymentMethodSummary: paymentSummary,
    );
  }

  Map<String, String> _userNamesById = const {};

  /// D-14: overridable seam so fakes can supply names without a database.
  @protected
  Future<Map<String, String>> loadUserNameMap() async {
    final users = await _database.userDao.findAllUsers();
    return {for (final u in users) u.id: u.name};
  }

  /// Resolves a stored user id to the person's display name (or the honest
  /// fallback). The view must render this, never the raw id.
  String userNameFor(String? userId) =>
      resolveUserName(userId, _userNamesById);

  void setSearchQuery(String query) {
    _searchQuery = query;
    // S3a: a changed filter restarts the display window.
    _visibleCount = pageSize;
    notifyListeners();
  }

  /// SOHO P3 S3a: inclusive date-range filter on the invoice's LOCAL fiscal
  /// day, combined with the text search as an AND. Null on a side = that
  /// bound is open; both null = no date filter (default, preserving current
  /// behaviour).
  DateTime? _filterDateFrom;
  DateTime? _filterDateTo;
  DateTime? get filterDateFrom => _filterDateFrom;
  DateTime? get filterDateTo => _filterDateTo;

  void setDateRange(DateTime? from, DateTime? to) {
    _filterDateFrom = from;
    _filterDateTo = to;
    // S3a: a changed filter restarts the display window.
    _visibleCount = pageSize;
    notifyListeners();
  }

  void clearDateRange() => setDateRange(null, null);

  /// SOHO P3 S3a: the LOCAL fiscal day a sale belongs to.
  ///
  /// Prefer the STORED local issue date ([Invoice.localIssueDate], D-12):
  /// it is a fiscal fact fixed at issuance. Filtering on `createdAt` instead
  /// would re-interpret an epoch timestamp under whatever timezone is in
  /// effect when the filter runs — a sale issued 23:59 local in Nicaragua
  /// (UTC-6) is already 05:59 of the NEXT day in UTC, so a UTC-derived day
  /// filter silently moves it to the wrong fiscal day. Fall back to the
  /// creation timestamp only when the stored date is absent (pre-migration
  /// rows), interpreted in the device's LOCAL calendar.
  DateTime _fiscalDayOf(Invoice invoice) {
    final stored = invoice.localIssueDate;
    if (stored != null) {
      final parsed = DateTime.tryParse(stored);
      if (parsed != null) {
        return DateTime(parsed.year, parsed.month, parsed.day);
      }
    }
    final created = invoice.createdAt;
    return DateTime(created.year, created.month, created.day);
  }

  bool _isWithinDateRange(Invoice invoice) {
    final fiscalDay = _fiscalDayOf(invoice);
    final from = _filterDateFrom;
    if (from != null) {
      final fromDay = DateTime(from.year, from.month, from.day);
      if (fiscalDay.isBefore(fromDay)) return false;
    }
    final to = _filterDateTo;
    if (to != null) {
      final toDay = DateTime(to.year, to.month, to.day);
      if (fiscalDay.isAfter(toDay)) return false;
    }
    return true;
  }

  List<Invoice> get filteredInvoices {
    Iterable<Invoice> result = _invoices;
    if (_filterDateFrom != null || _filterDateTo != null) {
      result = result.where(_isWithinDateRange);
    }
    final q = _searchQuery.toLowerCase();
    if (q.isNotEmpty) {
      result = result.where((i) {
        if (i.number.toLowerCase().contains(q)) return true;
        final ctx = _rowContexts[i.id];
        if (ctx != null) {
          if (ctx.cashierName.toLowerCase().contains(q)) return true;
          if (ctx.itemsSummary.toLowerCase().contains(q)) return true;
          if (ctx.paymentMethodSummary.toLowerCase().contains(q)) return true;
        }
        return false;
      });
    }
    return result.toList();
  }

  /// SOHO P3 S3a: the rows the UI should render right now — the filtered
  /// set, windowed to [_visibleCount]. Totals (see [filteredTotals]) are
  /// NOT windowed.
  List<Invoice> get visibleInvoices =>
      filteredInvoices.take(_visibleCount).toList(growable: false);

  /// SOHO P3 S3a: honest flag for a "show more" affordance.
  bool get hasMoreVisibleInvoices => filteredInvoices.length > _visibleCount;

  void revealMoreVisible() {
    _visibleCount += pageSize;
    notifyListeners();
  }

  /// SOHO P3 S3a: money reconciliation over the ENTIRE filtered set (never
  /// the visible window). FISCAL RULE: cancelled (anulada) invoices are
  /// counted in [SalesHistoryTotals.cancelledCount] but contribute NOTHING
  /// to the money sums — a cancelled invoice inflating the day's revenue
  /// would be a false reconciliation.
  SalesHistoryTotals get filteredTotals {
    var count = 0;
    var cancelled = 0;
    var subtotal = 0.0;
    var tax = 0.0;
    var total = 0.0;
    for (final invoice in filteredInvoices) {
      count++;
      if (invoice.isCanceled) {
        cancelled++;
        continue;
      }
      subtotal += invoice.subtotal;
      tax += invoice.totalTax;
      total += invoice.total;
    }
    return SalesHistoryTotals(
      invoiceCount: count,
      cancelledCount: cancelled,
      subtotalSum: subtotal,
      taxSum: tax,
      totalSum: total,
    );
  }

  /// D-12: the freshest persisted snapshot for [id], or null when the row is
  /// not in the loaded list. Detail surfaces render this instead of the
  /// snapshot captured when the row was tapped, so a void (from this terminal
  /// or another) flips the preview to ANULADA and withdraws the void action
  /// immediately instead of offering ANULAR on an invoice that is already
  /// cancelled.
  Invoice? invoiceById(String id) {
    for (final invoice in _invoices) {
      if (invoice.id == id) return invoice;
    }
    return null;
  }

  Future<List<InvoiceItem>> getInvoiceItems(String invoiceId) async {
    final entities =
        await _database.invoiceItemDao.getItemsByInvoiceId(invoiceId);
    // Round-2 §17.4: the detail must mirror the cart, so it carries the line
    // modifiers the receipt path already prints. One batched query for the
    // whole invoice (never N+1), keeping each line's insertion order.
    final modifierRows =
        await _database.invoiceItemDao.getModifierRowsByInvoiceId(invoiceId);
    final modifiersByItemId = <String, List<Modifier>>{};
    for (final row in modifierRows) {
      modifiersByItemId
          .putIfAbsent(row.invoiceItemId, () => <Modifier>[])
          .add(SalesMapper.toModifierDomain(row));
    }
    return entities
        .map(
          (entity) => SalesMapper.toItemDomain(
            entity,
            modifiers: modifiersByItemId[entity.id] ?? const <Modifier>[],
          ),
        )
        .toList();
  }

  Future<List<Payment>> getInvoicePayments(String invoiceId) async {
    final entities = await _database.paymentDao.getPaymentsByInvoiceId(invoiceId);
    return entities.map(SalesMapper.toPaymentDomain).toList();
  }

  static String _formatPaymentMethod(String method) {
    final m = method.toLowerCase();
    if (m.contains('cash') || m.contains('efectivo')) return 'Efectivo';
    if (m.contains('card') || m.contains('tarjeta')) return 'Tarjeta';
    if (m.contains('points') || m.contains('puntos')) return 'Puntos';
    return method;
  }
}
