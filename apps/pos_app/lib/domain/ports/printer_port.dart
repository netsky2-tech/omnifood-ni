import '../models/sales/cashier_session.dart';
import '../models/sales/invoice.dart';
import '../models/sales/invoice_item.dart';
import '../models/sales/payment.dart';

enum PrinterStatus {
  ready,
  outOfPaper,
  overheating,
  offline,
  error,
  busy,
}

class PrinterResult {
  final bool isSuccess;
  final PrinterStatus status;
  final String? message;
  final List<int>? printedBytes;
  final String? printedText;

  const PrinterResult({
    required this.isSuccess,
    required this.status,
    this.message,
    this.printedBytes,
    this.printedText,
  });

  factory PrinterResult.success({List<int>? bytes, String? text}) {
    return PrinterResult(
      isSuccess: true,
      status: PrinterStatus.ready,
      printedBytes: bytes,
      printedText: text,
    );
  }

  factory PrinterResult.failure(PrinterStatus status, String message) {
    return PrinterResult(
      isSuccess: false,
      status: status,
      message: message,
    );
  }
}

/// Hexagonal Output Port for Hardware / Thermal ESC/POS Printers (Sunmi V2s, ESC/POS 58mm/80mm)
abstract class PrinterPort {
  /// Checks whether the hardware printer is reachable, online, and has paper.
  Future<PrinterStatus> checkStatus();

  /// Prints a fiscal or standard customer receipt in 58mm (32 cols) or 80mm format.
  Future<PrinterResult> printInvoice(
    Invoice invoice, {
    required List<InvoiceItem> items,
    required List<Payment> payments,
    String? businessName,
    String? ruc,
    String? address,
    String? phone,
    String? cashierName,
    List<int>? logoRasterBytes,
  });

  /// Prints a kitchen / KDS order ticket with buzzer / table identification.
  Future<PrinterResult> printKitchenOrder({
    required String ticketId,
    required String orderTitle,
    required String cashierName,
    required DateTime timestamp,
    required List<InvoiceItem> items,
    String? notes,
    int? buzzerNumber,
    String? tableName,
  });

  /// Prints a mid-shift Partial Cash Drawer Audit (Corte X).
  Future<PrinterResult> printCorteX(
    CashierSession session, {
    required String cashierName,
    required Map<PaymentMethod, double> totalsByMethod,
    double? totalExpected,
  });

  /// Prints a final end-of-shift Cash Drawer Audit (Corte Z).
  Future<PrinterResult> printCorteZ(
    CashierSession session, {
    required String cashierName,
    required Map<PaymentMethod, double> totalsByMethod,
    int? zSequence,
    double? totalExpected,
    double? totalCounted,
    double? difference,
  });

  /// Sends raw ESC/POS byte sequence directly to the hardware printer.
  Future<PrinterResult> printRawEscPos(List<int> bytes);

  /// Triggers hardware cash drawer kick (ESC/POS pin 2/5 pulse).
  Future<PrinterResult> openCashDrawer();
}
