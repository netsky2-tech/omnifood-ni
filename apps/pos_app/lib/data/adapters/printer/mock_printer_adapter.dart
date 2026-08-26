import '../../../domain/models/sales/cashier_session.dart';
import '../../../domain/models/sales/invoice.dart';
import '../../../domain/models/sales/invoice_item.dart';
import '../../../domain/models/sales/payment.dart';
import '../../../domain/ports/printer_port.dart';
import '../../../domain/services/printer/receipt_58mm_formatter.dart';

/// In-memory Mock implementation of [PrinterPort] for unit testing and offline fallback.
class MockPrinterAdapter implements PrinterPort {
  PrinterStatus currentStatus = PrinterStatus.ready;
  bool shouldFail = false;
  String? failureMessage;

  final List<PrinterResult> printHistory = [];
  String? lastPrintedText;
  List<int>? lastPrintedBytes;
  int cashDrawerKickCount = 0;

  void reset() {
    currentStatus = PrinterStatus.ready;
    shouldFail = false;
    failureMessage = null;
    printHistory.clear();
    lastPrintedText = null;
    lastPrintedBytes = null;
    cashDrawerKickCount = 0;
  }

  @override
  Future<PrinterStatus> checkStatus() async {
    return currentStatus;
  }

  @override
  Future<PrinterResult> printInvoice(
    Invoice invoice, {
    required List<InvoiceItem> items,
    required List<Payment> payments,
    String? businessName,
    String? ruc,
    String? address,
    String? phone,
    String? cashierName,
  }) async {
    if (shouldFail || currentStatus != PrinterStatus.ready) {
      String defaultMsg = 'Error de impresión en hardware simulado';
      if (currentStatus == PrinterStatus.outOfPaper) {
        defaultMsg = 'La impresora no tiene papel.';
      } else if (currentStatus == PrinterStatus.overheating) {
        defaultMsg = 'Cabezal sobrecalentado.';
      }
      final res = PrinterResult.failure(
        currentStatus == PrinterStatus.ready ? PrinterStatus.error : currentStatus,
        failureMessage ?? defaultMsg,
      );
      printHistory.add(res);
      return res;
    }

    final text = Receipt58mmFormatter.formatInvoiceText(
      invoice,
      items: items,
      payments: payments,
      businessName: businessName,
      ruc: ruc,
      address: address,
      phone: phone,
      cashierName: cashierName,
    );

    final bytes = Receipt58mmFormatter.formatInvoiceEscPos(
      invoice,
      items: items,
      payments: payments,
      businessName: businessName,
      ruc: ruc,
      address: address,
      phone: phone,
      cashierName: cashierName,
    );

    lastPrintedText = text;
    lastPrintedBytes = bytes;

    final res = PrinterResult.success(text: text, bytes: bytes);
    printHistory.add(res);
    return res;
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
    if (shouldFail || currentStatus != PrinterStatus.ready) {
      final res = PrinterResult.failure(
        currentStatus == PrinterStatus.ready ? PrinterStatus.error : currentStatus,
        failureMessage ?? 'Impresora de cocina no disponible',
      );
      printHistory.add(res);
      return res;
    }

    final text = Receipt58mmFormatter.formatKitchenOrderText(
      ticketId: ticketId,
      orderTitle: orderTitle,
      cashierName: cashierName,
      timestamp: timestamp,
      items: items,
      notes: notes,
      buzzerNumber: buzzerNumber,
      tableName: tableName,
    );

    final bytes = Receipt58mmFormatter.formatKitchenOrderEscPos(
      ticketId: ticketId,
      orderTitle: orderTitle,
      cashierName: cashierName,
      timestamp: timestamp,
      items: items,
      notes: notes,
      buzzerNumber: buzzerNumber,
      tableName: tableName,
    );

    lastPrintedText = text;
    lastPrintedBytes = bytes;

    final res = PrinterResult.success(text: text, bytes: bytes);
    printHistory.add(res);
    return res;
  }

  @override
  Future<PrinterResult> printCorteX(
    CashierSession session, {
    required String cashierName,
    required Map<PaymentMethod, double> totalsByMethod,
    double? totalExpected,
  }) async {
    if (shouldFail || currentStatus != PrinterStatus.ready) {
      final res = PrinterResult.failure(
        currentStatus == PrinterStatus.ready ? PrinterStatus.error : currentStatus,
        failureMessage ?? 'Error imprimiendo Corte X',
      );
      printHistory.add(res);
      return res;
    }

    final text = Receipt58mmFormatter.formatCorteXText(
      session,
      cashierName: cashierName,
      totalsByMethod: totalsByMethod,
      totalExpected: totalExpected,
    );

    lastPrintedText = text;
    final res = PrinterResult.success(text: text);
    printHistory.add(res);
    return res;
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
    if (shouldFail || currentStatus != PrinterStatus.ready) {
      final res = PrinterResult.failure(
        currentStatus == PrinterStatus.ready ? PrinterStatus.error : currentStatus,
        failureMessage ?? 'Error imprimiendo Corte Z',
      );
      printHistory.add(res);
      return res;
    }

    final text = Receipt58mmFormatter.formatCorteZText(
      session,
      cashierName: cashierName,
      totalsByMethod: totalsByMethod,
      zSequence: zSequence,
      totalExpected: totalExpected,
      totalCounted: totalCounted,
      difference: difference,
    );

    lastPrintedText = text;
    final res = PrinterResult.success(text: text);
    printHistory.add(res);
    return res;
  }

  @override
  Future<PrinterResult> printRawEscPos(List<int> bytes) async {
    if (shouldFail || currentStatus != PrinterStatus.ready) {
      return PrinterResult.failure(
        currentStatus == PrinterStatus.ready ? PrinterStatus.error : currentStatus,
        failureMessage ?? 'Error enviando comandos ESC/POS',
      );
    }
    lastPrintedBytes = bytes;
    final res = PrinterResult.success(bytes: bytes);
    printHistory.add(res);
    return res;
  }

  @override
  Future<PrinterResult> openCashDrawer() async {
    if (shouldFail || currentStatus == PrinterStatus.offline) {
      return PrinterResult.failure(
        PrinterStatus.error,
        'No se pudo abrir la gaveta de dinero',
      );
    }
    cashDrawerKickCount++;
    return PrinterResult.success();
  }
}
