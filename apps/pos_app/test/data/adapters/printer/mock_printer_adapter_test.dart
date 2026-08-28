import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/adapters/printer/mock_printer_adapter.dart';
import 'package:pos_app/domain/models/sales/cashier_session.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/ports/printer_port.dart';

void main() {
  late MockPrinterAdapter adapter;

  setUp(() {
    adapter = MockPrinterAdapter();
  });

  group('MockPrinterAdapter Tests', () {
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
        productId: 'p-1',
        productName: 'Café Americano',
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
        id: 'pay-1',
        invoiceId: 'inv-1',
        method: PaymentMethod.cash,
        amount: 115,
      ),
    ];

    test('prints invoice successfully and records history when ready', () async {
      final result = await adapter.printInvoice(
        testInvoice,
        items: testItems,
        payments: testPayments,
        businessName: 'OmniFood Test',
      );

      expect(result.isSuccess, isTrue);
      expect(result.status, PrinterStatus.ready);
      expect(adapter.lastPrintedText, contains('OmniFood Test'));
      expect(adapter.lastPrintedBytes, isNotNull);
      expect(adapter.printHistory.length, 1);
    });

    test('returns failure and does not crash when printer is out of paper', () async {
      adapter.currentStatus = PrinterStatus.outOfPaper;

      final result = await adapter.printInvoice(
        testInvoice,
        items: testItems,
        payments: testPayments,
      );

      expect(result.isSuccess, isFalse);
      expect(result.status, PrinterStatus.outOfPaper);
      expect(adapter.printHistory.length, 1);
    });

    test('prints kitchen order successfully with buzzer number', () async {
      final result = await adapter.printKitchenOrder(
        ticketId: 'TK-100',
        orderTitle: 'Orden #100',
        cashierName: 'Maria',
        timestamp: DateTime(2026, 8, 26, 12, 0),
        items: testItems,
        buzzerNumber: 5,
      );

      expect(result.isSuccess, isTrue);
      expect(adapter.lastPrintedText, contains('BUZZER / PAGER #5'));
    });

    test('prints Corte X and Corte Z audits', () async {
      final session = CashierSession(
        id: 's-1',
        userId: 'u-1',
        openedAt: DateTime(2026, 8, 26, 8, 0),
        openingBalanceNio: 500,
      );

      final corteXResult = await adapter.printCorteX(
        session,
        cashierName: 'Juan',
        totalsByMethod: {PaymentMethod.cash: 1000},
      );
      expect(corteXResult.isSuccess, isTrue);
      expect(adapter.lastPrintedText, contains('CORTE X (PARCIAL)'));

      final corteZResult = await adapter.printCorteZ(
        session,
        cashierName: 'Juan',
        totalsByMethod: {PaymentMethod.cash: 1000},
        zSequence: 1,
      );
      expect(corteZResult.isSuccess, isTrue);
      expect(adapter.lastPrintedText, contains('CORTE Z (CIERRE DE CAJA)'));
    });

    test('openCashDrawer triggers pulse and increments counter', () async {
      final result = await adapter.openCashDrawer();
      expect(result.isSuccess, isTrue);
      expect(adapter.cashDrawerKickCount, 1);
    });

    test('prints production batch label successfully', () async {
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
      expect(adapter.lastPrintedText, contains('ETIQUETA DE PRE-ELABORACION'));
      expect(adapter.lastPrintedText, contains('LOTE-20260827-001'));
      expect(adapter.lastPrintedText, contains('Chef Pedro'));
      expect(adapter.lastPrintedBytes, isNotNull);
    });
  });
}
