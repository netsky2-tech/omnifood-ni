import '../../models/sales/invoice.dart';
import '../../models/sales/invoice_item.dart';
import '../../models/sales/payment.dart';

abstract class SalesRepository {
  Future<void> saveSale({
    required Invoice invoice,
    required List<InvoiceItem> items,
    required List<Payment> payments,
  });

  Future<Invoice?> getInvoiceById(String id);
  Future<Invoice?> getInvoiceByNumber(String number);
  Future<List<Invoice>> getUnsyncedInvoices();
  Future<List<Map<String, dynamic>>> getUnsyncedAggregates();
  Future<void> markAsSynced(String invoiceId);
  Future<void> voidInvoice(String invoiceId, String reason);
  Future<void> createCreditNote({required String originalInvoiceId, required String reason});

  // Reporting
  Future<List<Invoice>> getInvoicesBySessionId(String sessionId);
  Future<List<Payment>> getPaymentsBySessionId(String sessionId);
}
