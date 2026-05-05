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

  Future<List<InvoiceItem>> getInvoiceItems(String invoiceId) async {
    final entities = await _database.invoiceItemDao.getItemsByInvoiceId(invoiceId);
    return entities.map(SalesMapper.toItemDomain).toList();
  }

  Future<List<Payment>> getInvoicePayments(String invoiceId) async {
    final entities = await _database.paymentDao.getPaymentsByInvoiceId(invoiceId);
    return entities.map(SalesMapper.toPaymentDomain).toList();
  }
}
