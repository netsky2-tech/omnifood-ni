import 'package:flutter/foundation.dart';
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

      // Populate rich context for invoice rows (§12.2, PX-003)
      final userMap = <String, String>{};
      try {
        final users = await _database.userDao.findAllUsers();
        for (final u in users) {
          userMap[u.id] = u.name;
        }
      } catch (_) {}

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

          final cashierName = userMap[invoice.userId] ?? invoice.userId;

          _rowContexts[invoice.id] = InvoiceRowContext(
            cashierName: cashierName,
            itemsSummary: itemsSummary,
            paymentMethodSummary: paymentSummary,
          );
        } catch (_) {}
      }
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

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
