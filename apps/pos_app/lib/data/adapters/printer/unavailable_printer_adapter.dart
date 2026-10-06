import '../../../domain/models/config/tax_regime.dart';
import '../../../domain/models/printer/receipt_document.dart';
import '../../../domain/models/sales/cashier_session.dart';
import '../../../domain/models/sales/invoice.dart';
import '../../../domain/models/sales/invoice_item.dart';
import '../../../domain/models/sales/payment.dart';
import '../../../domain/ports/printer_port.dart';
import '../../../domain/services/sales/post_paid_feedback_service.dart';

/// Operator-facing reason for every failure of this adapter. It must be
/// actionable: it names the real drivers the operator can pick instead.
const String kNetworkPrinterUnavailableMessage =
    'El controlador de impresora de red (ESC/POS) no está disponible en esta '
    'versión. Elegí Sunmi V2s o Q80 / iPos.';

/// Honest placeholder port for [PrinterDriverType.escPosNetwork] (#70 T1).
///
/// A real ESC/POS network adapter does not exist in this version, and nothing
/// in the UI can even collect the IP/port. The previous mapping routed this
/// driver to [MockPrinterAdapter], which reports ready and records every job
/// as a success — an operator with that profile printed nothing and never saw
/// an error. This adapter NEVER reports success and NEVER reports ready, and
/// it never throws: a thrown exception at port construction would take down
/// the hardware settings screen and the sale path, which is worse than the
/// defect it replaces.
class UnavailablePrinterAdapter implements PrinterPort {
  const UnavailablePrinterAdapter();

  @override
  Future<PrinterStatus> checkStatus() async => PrinterStatus.error;

  @override
  Future<PrinterResult> printReceiptDocument(
    ReceiptDocument document, {
    int paperWidthMm = 58,
  }) async {
    return PrinterResult.failure(
      PrinterStatus.error,
      kNetworkPrinterUnavailableMessage,
    );
  }

  @override
  Future<PrinterResult> printInvoice(
    Invoice invoice, {
    required List<InvoiceItem> items,
    required List<Payment> payments,
    String? businessName,
    String? legalName,
    String? ruc,
    String? address,
    String? phone,
    String? cashierName,
    List<int>? logoRasterBytes,
    required TaxRegime taxRegime,
    bool isTaxExempt = false,
    int paperWidthMm = 58,
    PostPaidFeedback? loyaltyFeedback,
    String? fiscalAuthorizationNumber,
    bool isReprint = false,
    DateTime? reprintAt,
    String? originDocumentReference,
  }) async {
    return PrinterResult.failure(
      PrinterStatus.error,
      kNetworkPrinterUnavailableMessage,
    );
  }

  @override
  Future<PrinterResult> printKitchenOrder({
    required String ticketId,
    required String orderTitle,
    required String cashierName,
    required DateTime timestamp,
    required List<InvoiceItem> items,
    String? notes,
    int? buzzerNumber,
    String? tableName,
  }) async {
    return PrinterResult.failure(
      PrinterStatus.error,
      kNetworkPrinterUnavailableMessage,
    );
  }

  @override
  Future<PrinterResult> printCorteX(
    CashierSession session, {
    required String cashierName,
    required Map<PaymentMethod, double> totalsByMethod,
    double? totalExpected,
  }) async {
    return PrinterResult.failure(
      PrinterStatus.error,
      kNetworkPrinterUnavailableMessage,
    );
  }

  @override
  Future<PrinterResult> printCorteZ(
    CashierSession session, {
    required String cashierName,
    required Map<PaymentMethod, double> totalsByMethod,
    int? zSequence,
    double? totalExpected,
    double? totalCounted,
    double? difference,
  }) async {
    return PrinterResult.failure(
      PrinterStatus.error,
      kNetworkPrinterUnavailableMessage,
    );
  }

  @override
  Future<PrinterResult> printProductionBatchLabel({
    required String productName,
    required String batchCode,
    required double quantity,
    required String uom,
    required DateTime productionDate,
    required DateTime expirationDate,
    String? operatorName,
    String? storageInstructions,
  }) async {
    return PrinterResult.failure(
      PrinterStatus.error,
      kNetworkPrinterUnavailableMessage,
    );
  }

  @override
  Future<PrinterResult> printRawEscPos(List<int> bytes) async {
    return PrinterResult.failure(
      PrinterStatus.error,
      kNetworkPrinterUnavailableMessage,
    );
  }

  @override
  Future<PrinterResult> openCashDrawer() async {
    return PrinterResult.failure(
      PrinterStatus.error,
      kNetworkPrinterUnavailableMessage,
    );
  }
}
