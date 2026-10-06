import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/adapters/printer/mock_printer_adapter.dart';
import 'package:pos_app/domain/models/config/printer_config.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/ports/printer_port.dart';
import 'package:pos_app/domain/services/printer/printer_resolver.dart';

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
  group('PrinterResolver.resolve', () {
    test('mock resolves to the shared mock adapter (unchanged)', () {
      final port = PrinterResolver.resolve(
        const PrinterConfig(driverType: PrinterDriverType.mock),
      );
      expect(port, same(PrinterResolver.sharedMock));
    });

    test('sunmiV2s resolves to the shared Sunmi adapter (unchanged)', () {
      final port = PrinterResolver.resolve(
        const PrinterConfig(driverType: PrinterDriverType.sunmiV2s),
      );
      expect(port, same(PrinterResolver.sharedSunmi));
    });

    test('iPosQ80 resolves to the shared iPos adapter (unchanged)', () {
      final port = PrinterResolver.resolve(
        const PrinterConfig(driverType: PrinterDriverType.iPosQ80),
      );
      expect(port, same(PrinterResolver.sharedIPos));
    });

    test(
        'escPosNetwork never resolves to the mock that reports false successes',
        () {
      final port = PrinterResolver.resolve(
        const PrinterConfig(driverType: PrinterDriverType.escPosNetwork),
      );
      expect(port, isNot(same(PrinterResolver.sharedMock)));
      expect(port, isNot(isA<MockPrinterAdapter>()));
    });

    test(
        'escPosNetwork print fails with the Spanish reason and never a success',
        () async {
      final port = PrinterResolver.resolve(
        const PrinterConfig(driverType: PrinterDriverType.escPosNetwork),
      );
      final result = await port.printInvoice(
        _sampleInvoice(),
        items: _sampleItems(),
        payments: _samplePayments(),
        taxRegime: TaxRegime.regimenGeneral,
      );
      expect(result.isSuccess, isFalse);
      expect(result.status, isNot(PrinterStatus.ready));
      expect(
        result.message,
        contains('no está disponible'),
      );
      // The reason must be actionable: it names the real drivers.
      expect(result.message, contains('Sunmi V2s'));
      expect(result.message, contains('Q80'));
    });

    test('escPosNetwork status check never reports ready', () async {
      final port = PrinterResolver.resolve(
        const PrinterConfig(driverType: PrinterDriverType.escPosNetwork),
      );
      expect(await port.checkStatus(), isNot(PrinterStatus.ready));
    });
  });
}
