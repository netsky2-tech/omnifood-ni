import 'package:flutter/foundation.dart';
import '../../../../domain/models/sales/invoice.dart';
import '../../../../domain/models/sales/invoice_item.dart';
import '../../../../domain/models/sales/payment.dart';
import '../../../../data/database/app_database.dart';
import '../../../../data/mappers/sales_mapper.dart';

class SalesHistoryViewModel extends ChangeNotifier {
  final AppDatabase _database;

  SalesHistoryViewModel(this._database);

  List<Invoice> _invoices = [];
  List<Invoice> get invoices => _invoices;

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
    return _invoices.where((i) => i.number.toLowerCase().contains(q)).toList();
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
}
