import 'package:flutter/foundation.dart';
import '../../../../domain/models/config/printer_config.dart';
import '../../../../domain/models/sales/invoice.dart';
import '../../../../domain/models/sales/invoice_item.dart';
import '../../../../domain/models/sales/payment.dart';
import '../../../../domain/ports/printer_port.dart';
import '../../../../domain/services/config/printer_config_service.dart';
import '../../../../domain/services/printer/printer_resolver.dart';

class HardwareSettingsViewModel extends ChangeNotifier {
  final PrinterConfigService _configService;
  final PrinterPort? _injectedPrinterPort;
  late PrinterPort _printerPort;

  PrinterConfig _config = const PrinterConfig();
  PrinterStatus _printerStatus = PrinterStatus.ready;
  bool _isLoading = false;
  bool _isTesting = false;
  String? _statusMessage;

  HardwareSettingsViewModel({
    required PrinterConfigService configService,
    PrinterPort? printerPort,
  })  : _configService = configService,
        _injectedPrinterPort = printerPort,
        _printerPort = printerPort ?? PrinterResolver.resolve(const PrinterConfig()) {
    loadConfig();
  }

  PrinterConfig get config => _config;
  PrinterStatus get printerStatus => _printerStatus;
  bool get isLoading => _isLoading;
  bool get isTesting => _isTesting;
  String? get statusMessage => _statusMessage;

  Future<void> loadConfig() async {
    _isLoading = true;
    notifyListeners();

    try {
      _config = await _configService.getPrinterConfig();
      if (_injectedPrinterPort == null) {
        _printerPort = PrinterResolver.resolve(_config);
      }
      await refreshHardwareStatus();
    } catch (e) {
      _statusMessage = 'Error al cargar configuración: $e';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> refreshHardwareStatus() async {
    try {
      _printerStatus = await _printerPort.checkStatus();
    } catch (e) {
      _printerStatus = PrinterStatus.error;
    }
    notifyListeners();
  }

  Future<void> setDriverType(PrinterDriverType driverType) async {
    _config = _config.copyWith(driverType: driverType);
    if (_injectedPrinterPort == null) {
      _printerPort = PrinterResolver.resolve(_config);
    }
    await _configService.savePrinterConfig(_config);
    await refreshHardwareStatus();
    notifyListeners();
  }

  Future<void> toggleAutoPrintInvoice(bool value) async {
    _config = _config.copyWith(autoPrintInvoice: value);
    await _configService.savePrinterConfig(_config);
    notifyListeners();
  }

  Future<void> toggleAutoPrintKitchen(bool value) async {
    _config = _config.copyWith(autoPrintKitchen: value);
    await _configService.savePrinterConfig(_config);
    notifyListeners();
  }

  Future<void> toggleOpenDrawerOnCash(bool value) async {
    _config = _config.copyWith(openDrawerOnCash: value);
    await _configService.savePrinterConfig(_config);
    notifyListeners();
  }

  Future<void> setPaperWidth(int width) async {
    _config = _config.copyWith(paperWidthMm: width);
    await _configService.savePrinterConfig(_config);
    notifyListeners();
  }

  Future<bool> testPrintReceipt() async {
    _isTesting = true;
    _statusMessage = null;
    notifyListeners();

    try {
      final sampleInvoice = Invoice(
        id: 'test-print-id',
        number: '001-001-01-00000000',
        createdAt: DateTime.now(),
        userId: 'admin',
        subtotal: 100.0,
        totalTax: 15.0,
        total: 115.0,
        commercialRate: 36.50,
        bcnOfficialRate: 36.6241,
        totalUsd: 3.15,
        terminalId: 'TEST-POS',
      );

      final sampleItems = [
        InvoiceItem(
          id: 'test-item-1',
          invoiceId: 'test-print-id',
          productId: 'prod-test',
          productName: 'TICKET DE PRUEBA HARDWARE',
          quantity: 1,
          unitPrice: 100.0,
          originalTaxRate: 0.15,
          appliedTaxRate: 0.15,
          taxAmount: 15.0,
          total: 115.0,
        ),
      ];

      final samplePayments = [
        const Payment(
          id: 'pay-test-1',
          invoiceId: 'test-print-id',
          method: PaymentMethod.cash,
          amount: 115.0,
        ),
      ];

      final result = await _printerPort.printInvoice(
        sampleInvoice,
        items: sampleItems,
        payments: samplePayments,
        businessName: _config.headerBusinessName,
        ruc: _config.headerRuc ?? 'J0310000000001',
      );

      if (result.isSuccess) {
        _statusMessage = 'Impresión de prueba enviada exitosamente';
        _isTesting = false;
        notifyListeners();
        return true;
      } else {
        _statusMessage = result.message ?? 'Fallo en la impresión de prueba';
        _isTesting = false;
        notifyListeners();
        return false;
      }
    } catch (e) {
      _statusMessage = 'Error al imprimir: $e';
      _isTesting = false;
      notifyListeners();
      return false;
    }
  }

  Future<bool> testOpenDrawer() async {
    _isTesting = true;
    notifyListeners();

    try {
      final result = await _printerPort.openCashDrawer();
      if (result.isSuccess) {
        _statusMessage = 'Pulso de apertura de gaveta enviado';
        _isTesting = false;
        notifyListeners();
        return true;
      } else {
        _statusMessage = result.message ?? 'No se pudo abrir la gaveta';
        _isTesting = false;
        notifyListeners();
        return false;
      }
    } catch (e) {
      _statusMessage = 'Error al activar gaveta: $e';
      _isTesting = false;
      notifyListeners();
      return false;
    }
  }
}
