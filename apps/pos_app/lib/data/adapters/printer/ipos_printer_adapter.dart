import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import '../../../domain/models/sales/cashier_session.dart';
import '../../../domain/models/sales/invoice.dart';
import '../../../domain/models/sales/invoice_item.dart';
import '../../../domain/models/sales/payment.dart';
import '../../../domain/ports/printer_port.dart';
import '../../../domain/services/printer/receipt_58mm_formatter.dart';

/// Hardware Driver Adapter for Alacrity Q80 and iPos-compatible thermal printers.
/// Communicates via Android Platform Channel with fallback resilience for non-Q80 environments.
class IPosPrinterAdapter implements PrinterPort {
  static const MethodChannel _defaultChannel =
      MethodChannel('com.omnifood.pos/ipos_printer');

  final MethodChannel _channel;
  bool _isHardwareDetected = false;

  IPosPrinterAdapter({MethodChannel? channel})
      : _channel = channel ?? _defaultChannel;

  bool get isHardwareDetected => _isHardwareDetected;

  @override
  Future<PrinterStatus> checkStatus() async {
    try {
      final dynamic result = await _channel.invokeMethod('getPrinterStatus');
      _isHardwareDetected = true;
      if (result == null) return PrinterStatus.ready;

      final code = result.toString().toUpperCase();
      if (code == 'READY' || code == '0') {
        return PrinterStatus.ready;
      } else if (code == 'OUT_OF_PAPER' || code == '1') {
        return PrinterStatus.outOfPaper;
      } else if (code == 'OVERHEATING' || code == '2') {
        return PrinterStatus.overheating;
      } else if (code == 'BUSY' || code == '3') {
        return PrinterStatus.busy;
      } else if (code == 'OFFLINE' || code == '4') {
        return PrinterStatus.offline;
      }
      return PrinterStatus.ready;
    } on MissingPluginException {
      // Running on a device or platform without iPos hardware service (Desktop, Emulator, Test)
      _isHardwareDetected = false;
      debugPrint('[IPosPrinterAdapter] iPos service not found on this platform. Fallback active.');
      return PrinterStatus.ready;
    } on PlatformException catch (e) {
      debugPrint('[IPosPrinterAdapter] PlatformException checking status: ${e.message}');
      return PrinterStatus.error;
    } catch (e) {
      debugPrint('[IPosPrinterAdapter] Unexpected error: $e');
      return PrinterStatus.error;
    }
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
    List<int>? logoRasterBytes,
  }) async {
    final status = await checkStatus();
    if (status == PrinterStatus.outOfPaper) {
      return PrinterResult.failure(
        PrinterStatus.outOfPaper,
        'La impresora no tiene papel. Por favor recargue el rollo de 58mm.',
      );
    } else if (status == PrinterStatus.overheating) {
      return PrinterResult.failure(
        PrinterStatus.overheating,
        'Cabezal térmico sobrecalentado. Espere unos momentos.',
      );
    }

    final formattedText = Receipt58mmFormatter.formatInvoiceText(
      invoice,
      items: items,
      payments: payments,
      businessName: businessName,
      ruc: ruc,
      address: address,
      phone: phone,
      cashierName: cashierName,
    );

    final rawBytes = Receipt58mmFormatter.formatInvoiceEscPos(
      invoice,
      items: items,
      payments: payments,
      businessName: businessName,
      ruc: ruc,
      address: address,
      phone: phone,
      cashierName: cashierName,
      logoRasterBytes: logoRasterBytes,
    );

    return _sendToHardware(rawBytes: rawBytes, plainText: formattedText);
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
    final status = await checkStatus();
    if (status == PrinterStatus.outOfPaper) {
      return PrinterResult.failure(
        PrinterStatus.outOfPaper,
        'Impresora sin papel al emitir comanda.',
      );
    }

    final formattedText = Receipt58mmFormatter.formatKitchenOrderText(
      ticketId: ticketId,
      orderTitle: orderTitle,
      cashierName: cashierName,
      timestamp: timestamp,
      items: items,
      notes: notes,
      buzzerNumber: buzzerNumber,
      tableName: tableName,
    );

    final rawBytes = Receipt58mmFormatter.formatKitchenOrderEscPos(
      ticketId: ticketId,
      orderTitle: orderTitle,
      cashierName: cashierName,
      timestamp: timestamp,
      items: items,
      notes: notes,
      buzzerNumber: buzzerNumber,
      tableName: tableName,
    );

    return _sendToHardware(rawBytes: rawBytes, plainText: formattedText);
  }

  @override
  Future<PrinterResult> printCorteX(
    CashierSession session, {
    required String cashierName,
    required Map<PaymentMethod, double> totalsByMethod,
    double? totalExpected,
  }) async {
    final formattedText = Receipt58mmFormatter.formatCorteXText(
      session,
      cashierName: cashierName,
      totalsByMethod: totalsByMethod,
      totalExpected: totalExpected,
    );

    return _sendToHardware(plainText: formattedText);
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
    final formattedText = Receipt58mmFormatter.formatCorteZText(
      session,
      cashierName: cashierName,
      totalsByMethod: totalsByMethod,
      zSequence: zSequence,
      totalExpected: totalExpected,
      totalCounted: totalCounted,
      difference: difference,
    );

    return _sendToHardware(plainText: formattedText);
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
    final status = await checkStatus();
    if (status == PrinterStatus.outOfPaper) {
      return PrinterResult.failure(
        PrinterStatus.outOfPaper,
        'Impresora sin papel al emitir viñeta de lote.',
      );
    }

    final formattedText = Receipt58mmFormatter.formatProductionBatchLabelText(
      productName: productName,
      batchCode: batchCode,
      quantity: quantity,
      uom: uom,
      productionDate: productionDate,
      expirationDate: expirationDate,
      operatorName: operatorName,
      storageInstructions: storageInstructions,
    );

    final rawBytes = Receipt58mmFormatter.formatProductionBatchLabelEscPos(
      productName: productName,
      batchCode: batchCode,
      quantity: quantity,
      uom: uom,
      productionDate: productionDate,
      expirationDate: expirationDate,
      operatorName: operatorName,
      storageInstructions: storageInstructions,
    );

    return _sendToHardware(rawBytes: rawBytes, plainText: formattedText);
  }

  @override
  Future<PrinterResult> printRawEscPos(List<int> bytes) async {
    return _sendToHardware(rawBytes: bytes);
  }

  @override
  Future<PrinterResult> openCashDrawer() async {
    try {
      await _channel.invokeMethod('openDrawer');
      return PrinterResult.success();
    } on MissingPluginException {
      debugPrint('[IPosPrinterAdapter] openDrawer fallback simulation.');
      return PrinterResult.success();
    } on PlatformException catch (e) {
      debugPrint('[IPosPrinterAdapter] Error opening cash drawer: ${e.message}');
      return PrinterResult.failure(PrinterStatus.error, e.message ?? 'Error de gaveta');
    } catch (e) {
      return PrinterResult.failure(PrinterStatus.error, e.toString());
    }
  }

  Future<PrinterResult> _sendToHardware({
    List<int>? rawBytes,
    String? plainText,
  }) async {
    try {
      if (rawBytes != null && rawBytes.isNotEmpty) {
        await _channel.invokeMethod('printRawBytes', {'bytes': Uint8List.fromList(rawBytes)});
      } else if (plainText != null && plainText.isNotEmpty) {
        await _channel.invokeMethod('printText', {'text': plainText});
      }
      return PrinterResult.success(bytes: rawBytes, text: plainText);
    } on MissingPluginException {
      // Graceful fallback: on devices without iPos hardware, log preview and return success
      debugPrint('[IPosPrinterAdapter Fallback Print Preview]:\n${plainText ?? rawBytes.toString()}');
      return PrinterResult.success(bytes: rawBytes, text: plainText);
    } on PlatformException catch (e) {
      debugPrint('[IPosPrinterAdapter] Platform print error: ${e.message}');
      return PrinterResult.failure(
        PrinterStatus.error,
        e.message ?? 'Error en servicio de impresión iPos',
      );
    } catch (e) {
      debugPrint('[IPosPrinterAdapter] General print error: $e');
      return PrinterResult.failure(PrinterStatus.error, e.toString());
    }
  }
}
