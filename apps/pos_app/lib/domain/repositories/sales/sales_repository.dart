import '../../models/sales/invoice.dart';
import '../../models/sales/invoice_item.dart';
import '../../models/sales/payment.dart';
import '../../models/user.dart';

enum RefundReasonPolicy {
  restockOriginalBom,
  financialOnly,
  wasteNoRestock,
  managerReviewHold,
}

extension RefundReasonPolicyBackendName on RefundReasonPolicy {
  String get backendName {
    switch (this) {
      case RefundReasonPolicy.restockOriginalBom:
        return 'RESTOCK_ORIGINAL_BOM';
      case RefundReasonPolicy.financialOnly:
        return 'FINANCIAL_ONLY';
      case RefundReasonPolicy.wasteNoRestock:
        return 'WASTE_NO_RESTOCK';
      case RefundReasonPolicy.managerReviewHold:
        return 'MANAGER_REVIEW_HOLD';
    }
  }
}

class CreditNoteRefundLine {
  final String originInvoiceItemId;
  final double quantity;

  const CreditNoteRefundLine({
    required this.originInvoiceItemId,
    required this.quantity,
  });
}

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
  Future<void> markAsSynced(List<String> invoiceIds);
  Future<void> voidInvoice(String invoiceId, String reason);
  Future<void> createCreditNote({
    required String originalInvoiceId,
    required String reason,
    required String authorizedByUserId,
    required UserRole authorizedByRole,
    RefundReasonPolicy refundReasonPolicy =
        RefundReasonPolicy.restockOriginalBom,
    List<CreditNoteRefundLine>? lines,
  });

  // Reporting
  Future<List<Invoice>> getInvoicesBySessionId(String sessionId);
  Future<List<Payment>> getPaymentsBySessionId(String sessionId);
}
