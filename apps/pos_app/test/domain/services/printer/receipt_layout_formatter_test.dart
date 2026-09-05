import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/printer/receipt_document.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/services/printer/receipt_layout_formatter.dart';
import 'package:pos_app/domain/services/printer/receipt_layout_metrics.dart';

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

  group('Monetary Presentation & Formatting (formatMoney)', () {
    test('formats small amounts, hundreds, and thousands with two decimals and separators', () {
      expect(ReceiptLayoutFormatter.formatMoney(5), 'C\$ 5.00');
      expect(ReceiptLayoutFormatter.formatMoney(45.5), 'C\$ 45.50');
      expect(ReceiptLayoutFormatter.formatMoney(110), 'C\$ 110.00');
      expect(ReceiptLayoutFormatter.formatMoney(1234.5), 'C\$ 1,234.50');
      expect(ReceiptLayoutFormatter.formatMoney(99999.99), 'C\$ 99,999.99');
      expect(ReceiptLayoutFormatter.formatMoney(3.01, symbol: '\$'), '\$ 3.01');
      expect(ReceiptLayoutFormatter.formatMoney(150, includeSymbol: false), '150.00');
    });
  });

  group('Wrapping Engine & Hanging Indents', () {
    final f58 = ReceiptLayoutFormatter.format58mm();

    test('wrap splits long product name and applies 4-space hanging indent on continuation lines', () {
      const longName = '2 x Sandwich de pollo con vegetales salteados y aderezo especial';
      final wrapped = f58.wrap(longName, 32, '    ');

      expect(wrapped.length, greaterThan(1));
      // First line has no indent
      expect(wrapped[0].startsWith('2 x '), isTrue);
      expect(wrapped[0].length, lessThanOrEqualTo(32));

      // Subsequent lines start with 4-space indent
      for (int i = 1; i < wrapped.length; i++) {
        expect(wrapped[i].startsWith('    '), isTrue);
        expect(wrapped[i].length, lessThanOrEqualTo(32));
      }
    });

    test('wrap handles extremely long words without breaking line limits or truncating', () {
      const longWord = 'Supercalifragilisticoespialidososuperlargo';
      final wrapped = f58.wrap(longWord, 32);
      for (final line in wrapped) {
        expect(line.length, lessThanOrEqualTo(32));
      }
      expect(wrapped.join(''), contains(longWord));
    });
  });

  group('Key-Value Two-Tier Fallback (Cashier & Customer names)', () {
    final f58 = ReceiptLayoutFormatter.format58mm();
    final f80 = ReceiptLayoutFormatter.format80mm();

    test('short cashier name fits in a single line on 58mm', () {
      final lines = f58.formatKeyValue('Atendido por:', 'Juan');
      expect(lines.length, 1);
      expect(lines[0].length, 32);
      expect(lines[0].startsWith('Atendido por:'), isTrue);
      expect(lines[0].endsWith('Juan'), isTrue);
    });

    test('long cashier name "Founder Pilot Owner" drops to line 2 with indent on 58mm without truncation', () {
      final lines = f58.formatKeyValue('Atendido por:', 'Founder Pilot Owner');
      expect(lines.length, 2);
      expect(lines[0], 'Atendido por:');
      expect(lines[1], '  Founder Pilot Owner');
      expect(lines[1].length, lessThanOrEqualTo(32));
      // Verify nothing was truncated
      expect(lines.join(' '), contains('Founder Pilot Owner'));
    });

    test('long cashier name fits on a single line on 80mm', () {
      final lines = f80.formatKeyValue('Atendido por:', 'Founder Pilot Owner');
      expect(lines.length, 1);
      expect(lines[0].length, 48);
      expect(lines[0].endsWith('Founder Pilot Owner'), isTrue);
    });
  });

  group('58mm vs 80mm Products Layout Specifications', () {
    final f58 = ReceiptLayoutFormatter.format58mm();
    final f80 = ReceiptLayoutFormatter.format80mm();

    test('58mm: Short description produces exactly 2 tiers with right-aligned total', () {
      final rows = f58.formatItemRow(
        quantity: 1,
        name: 'Latte 12oz',
        unitPrice: 110.0,
        total: 110.0,
      );
      expect(rows.length, 2);
      expect(rows[0], '1 x Latte 12oz');
      expect(rows[1].length, 32);
      expect(rows[1].endsWith('C\$ 110.00'), isTrue);
    });

    test('58mm: Long description wraps with 4-space indent and right-aligned total', () {
      final rows = f58.formatItemRow(
        quantity: 2,
        name: 'Sandwich de pollo con vegetales',
        unitPrice: 125.0,
        total: 250.0,
      );
      expect(rows.length, 3); // 2 lines description + 1 line price/total
      expect(rows[0], '2 x Sandwich de pollo con');
      expect(rows[1], '    vegetales');
      expect(rows[2].length, 32);
      expect(rows[2].endsWith('C\$ 250.00'), isTrue);
    });

    test('58mm: Quantities with 2+ digits and decimal quantities format cleanly', () {
      final rows = f58.formatItemRow(
        quantity: 15.5,
        name: 'Carne Asada por Libra',
        unitPrice: 180.0,
        total: 2790.0,
      );
      expect(rows[0].startsWith('15.50 x Carne Asada'), isTrue);
      expect(rows.last.length, 32);
      expect(rows.last.endsWith('C\$ 2,790.00'), isTrue);
    });

    test('80mm: 4-column tabular grid with CANT(5), DESCRIPCION(22), P.UNIT(10), TOTAL(11)', () {
      final rows = f80.formatItemRow(
        quantity: 2,
        name: 'Croissant',
        unitPrice: 65.0,
        total: 130.0,
      );
      expect(rows.length, 1);
      expect(rows[0].length, 48);
      expect(rows[0].startsWith('2    Croissant'), isTrue);
      expect(rows[0].endsWith('C\$ 130.00'), isTrue);
    });

    test('80mm: Long description wraps inside description column without altering price columns', () {
      final rows = f80.formatItemRow(
        quantity: 1,
        name: 'Pizza Artesanal Cuatro Quesos con Borde Relleno',
        unitPrice: 380.0,
        total: 380.0,
      );
      expect(rows.length, greaterThan(1));
      for (final r in rows) {
        expect(r.length, 48);
      }
      // First line has quantity, first chunk of name, unit price and total
      expect(rows[0].endsWith('C\$ 380.00'), isTrue);
      // Second line leaves quantity and price columns empty
      expect(rows[1].startsWith('    '), isTrue);
    });

    test('80mm: Amounts in thousands (e.g. C\$ 1,234.50) format without breaking 48 columns', () {
      final rows = f80.formatItemRow(
        quantity: 10,
        name: 'Banquete Corporativo',
        unitPrice: 1250.0,
        total: 12500.0,
      );
      expect(rows[0].length, 48);
      expect(rows[0].endsWith('C\$ 12,500.00'), isTrue);
    });
  });

  group('Full Ticket Layout Verification (58mm & 80mm)', () {
    final sampleInvoice = Invoice(
      id: 'inv-uuid-full-test',
      number: '001-001-01-00000002',
      createdAt: DateTime(2026, 9, 4, 21, 41),
      userId: 'user-pilot',
      subtotal: 240.00,
      totalTax: 36.00,
      total: 276.00,
      terminalId: 'CAJA-ALACRITY-Q80',
      commercialRate: 36.50,
      bcnOfficialRate: 36.6241,
      totalUsd: 7.56,
      customerId: '001-150885-0002Y',
    );

    final sampleItems = [
      InvoiceItem(
        id: 'item-1',
        invoiceId: 'inv-uuid-full-test',
        productId: 'prod-1',
        productName: 'Latte 12oz',
        quantity: 1,
        unitPrice: 110.0,
        originalTaxRate: 0.15,
        appliedTaxRate: 0.15,
        taxAmount: 16.50,
        total: 126.50,
      ),
      InvoiceItem(
        id: 'item-2',
        invoiceId: 'inv-uuid-full-test',
        productId: 'prod-2',
        productName: 'Sandwich de pollo con vegetales salteados',
        quantity: 1,
        unitPrice: 130.0,
        originalTaxRate: 0.15,
        appliedTaxRate: 0.15,
        taxAmount: 19.50,
        total: 149.50,
        selectedModifiers: [
          const Modifier(id: 'mod-1', name: 'Queso Extra', extraPrice: 15.0),
        ],
        notes: 'Bien tostado',
      ),
    ];

    final samplePayments = [
      const Payment(
        id: 'pay-1',
        invoiceId: 'inv-uuid-full-test',
        method: PaymentMethod.cash,
        amount: 200.0,
        currency: 'NIO',
        changeGiven: 24.0,
        changeCurrency: 'NIO',
      ),
      const Payment(
        id: 'pay-2',
        invoiceId: 'inv-uuid-full-test',
        method: PaymentMethod.card,
        amount: 100.0,
        currency: 'NIO',
        cardBrand: 'BAC VISA',
        voucherCode: 'VCH-9876',
        last4: '1234',
      ),
    ];

    test('58mm full ticket: every line is strictly <= 32 characters and contains visual hierarchy', () {
      final f58 = ReceiptLayoutFormatter.format58mm();
      final ticket = f58.formatInvoiceText(
        sampleInvoice,
        items: sampleItems,
        payments: samplePayments,
        businessName: 'OMNIFOOD GASTRONOMIA SOHO',
        legalName: 'CORPORACION DE ALIMENTOS S.A.',
        ruc: 'J0310000004321',
        address: 'Plaza Mayor, Costado Este de la Rotonda Jean Paul Genie, Modulo 12',
        phone: '+505 2270-1234',
        cashierName: 'Founder Pilot Owner',
        customerName: 'Corporación Turística de Nicaragua',
        customerRuc: 'J0310000000001',
        taxRegime: TaxRegime.regimenGeneral,
        isTaxExempt: false,
        footerMessage: '*** GRACIAS POR SU COMPRA ***\nDOCUMENTO NO FISCAL PARA CONTROL INTERNO',
      );

      final lines = ticket.split('\n');
      for (final line in lines) {
        final clean = line.replaceAll('\r', '');
        expect(
          clean.length,
          lessThanOrEqualTo(32),
          reason: 'Line exceeds 32 chars in 58mm: "$clean" (len: ${clean.length})',
        );
      }

      // Assert visual hierarchy sections
      expect(ticket, contains('OMNIFOOD GASTRONOMIA SOHO'));
      expect(ticket, contains('RUC: J0310000004321'));
      expect(ticket, contains('FACTURA DE VENTA'));
      expect(ticket, contains('No. 001-001-01-00000002'));
      expect(ticket, contains('Atendido por:'));
      expect(ticket, contains('Founder Pilot Owner'));
      expect(ticket, contains('Cliente:'));
      expect(ticket, contains('Corporación Turística de'));
      expect(ticket, contains('SUBTOTAL:'));
      expect(ticket, contains('IVA (15%):'));
      expect(ticket, contains('TOTAL CORDOBAS:'));
      expect(ticket, contains('T/C USD:'));
      expect(ticket, contains('TOTAL USD:'));
      expect(ticket, contains('DETALLE DE PAGO'));
      expect(ticket, contains('Efectivo C\$:'));
      expect(ticket, contains('Cambio (NIO):'));
      expect(ticket, contains('BAC VISA:'));
      expect(ticket, contains('VCH-9876 (****1234)'));
      expect(ticket, contains('*** GRACIAS POR SU COMPRA ***'));
    });

    test('80mm full ticket: every line is strictly <= 48 characters and exploits 4-column layout', () {
      final f80 = ReceiptLayoutFormatter.format80mm();
      final ticket = f80.formatInvoiceText(
        sampleInvoice,
        items: sampleItems,
        payments: samplePayments,
        businessName: 'OMNIFOOD GASTRONOMIA SOHO',
        legalName: 'CORPORACION DE ALIMENTOS S.A.',
        ruc: 'J0310000004321',
        address: 'Plaza Mayor, Costado Este de la Rotonda Jean Paul Genie, Modulo 12',
        phone: '+505 2270-1234',
        cashierName: 'Founder Pilot Owner',
        customerName: 'Corporación Turística de Nicaragua',
        customerRuc: 'J0310000000001',
        taxRegime: TaxRegime.regimenGeneral,
        isTaxExempt: false,
      );

      final lines = ticket.split('\n');
      for (final line in lines) {
        final clean = line.replaceAll('\r', '');
        expect(
          clean.length,
          lessThanOrEqualTo(48),
          reason: 'Line exceeds 48 chars in 80mm: "$clean" (len: ${clean.length})',
        );
      }

      // Check header columns in 80mm
      expect(ticket, contains('CANT'));
      expect(ticket, contains('DESCRIPCION'));
      expect(ticket, contains('P.UNIT'));
      expect(ticket, contains('TOTAL'));
    });

    test('Never prints "Cliente: N/A" or "RUC: N/A" when customer info is absent', () {
      final f58 = ReceiptLayoutFormatter.format58mm();
      final anonymousInvoice = Invoice(
        id: 'inv-anon',
        number: '001-001-01-00000003',
        createdAt: DateTime.now(),
        userId: 'user-01',
        subtotal: 50.0,
        totalTax: 7.5,
        total: 57.5,
        terminalId: 'POS-01',
        customerId: 'N/A', // Placeholder from legacy DB
      );

      final ticket = f58.formatInvoiceText(
        anonymousInvoice,
        items: [],
        payments: [],
        customerName: null,
        customerRuc: 'N/A',
      );

      expect(ticket, isNot(contains('Cliente: N/A')));
      expect(ticket, isNot(contains('Cliente:')));
      expect(ticket, isNot(contains('RUC/Cedula: N/A')));
      expect(ticket, isNot(contains('RUC/Cedula:')));
    });

    test('Discounts are only shown when discountTotal > 0', () {
      final f58 = ReceiptLayoutFormatter.format58mm();
      final ticketWithoutDiscount = f58.formatInvoiceText(
        sampleInvoice,
        items: sampleItems,
        payments: samplePayments,
      );
      expect(ticketWithoutDiscount, isNot(contains('DESCUENTO:')));
    });

    test('USD FX section is omitted when commercialRate is 0', () {
      final f58 = ReceiptLayoutFormatter.format58mm();
      final noFxDoc = ReceiptDocument(
        businessName: 'OMNIFOOD NI',
        taxRegime: TaxRegime.regimenGeneral,
        documentTitle: 'FACTURA DE VENTA',
        documentNumber: '001-001-01-00000004',
        date: DateTime(2026, 9, 4, 12, 0),
        lines: const [],
        subtotal: 100.0,
        totalTax: 15.0,
        total: 115.0,
        commercialRate: 0.0, // Disabled FX
        totalUsd: 0.0,
      );

      final ticket = f58.formatReceiptDocumentText(noFxDoc);

      expect(ticket, isNot(contains('T/C USD:')));
      expect(ticket, isNot(contains('TOTAL USD:')));
    });

    test('prints representative sample tickets for audit and inspection', () {
      final f58 = ReceiptLayoutFormatter.format58mm();
      final f80 = ReceiptLayoutFormatter.format80mm();

      final doc = ReceiptDocument(
        businessName: 'SOHO TRIBUTO AL CAFÉ',
        legalName: 'OMNIFOOD NICARAGUA S.A.',
        ruc: 'J0310000001234',
        taxRegime: TaxRegime.regimenGeneral,
        address: 'Plaza Jean Paul Genie, Módulo 4',
        phone: '+505 2270-1234',
        documentTitle: 'FACTURA DE VENTA',
        documentNumber: '001-001-01-00000002',
        date: DateTime(2026, 9, 4, 21, 41),
        cashierName: 'Founder Pilot Owner',
        customerName: 'Corporación Turística de Nicaragua',
        customerRuc: 'J0310000009999',
        lines: [
          const ReceiptLine(
            quantity: 1,
            description: 'Latte 12oz',
            unitPrice: 110.0,
            taxableBase: 110.0,
            lineTotal: 110.0,
          ),
          const ReceiptLine(
            quantity: 2,
            description: 'Croissant Jamón y Queso Horneado Artesanal',
            unitPrice: 65.0,
            taxableBase: 130.0,
            lineTotal: 130.0,
            modifiers: ['Extra Queso (+C\$ 15.00)'],
          ),
        ],
        subtotal: 240.00,
        discountTotal: 10.00,
        totalTax: 34.50,
        total: 264.50,
        commercialRate: 36.50,
        totalUsd: 7.25,
        payments: const [
          ReceiptPayment(
            methodLabel: 'Efectivo C\$',
            currency: 'NIO',
            amount: 200.0,
            changeGiven: 10.50,
          ),
          ReceiptPayment(
            methodLabel: 'Tarjeta (BAC)',
            currency: 'NIO',
            amount: 75.0,
            reference: 'VCH-9876 (****4321)',
          ),
        ],
        footerMessage: '*** GRACIAS POR SU COMPRA ***',
      );

      final ticket58 = f58.formatReceiptDocumentText(doc);
      final ticket80 = f80.formatReceiptDocumentText(doc);

      print('--- OUTPUT 58MM ---');
      print(ticket58);
      print('--- OUTPUT 80MM ---');
      print(ticket80);

      expect(ticket58, isNotEmpty);
      expect(ticket80, isNotEmpty);
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
      // Cuota Fija shows SUBTOTAL and TOTAL CORDOBAS, but never IVA (15%) or VENTA EXENTA
      expect(ticket, contains('SUBTOTAL:'));
      expect(ticket, isNot(contains('IVA (15%):')));
      expect(ticket, isNot(contains('VENTA EXENTA')));
      expect(ticket, contains('TOTAL CORDOBAS:'));
      expect(ticket, contains('CONTRIBUYENTE DE CUOTA FIJA'));
      expect(ticket, contains('NO RECAUDA IVA'));
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
      expect(ticket, contains('TOTAL CORDOBAS:'));
    });
  });
}
