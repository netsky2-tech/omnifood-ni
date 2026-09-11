import 'package:pos_app/domain/services/sales/post_paid_feedback_service.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import '../../../domain/models/config/tax_regime.dart';
import '../../../domain/models/printer/receipt_document.dart';
import '../../../domain/models/sales/cashier_session.dart';
import '../../../domain/models/sales/invoice.dart';
import '../../../domain/models/sales/invoice_item.dart';
import '../../../domain/models/sales/payment.dart';
import '../../../domain/ports/printer_port.dart';
import '../../../domain/services/printer/receipt_58mm_formatter.dart';
import '../../../domain/services/printer/receipt_layout_formatter.dart';
import '../../../domain/services/printer/thermal_logo_processor.dart';

/// Hardware Driver Adapter for Alacrity Q80 and iPos-compatible thermal printers.
/// Communicates via Android Platform Channel with fallback resilience for non-Q80 environments.
class IPosPrinterAdapter implements PrinterPort {
  /// Keeps platform-channel bitmap payloads bounded before Nyx decodes them.
  static const int maxLogoBytes = 1024 * 1024;

  static const MethodChannel _defaultChannel = MethodChannel(
    'com.nhilos.pos/ipos_printer',
  );

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
      debugPrint(
        '[IPosPrinterAdapter] iPos service not found on this platform. Fallback active.',
      );
      return PrinterStatus.ready;
    } on PlatformException catch (e) {
      debugPrint(
        '[IPosPrinterAdapter] PlatformException checking status: ${e.message}',
      );
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
  }) async {
    final status = await checkStatus();
    if (status == PrinterStatus.outOfPaper) {
      return PrinterResult.failure(
        PrinterStatus.outOfPaper,
        'La impresora no tiene papel. Por favor recargue el rollo de papel térmico.',
      );
    } else if (status == PrinterStatus.overheating) {
      return PrinterResult.failure(
        PrinterStatus.overheating,
        'Cabezal térmico sobrecalentado. Espere unos momentos.',
      );
    }

    final normalizedPaperWidthMm = _normalizedPaperWidthMm(paperWidthMm);
    final formatter = ReceiptLayoutFormatter.fromPaperWidth(
      normalizedPaperWidthMm,
    );
    final String formattedText;
    if (loyaltyFeedback?.hasContent ?? false) {
      formattedText = formatter.formatInvoiceText(
        invoice,
        items: items,
        payments: payments,
        businessName: businessName,
        legalName: legalName,
        ruc: ruc,
        address: address,
        phone: phone,
        cashierName: cashierName,
        taxRegime: taxRegime,
        isTaxExempt: isTaxExempt,
        loyaltyFeedback: loyaltyFeedback,
      );
    } else {
      final document = ReceiptDocument.fromInvoice(
        invoice,
        items: items,
        payments: payments,
        businessName: businessName,
        legalName: legalName,
        ruc: ruc,
        address: address,
        phone: phone,
        cashierName: cashierName,
        taxRegime: taxRegime,
        isTaxExempt: isTaxExempt,
        logoRasterBytes: logoRasterBytes,
      );
      formattedText = formatter.formatReceiptDocumentText(document);
    }

    try {
      // 1. If logo is provided, print it using native Nyx bitmap printing
      if (logoRasterBytes != null &&
          logoRasterBytes.isNotEmpty &&
          logoRasterBytes.length <= maxLogoBytes &&
          ThermalLogoProcessor.isPng(Uint8List.fromList(logoRasterBytes))) {
        await _channel.invokeMethod('printBitmap', {
          'bytes': Uint8List.fromList(logoRasterBytes),
        });
      } else if (logoRasterBytes != null && logoRasterBytes.isNotEmpty) {
        debugPrint(
          '[IPosPrinterAdapter] Skipped invalid/unsupported bitmap; text receipt continues.',
        );
      }

      // This selects per-job layout/render width only; it does not change the
      // persistent physical/default paper setting in net.nyx.printerservice.SETTINGS.
      await _channel.invokeMethod('printText', {
        'text': formattedText,
        'paperWidthMm': normalizedPaperWidthMm,
      });
      return PrinterResult.success(text: formattedText);
    } on MissingPluginException {
      debugPrint('[IPosPrinterAdapter] iPos print service unavailable.');
      return PrinterResult.failure(
        PrinterStatus.error,
        'Servicio de impresión iPos no disponible.',
      );
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

  @override
  Future<PrinterResult> printReceiptDocument(
    ReceiptDocument document, {
    int paperWidthMm = 58,
  }) async {
    final normalizedPaperWidthMm = _normalizedPaperWidthMm(paperWidthMm);
    final text = ReceiptLayoutFormatter.fromPaperWidth(
      normalizedPaperWidthMm,
    ).formatReceiptDocumentText(document);
    try {
      final logo = document.logoRasterBytes;
      if (logo != null &&
          logo.isNotEmpty &&
          logo.length <= maxLogoBytes &&
          ThermalLogoProcessor.isPng(Uint8List.fromList(logo))) {
        await _channel.invokeMethod('printBitmap', {
          'bytes': Uint8List.fromList(logo),
        });
      } else if (logo != null && logo.isNotEmpty) {
        debugPrint(
          '[IPosPrinterAdapter] Skipped invalid/unsupported bitmap; text receipt continues.',
        );
      }
      // This selects per-job layout/render width only; it does not change the
      // persistent physical/default paper setting in net.nyx.printerservice.SETTINGS.
      await _channel.invokeMethod('printText', {
        'text': text,
        'paperWidthMm': normalizedPaperWidthMm,
      });
      return PrinterResult.success(text: text);
    } on MissingPluginException {
      return PrinterResult.failure(
        PrinterStatus.error,
        'Servicio de impresión iPos no disponible.',
      );
    } on PlatformException catch (e) {
      return PrinterResult.failure(
        PrinterStatus.error,
        e.message ?? 'Error en servicio de impresión iPos',
      );
    } catch (e) {
      return PrinterResult.failure(PrinterStatus.error, e.toString());
    }
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

    return _sendToHardware(plainText: formattedText);
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
      debugPrint(
        '[IPosPrinterAdapter] Error opening cash drawer: ${e.message}',
      );
      return PrinterResult.failure(
        PrinterStatus.error,
        e.message ?? 'Error de gaveta',
      );
    } catch (e) {
      return PrinterResult.failure(PrinterStatus.error, e.toString());
    }
  }

  int _normalizedPaperWidthMm(int paperWidthMm) => paperWidthMm < 80 ? 58 : 80;

  Future<PrinterResult> _sendToHardware({
    List<int>? rawBytes,
    String? plainText,
    int paperWidthMm = 58,
  }) async {
    try {
      // Nyx exposes text and bitmap APIs, not a raw ESC/POS transport. Prefer
      // the already-rendered text whenever both representations are available.
      if (plainText != null && plainText.isNotEmpty) {
        await _channel.invokeMethod('printText', {
          'text': plainText,
          'paperWidthMm': _normalizedPaperWidthMm(paperWidthMm),
        });
      } else if (rawBytes != null && rawBytes.isNotEmpty) {
        await _channel.invokeMethod('printRawBytes', {
          'bytes': Uint8List.fromList(rawBytes),
        });
      }
      return PrinterResult.success(bytes: rawBytes, text: plainText);
    } on MissingPluginException {
      // A missing plugin cannot confirm a physical print
      debugPrint('[IPosPrinterAdapter] iPos print service unavailable.');
      return PrinterResult.failure(
        PrinterStatus.error,
        'Servicio de impresión iPos no disponible.',
      );
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
