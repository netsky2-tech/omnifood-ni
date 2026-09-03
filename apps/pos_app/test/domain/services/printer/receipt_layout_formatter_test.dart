import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/services/printer/receipt_layout_formatter.dart';

void main() {
  group('ReceiptLayoutFormatter Helpers & Dimensions', () {
    test('58mm mode sets maxCols to 32 and maxImageWidth to 384', () {
      final formatter = ReceiptLayoutFormatter.format58mm();
      expect(formatter.maxCols, 32);
      expect(formatter.maxImageWidth, 384);
      expect(formatter.maxImageHeight, 160);
    });

    test('80mm mode sets maxCols to 48 and maxImageWidth to 576', () {
      final formatter = ReceiptLayoutFormatter.format80mm();
      expect(formatter.maxCols, 48);
      expect(formatter.maxImageWidth, 576);
      expect(formatter.maxImageHeight, 160);
    });

    test('drawLine() generates exact length line', () {
      final f58 = ReceiptLayoutFormatter.format58mm();
      expect(f58.drawLine('=').length, 32);
      expect(f58.drawLine('-').length, 32);

      final f80 = ReceiptLayoutFormatter.format80mm();
      expect(f80.drawLine('=').length, 48);
      expect(f80.drawLine('-').length, 48);
    });

    test('formatTwoColumns() aligns amounts strictly to the right', () {
      final f58 = ReceiptLayoutFormatter.format58mm();
      final line = f58.formatTwoColumns('TOTAL CORDOBAS:', 'C\$ 345.00');
      expect(line.length, 32);
      expect(line.endsWith('C\$ 345.00'), isTrue);
      expect(line.startsWith('TOTAL CORDOBAS:'), isTrue);
    });

    test('formatItemRow() 58mm formats 2 lines with right alignment', () {
      final f58 = ReceiptLayoutFormatter.format58mm();
      final rows = f58.formatItemRow(
        quantity: 2,
        name: 'Cappuccino Vainilla Grande',
        unitPrice: 75.0,
        total: 150.0,
      );
      expect(rows.length, 2);
      expect(rows[0], '2 x Cappuccino Vainilla Grande');
      expect(rows[1].length, 32);
      expect(rows[1].endsWith('C\$ 150.00'), isTrue);
    });

    test('formatItemRow() 80mm formats single grid row with 48 columns', () {
      final f80 = ReceiptLayoutFormatter.format80mm();
      final rows = f80.formatItemRow(
        quantity: 1,
        name: 'Hamburguesa Doble',
        unitPrice: 200.0,
        total: 200.0,
      );
      expect(rows.length, 1);
      expect(rows[0].length, 48);
      expect(rows[0].endsWith('C\$ 200.00'), isTrue);
    });
  });

  group('Nicaraguan Fiscal Compliance (Ley 822 / DGI)', () {
    final sampleInvoice = Invoice(
      id: 'inv-uuid-123456789',
      number: '001-001-01-00000045',
      createdAt: DateTime(2026, 8, 31, 10, 15),
      userId: 'user-01',
      subtotal: 100.00,
      totalTax: 15.00,
      total: 115.00,
      terminalId: 'CAJA-PRINCIPAL-01',
      commercialRate: 36.50,
      bcnOfficialRate: 36.6241,
    );

    final sampleItems = [
      InvoiceItem(
        id: 'item-1',
        invoiceId: 'inv-uuid-123456789',
        productId: 'prod-1',
        productName: 'Café Americano',
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
        id: 'pay-1',
        invoiceId: 'inv-uuid-123456789',
        method: PaymentMethod.cash,
        amount: 115.0,
        currency: 'NIO',
      ),
    ];

    test('CUOTA FIJA: Title is COMPROBANTE DE VENTA, shows REGIMEN: CUOTA FIJA and NO Subtotal/IVA', () {
      final f58 = ReceiptLayoutFormatter.format58mm();
      final ticket = f58.formatInvoiceText(
        sampleInvoice,
        items: sampleItems,
        payments: samplePayments,
        businessName: 'PUPUSERIA EL CHALATECO',
        legalName: 'Santos Morales Rizo',
        ruc: '0012508850001U',
        taxRegime: TaxRegime.cuotaFija,
        isTaxExempt: false,
      );

      expect(ticket, contains('COMPROBANTE DE VENTA'));
      expect(ticket, contains('REGIMEN: CUOTA FIJA'));
      expect(ticket, contains('PUPUSERIA EL CHALATECO'));
      expect(ticket, contains('Santos Morales Rizo'));
      // Prohibition: Never disclose Subtotal or IVA (15%)
      expect(ticket, isNot(contains('SUBTOTAL:')));
      expect(ticket, isNot(contains('IVA (15%):')));
      expect(ticket, contains('TOTAL CORDOBAS:'));
    });

    test('REGIMEN GENERAL (Standard): Title is FACTURA DE VENTA, shows REGIMEN: GENERAL, Subtotal & IVA 15%', () {
      final f58 = ReceiptLayoutFormatter.format58mm();
      final ticket = f58.formatInvoiceText(
        sampleInvoice,
        items: sampleItems,
        payments: samplePayments,
        businessName: 'OMNIFOOD RESTAURANTE',
        ruc: 'J0310000000001',
        taxRegime: TaxRegime.regimenGeneral,
        isTaxExempt: false,
      );

      expect(ticket, contains('FACTURA DE VENTA'));
      expect(ticket, contains('REGIMEN: GENERAL'));
      expect(ticket, contains('SUBTOTAL:'));
      expect(ticket, contains('IVA (15%):'));
      expect(ticket, contains('TOTAL CORDOBAS:'));
      expect(ticket, isNot(contains('VENTA EXENTA')));
    });

    test('REGIMEN GENERAL (Tax Exempt / Feria Sin IVA): Shows VENTA EXENTA (IVA 0%) & Policy Disclaimer', () {
      final f58 = ReceiptLayoutFormatter.format58mm();
      final ticket = f58.formatInvoiceText(
        sampleInvoice,
        items: sampleItems,
        payments: samplePayments,
        businessName: 'OMNIFOOD RESTAURANTE',
        ruc: 'J0310000000001',
        taxRegime: TaxRegime.regimenGeneral,
        isTaxExempt: true,
      );

      expect(ticket, contains('FACTURA DE VENTA'));
      expect(ticket, contains('REGIMEN: GENERAL'));
      expect(ticket, contains('SUBTOTAL:'));
      expect(ticket, contains('VENTA EXENTA (IVA 0%):'));
      expect(ticket, contains('VENTA EXENTA DE IVA'));
      expect(ticket, contains('POLITICA TEMPORAL'));
    });
  });
}
