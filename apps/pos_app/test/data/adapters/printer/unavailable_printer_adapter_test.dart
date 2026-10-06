import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/adapters/printer/unavailable_printer_adapter.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'package:pos_app/domain/models/printer/receipt_document.dart';
import 'package:pos_app/domain/models/sales/cashier_session.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/ports/printer_port.dart';

/// The exact operator-facing reason the network driver is unavailable. It
/// must name the real drivers the operator can actually pick instead.
const String expectedUnavailableMessage =
    'El controlador de impresora de red (ESC/POS) no está disponible en esta '
    'versión. Elegí Sunmi V2s o Q80 / iPos.';

Invoice _sampleInvoice() => Invoice(
      id: 'inv-1',
      number: '001-001-01-00000001',
      createdAt: DateTime(2026, 7, 13),
      userId: 'cashier-1',
      subtotal: 100,
      totalTax: 15,
      total: 115,
      terminalId: 'TEST-POS',
    );

List<InvoiceItem> _sampleItems() => [
      InvoiceItem(
        id: 'item-1',
        invoiceId: 'inv-1',
        productId: 'prod-1',
        productName: 'Combo 1',
        quantity: 1,
        unitPrice: 100,
        originalTaxRate: 15,
        appliedTaxRate: 15,
        taxAmount: 15,
        total: 115,
      ),
    ];

List<Payment> _samplePayments() => [
      Payment(
        id: 'pay-1',
        invoiceId: 'inv-1',
        method: PaymentMethod.cash,
        amount: 115,
      ),
    ];

void main() {
  const adapter = UnavailablePrinterAdapter();

  group('UnavailablePrinterAdapter', () {
    test('checkStatus never reports ready', () async {
      final status = await adapter.checkStatus();
      expect(status, isNot(PrinterStatus.ready));
    });

    test('printInvoice fails with the Spanish reason and never a success',
        () async {
      final result = await adapter.printInvoice(
        _sampleInvoice(),
        items: _sampleItems(),
        payments: _samplePayments(),
        taxRegime: TaxRegime.regimenGeneral,
      );
      expect(result.isSuccess, isFalse);
      expect(result.status, PrinterStatus.error);
      expect(result.message, expectedUnavailableMessage);
    });

    test('printReceiptDocument fails with the Spanish reason', () async {
      final result = await adapter.printReceiptDocument(
        ReceiptDocument.fromInvoice(
          _sampleInvoice(),
          items: _sampleItems(),
          payments: _samplePayments(),
          taxRegime: TaxRegime.regimenGeneral,
        ),
      );
      expect(result.isSuccess, isFalse);
      expect(result.status, PrinterStatus.error);
      expect(result.message, expectedUnavailableMessage);
    });

    test('printKitchenOrder fails with the Spanish reason', () async {
      final result = await adapter.printKitchenOrder(
        ticketId: 'ticket-1',
        orderTitle: 'Orden #1',
        cashierName: 'Cajero',
        timestamp: DateTime(2026, 7, 13),
        items: _sampleItems(),
      );
      expect(result.isSuccess, isFalse);
      expect(result.status, PrinterStatus.error);
      expect(result.message, expectedUnavailableMessage);
    });

    test('printCorteX fails with the Spanish reason', () async {
      final result = await adapter.printCorteX(
        CashierSession(
          id: 'shift-1',
          userId: 'cashier-1',
          terminalId: 'TERM-01',
          openedAt: DateTime(2026, 7, 13),
          isClosed: false,
        ),
        cashierName: 'Cajero',
        totalsByMethod: {PaymentMethod.cash: 115},
      );
      expect(result.isSuccess, isFalse);
      expect(result.status, PrinterStatus.error);
      expect(result.message, expectedUnavailableMessage);
    });

    test('printCorteZ fails with the Spanish reason', () async {
      final result = await adapter.printCorteZ(
        CashierSession(
          id: 'shift-1',
          userId: 'cashier-1',
          terminalId: 'TERM-01',
          openedAt: DateTime(2026, 7, 13),
          isClosed: false,
        ),
        cashierName: 'Cajero',
        totalsByMethod: {PaymentMethod.cash: 115},
      );
      expect(result.isSuccess, isFalse);
      expect(result.status, PrinterStatus.error);
      expect(result.message, expectedUnavailableMessage);
    });

    test('printProductionBatchLabel fails with the Spanish reason', () async {
      final result = await adapter.printProductionBatchLabel(
        productName: 'Combo 1',
        batchCode: 'BATCH-1',
        quantity: 2,
        uom: 'UND',
        productionDate: DateTime(2026, 7, 13),
        expirationDate: DateTime(2026, 7, 14),
      );
      expect(result.isSuccess, isFalse);
      expect(result.status, PrinterStatus.error);
      expect(result.message, expectedUnavailableMessage);
    });

    test('printRawEscPos fails with the Spanish reason', () async {
      final result = await adapter.printRawEscPos([0x1B, 0x40]);
      expect(result.isSuccess, isFalse);
      expect(result.status, PrinterStatus.error);
      expect(result.message, expectedUnavailableMessage);
    });

    test('openCashDrawer fails with the Spanish reason', () async {
      final result = await adapter.openCashDrawer();
      expect(result.isSuccess, isFalse);
      expect(result.status, PrinterStatus.error);
      expect(result.message, expectedUnavailableMessage);
    });
  });
}
