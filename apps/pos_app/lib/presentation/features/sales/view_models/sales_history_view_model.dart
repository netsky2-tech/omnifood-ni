import 'package:flutter/foundation.dart';
import '../../../../core/localization/display_name_resolver.dart';
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

class SalesHistoryViewModel extends ChangeNotifier {
  final AppDatabase _database;

  SalesHistoryViewModel(this._database);

  List<Invoice> _invoices = [];
  List<Invoice> get invoices => _invoices;

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

      // Populate rich context for invoice rows (§12.2, PX-003)
      for (final invoice in _invoices) {
        try {
          final items = await _database.invoiceItemDao.getItemsByInvoiceId(invoice.id);
          final payments = await _database.paymentDao.getPaymentsByInvoiceId(invoice.id);

          final itemsSummary = items.isEmpty
              ? ''
              : items.map((it) {
                  final qty = it.quantity % 1 == 0 ? it.quantity.toInt().toString() : it.quantity.toString();
                  return '${qty}x ${it.productName}';
                }).join(', ');

          String paymentSummary = '';
          if (payments.isNotEmpty) {
            final methods = payments.map((p) => _formatPaymentMethod(p.method)).toSet().toList();
            paymentSummary = methods.length == 1 ? methods.first : 'Mixto';
          }

          // D-14: resolve through the shared resolver so an unknown id
          // renders the honest fallback, never the raw UUID (PX-003's
          // `?? invoice.userId` would have leaked it back into the row).
          final cashierName = userNameFor(invoice.userId);

          _rowContexts[invoice.id] = InvoiceRowContext(
            cashierName: cashierName,
            itemsSummary: itemsSummary,
            paymentMethodSummary: paymentSummary,
          );
        } catch (_) {}
      }
    } catch (_) {
      _userNamesById = const {};
    } finally {
      _isLoading = false;
      notifyListeners();
    }
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
    notifyListeners();
  }

  List<Invoice> get filteredInvoices {
    if (_searchQuery.isEmpty) return _invoices;
    final q = _searchQuery.toLowerCase();
    return _invoices.where((i) {
      if (i.number.toLowerCase().contains(q)) return true;
      final ctx = _rowContexts[i.id];
      if (ctx != null) {
        if (ctx.cashierName.toLowerCase().contains(q)) return true;
        if (ctx.itemsSummary.toLowerCase().contains(q)) return true;
        if (ctx.paymentMethodSummary.toLowerCase().contains(q)) return true;
      }
      return false;
    }).toList();
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
    final entities = await _database.invoiceItemDao.getItemsByInvoiceId(invoiceId);
    return entities.map(SalesMapper.toItemDomain).toList();
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
