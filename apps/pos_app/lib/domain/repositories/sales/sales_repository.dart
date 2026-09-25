import '../../models/config/tax_regime.dart';
import '../../models/sales/invoice.dart';
import '../../models/sales/invoice_item.dart';
import '../../models/sales/payment.dart';
import '../../models/user.dart';
import '../../models/fulfillment/fulfillment_checkout_context.dart';

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
    FulfillmentCheckoutContext? fulfillmentContext,
  });

  Future<Invoice?> getInvoiceById(String id);
  Future<Invoice?> getInvoiceByNumber(String number);
  Future<List<Invoice>> getUnsyncedInvoices();
  Future<List<Map<String, dynamic>>> getUnsyncedAggregates();
  Future<void> markAsSynced(List<String> invoiceIds);
  Future<void> acknowledgeSaleSync({
    required String invoiceId,
    required String? outcome,
    required List<String> acknowledgedCorrelationIds,
  });
  Future<int> getInventoryEnrichmentPendingCount();
  /// D-13: assembles the faithful reprint payload for [invoiceId] from the
  /// immutable fiscal snapshot taken at issuance (header) plus the stored
  /// items/payments. Throws [ArgumentError] on a blank reason code and
  /// [StateError] (code REPRINT_SNAPSHOT_UNAVAILABLE) when the invoice
  /// predates the snapshot. Writes the REPRINT_REQUESTED audit entry at
  /// acceptance; printing happens in the view model afterwards.
  Future<ReprintPreparation> prepareReprintInvoice(
    String invoiceId,
    String reasonCode, {
    String? reasonDetail,
  });

  /// D-15: [reasonCode] is a mandatory controlled code (VoidReasonCodes)
  /// and [reasonDetail] optional free text. The repository validates the
  /// code BEFORE any write (AC-6) and stores `code — detail` on the invoice
  /// plus structured reason_code/reason_detail audit metadata (D-15 metrics
  /// hook). Throws StateError if the invoice is already canceled (AC-3).
  Future<void> voidInvoice(
    String invoiceId,
    String reasonCode, {
    String? reasonDetail,
  });
  Future<void> createCreditNote({
    required String originalInvoiceId,
    required String reason,
    // Submitted as audit metadata only; backend sync revalidates manager/owner
    // authorization before accepting CREDIT_NOTE fiscal persistence.
    required String authorizedByUserId,
    required UserRole authorizedByRole,
    RefundReasonPolicy refundReasonPolicy =
        RefundReasonPolicy.restockOriginalBom,
    List<CreditNoteRefundLine>? lines,

    /// JD-B-002/R2-3: the REAL terminal of the issuing session (same source
    /// as the sale path). The issuance shift lookup uses ONLY this value —
    /// null (or an unknown terminal) yields a null shiftId honestly, never a
    /// synthetic terminal match.
    String? terminalId,
  });

  // Reporting
  Future<List<Invoice>> getInvoicesBySessionId(String sessionId);
  Future<List<Payment>> getPaymentsBySessionId(String sessionId);
}

/// D-13: everything the print path needs to reproduce a document AS ISSUED.
/// [fiscalHeader] carries the immutable header values from the checkout
/// snapshot (businessName/ruc/address/phone/fiscalAuthorizationNumber when
/// recorded); lines and totals come from the insert-only invoice_items child
/// rows, not from a duplicate.
class ReprintPreparation {
  final Invoice invoice;
  final Map<String, String> fiscalHeader;

  /// D-13 (JD-B-003): the regime AS ISSUED, parsed from the snapshot — the
  /// reprint renders it, never the current config.
  final TaxRegime taxRegime;
  final List<InvoiceItem> items;
  final List<Payment> payments;

  const ReprintPreparation({
    required this.invoice,
    required this.fiscalHeader,
    required this.taxRegime,
    required this.items,
    required this.payments,
  });
}
