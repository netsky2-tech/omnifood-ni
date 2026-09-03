import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/adapters/printer/sunmi_printer_adapter.dart';
import 'package:pos_app/domain/models/sales/cashier_session.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/ports/printer_port.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late SunmiPrinterAdapter adapter;
  late List<MethodCall> channelLog;
  dynamic mockChannelResponse;

  const channel = MethodChannel('com.omnifood.pos/sunmi_printer');

  setUp(() {
    channelLog = [];
    mockChannelResponse = null;

    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (MethodCall methodCall) async {
      channelLog.add(methodCall);
      if (mockChannelResponse is Exception) {
        throw mockChannelResponse as Exception;
      }
      return mockChannelResponse;
    });

    adapter = SunmiPrinterAdapter(channel: channel);
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  group('SunmiPrinterAdapter Hardware Status Tests', () {
    test('checkStatus maps READY string to PrinterStatus.ready', () async {
      mockChannelResponse = 'READY';
      final status = await adapter.checkStatus();
      expect(status, PrinterStatus.ready);
      expect(adapter.isHardwareDetected, isTrue);
    });

    test('checkStatus maps OUT_OF_PAPER to PrinterStatus.outOfPaper', () async {
      mockChannelResponse = 'OUT_OF_PAPER';
      final status = await adapter.checkStatus();
      expect(status, PrinterStatus.outOfPaper);
    });

    test('checkStatus maps OVERHEATING to PrinterStatus.overheating', () async {
      mockChannelResponse = 'OVERHEATING';
      final status = await adapter.checkStatus();
      expect(status, PrinterStatus.overheating);
    });

    test('checkStatus falls back gracefully when MissingPluginException occurs', () async {
      mockChannelResponse = MissingPluginException();
      final status = await adapter.checkStatus();
      expect(status, PrinterStatus.ready);
      expect(adapter.isHardwareDetected, isFalse);
    });
  });

  group('SunmiPrinterAdapter Printing & Drawer Tests', () {
    final testInvoice = Invoice(
      id: 'inv-1',
      number: '001-001-01-00000001',
      createdAt: DateTime(2026, 8, 26),
      userId: 'user-1',
      subtotal: 100,
      totalTax: 15,
      total: 115,
    );

    final testItems = [
      InvoiceItem(
        id: 'item-1',
        invoiceId: 'inv-1',
        productId: 'prod-1',
        productName: 'Café Espresso',
        quantity: 1,
        unitPrice: 100,
        originalTaxRate: 0.15,
        appliedTaxRate: 0.15,
        taxAmount: 15,
        total: 115,
      ),
    ];

    final testPayments = [
      const Payment(
        id: 'p-1',
        invoiceId: 'inv-1',
        method: PaymentMethod.cash,
        amount: 115,
      ),
    ];

    test('printInvoice sends raw bytes to channel when ready', () async {
      mockChannelResponse = 'READY';
      final result = await adapter.printInvoice(
        testInvoice,
        items: testItems,
        payments: testPayments,
        businessName: 'NHILOS POS Sunmi Test',
      );

      expect(result.isSuccess, isTrue);
      expect(channelLog.any((c) => c.method == 'printRawBytes'), isTrue);
    });

    test('printInvoice returns failure when out of paper without crashing', () async {
      mockChannelResponse = 'OUT_OF_PAPER';
      final result = await adapter.printInvoice(
        testInvoice,
        items: testItems,
        payments: testPayments,
      );

      expect(result.isSuccess, isFalse);
      expect(result.status, PrinterStatus.outOfPaper);
      expect(result.message, contains('papel'));
      // Does not attempt to print bytes
      expect(channelLog.any((c) => c.method == 'printRawBytes'), isFalse);
    });

    test('printKitchenOrder sends raw bytes to channel', () async {
      mockChannelResponse = 'READY';
      final result = await adapter.printKitchenOrder(
        ticketId: 'TK-1',
        orderTitle: 'Orden #1',
        cashierName: 'Maria',
        timestamp: DateTime(2026, 8, 26, 12, 0),
        items: testItems,
        buzzerNumber: 3,
      );

      expect(result.isSuccess, isTrue);
      expect(channelLog.any((c) => c.method == 'printRawBytes'), isTrue);
    });

    test('printCorteX sends text to channel', () async {
      mockChannelResponse = 'READY';
      final session = CashierSession(
        id: 's-1',
        userId: 'u-1',
        openedAt: DateTime(2026, 8, 26, 8, 0),
      );

      final result = await adapter.printCorteX(
        session,
        cashierName: 'Pedro',
        totalsByMethod: {PaymentMethod.cash: 500},
      );

      expect(result.isSuccess, isTrue);
      expect(channelLog.any((c) => c.method == 'printText'), isTrue);
    });

    test('openCashDrawer invokes openDrawer on channel', () async {
      mockChannelResponse = true;
      final result = await adapter.openCashDrawer();

      expect(result.isSuccess, isTrue);
      expect(channelLog.any((c) => c.method == 'openDrawer'), isTrue);
    });

    test('printProductionBatchLabel sends raw bytes to channel', () async {
      mockChannelResponse = 'READY';
      final result = await adapter.printProductionBatchLabel(
        productName: 'Salsa Ranchera',
        batchCode: 'LOTE-20260827-001',
        quantity: 5,
        uom: 'lt',
        productionDate: DateTime(2026, 8, 27, 10, 0),
        expirationDate: DateTime(2026, 8, 29, 10, 0),
        operatorName: 'Chef Pedro',
      );

      expect(result.isSuccess, isTrue);
      expect(channelLog.any((c) => c.method == 'printRawBytes'), isTrue);
    });
  });
}
