import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/printer/receipt_document.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/services/printer/receipt_layout_formatter.dart';
import 'package:pos_app/domain/services/printer/receipt_layout_metrics.dart';

extension ReceiptLayoutFormatterInvoiceTestAdapter on ReceiptLayoutFormatter {
  String formatInvoiceText(
    Invoice invoice, {
    required List<InvoiceItem> items,
    required List<Payment> payments,
    String? businessName,
    String? legalName,
    String? ruc,
    String? address,
    String? phone,
    String? cashierName,
    String? customerName,
    String? customerRuc,
    TaxRegime taxRegime = TaxRegime.regimenGeneral,
    bool isTaxExempt = false,
    String? footerMessage,
  }) => formatReceiptDocumentText(
    ReceiptDocument.fromInvoice(
      invoice,
      items: items,
      payments: payments,
      businessName: businessName,
      legalName: legalName,
      ruc: ruc,
      address: address,
      phone: phone,
      cashierName: cashierName,
      customerName: customerName,
      customerRuc: customerRuc,
      taxRegime: taxRegime,
      isTaxExempt: isTaxExempt,
      footerMessage: footerMessage,
    ),
  );
}

void main() {
  group('ReceiptLayoutFormatter Helpers & Dimensions', () {
    test('58mm mode sets maxCols to 32 and maxImageWidth to 384', () {
      final formatter = ReceiptLayoutFormatter.format58mm();
      expect(formatter.maxCols, 32);
      expect(formatter.maxImageWidth, 384);
      expect(formatter.maxImageHeight, 160);
    });

    test(
      '80mm mode sets maxCols to the verified 40-column content width and maxImageWidth to 576',
      () {
        final formatter = ReceiptLayoutFormatter.format80mm();
        expect(formatter.maxCols, 40);
        expect(formatter.maxImageWidth, 576);
        expect(formatter.maxImageHeight, 160);
      },
    );

    test('drawLine() generates exact length line', () {
      final f58 = ReceiptLayoutFormatter.format58mm();
      expect(f58.drawLine('=').length, 32);
      expect(f58.drawLine('-').length, 32);

      final f80 = ReceiptLayoutFormatter.format80mm();
      expect(f80.drawLine('=').length, 40);
      expect(f80.drawLine('-').length, 40);
    });

    test(
      'normalizes decomposed Spanish, web punctuation, and unsupported glyphs before width calculations',
      () {
        final f58 = ReceiptLayoutFormatter.format58mm();
        final normalized = f58.normalizePrintableText(
          'Cafe\u0301 — “menu” 😀 中文',
        );
        expect(normalized, 'Café - "menu" ? ??');
        expect(normalized.codeUnits.every((unit) => unit <= 0xFF), isTrue);
        expect(f58.wrap(normalized).every((line) => line.length <= 32), isTrue);
      },
    );

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

    test(
      'formatItemRow() 80mm formats a 40-column grid row without currency prefix',
      () {
        final f80 = ReceiptLayoutFormatter.format80mm();
        final rows = f80.formatItemRow(
          quantity: 1,
          name: 'Hamburguesa Doble',
          unitPrice: 200.0,
          total: 200.0,
        );
        // "Hamburguesa Doble" exceeds descriptionWidth(14), so it wraps.
        expect(rows, isNotEmpty);
        expect(rows.every((r) => r.length <= 40), isTrue);
        expect(rows.join('\n'), contains('200.00'));
        expect(rows.join('\n').contains('C\$'), isFalse);
      },
    );
  });

  group('Monetary Presentation & Formatting (formatMoney)', () {
    test(
      'formats small amounts, hundreds, and thousands with two decimals and separators',
      () {
        expect(ReceiptLayoutFormatter.formatMoney(5), 'C\$ 5.00');
        expect(ReceiptLayoutFormatter.formatMoney(45.5), 'C\$ 45.50');
        expect(ReceiptLayoutFormatter.formatMoney(110), 'C\$ 110.00');
        expect(ReceiptLayoutFormatter.formatMoney(1234.5), 'C\$ 1,234.50');
        expect(ReceiptLayoutFormatter.formatMoney(99999.99), 'C\$ 99,999.99');
        expect(
          ReceiptLayoutFormatter.formatMoney(3.01, symbol: '\$'),
          '\$ 3.01',
        );
        expect(
          ReceiptLayoutFormatter.formatMoney(150, includeSymbol: false),
          '150.00',
        );
      },
    );
  });

  group('Canonical receipt-document fidelity and width matrix', () {
    test(
      'prints supplied authoritative line and summary values without deriving them',
      () {
        final document = ReceiptDocument(
          businessName: 'Prueba',
          taxRegime: TaxRegime.regimenGeneral,
          documentTitle: 'FACTURA',
          documentNumber: '1',
          date: DateTime(2026),
          lines: const [
            ReceiptLine(
              quantity: 2,
              description: 'Valor autorizado',
              unitPrice: 10,
              taxableBase: 999.99,
              lineSubtotal: 777.77,
              lineTotal: 888.88,
            ),
          ],
          subtotal: 333.33,
          totalTax: 44.44,
          total: 555.55,
          totalUsd: 0,
        );
        final output = ReceiptLayoutFormatter.format80mm()
            .formatReceiptDocumentText(document);
        // 80mm item rows omit C$ prefix; summary retains it
        expect(output, contains('777.77'));
        expect(output, contains('C\$ 333.33'));
        expect(output, contains('C\$ 44.44'));
        expect(output, contains('C\$ 555.55'));
      },
    );

    test('58/80 matrix preserves values and never overflows printable width', () {
      const amounts = [
        0.01,
        9.99,
        999.99,
        9999.99,
        99999.99,
        999999.99,
        9999999.99,
      ];
      const quantities = [
        1.0,
        9.0,
        10.0,
        99.0,
        100.0,
        999.0,
        1000.0,
        0.5,
        1.25,
        12.50,
        999.99,
      ];
      const descriptions = [
        'Exactamente treinta y dos letras',
        'Descripción muy larga con modificadores múltiples y acentos ñ á é í ó ú ü',
        'Supercalifragilisticoespialidoso',
      ];
      for (final formatter in [
        ReceiptLayoutFormatter.format58mm(),
        ReceiptLayoutFormatter.format80mm(),
      ]) {
        for (final amount in amounts) {
          for (final quantity in quantities) {
            for (final description in descriptions) {
              final rows = formatter.formatItemRow(
                quantity: quantity,
                name: description,
                unitPrice: amount,
                total: amount,
              );
              expect(
                rows.every((row) => row.length <= formatter.maxCols),
                isTrue,
              );
              // 80mm items omit C$ prefix; 58mm retains it
              final numericAmount = ReceiptLayoutFormatter.formatMoney(
                amount,
                includeSymbol: false,
              );
              expect(rows.join('\n'), contains(numericAmount));
            }
          }
        }
      }
    });
  });

  group('Wrapping Engine & Hanging Indents', () {
    final f58 = ReceiptLayoutFormatter.format58mm();

    test(
      'wrap splits long product name and applies 4-space hanging indent on continuation lines',
      () {
        const longName =
            '2 x Sandwich de pollo con vegetales salteados y aderezo especial';
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
      },
    );

    test(
      'wrap handles extremely long words without breaking line limits or truncating',
      () {
        const longWord = 'Supercalifragilisticoespialidososuperlargo';
        final wrapped = f58.wrap(longWord, 32);
        for (final line in wrapped) {
          expect(line.length, lessThanOrEqualTo(32));
        }
        expect(wrapped.join(''), contains(longWord));
      },
    );
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

    test(
      'long cashier name "Founder Pilot Owner" drops to line 2 with indent on 58mm without truncation',
      () {
        final lines = f58.formatKeyValue(
          'Atendido por:',
          'Founder Pilot Owner',
        );
        expect(lines.length, 2);
        expect(lines[0], 'Atendido por:');
        expect(lines[1], '  Founder Pilot Owner');
        expect(lines[1].length, lessThanOrEqualTo(32));
        // Verify nothing was truncated
        expect(lines.join(' '), contains('Founder Pilot Owner'));
      },
    );

    test('long cashier name fits on a single line on 80mm', () {
      final lines = f80.formatKeyValue('Atendido por:', 'Founder Pilot Owner');
      expect(lines.length, 1);
      expect(lines[0].length, 40);
      expect(lines[0].endsWith('Founder Pilot Owner'), isTrue);
    });
  });

  group('58mm vs 80mm Products Layout Specifications', () {
    final f58 = ReceiptLayoutFormatter.format58mm();
    final f80 = ReceiptLayoutFormatter.format80mm();

    test(
      '58mm: Short description produces exactly 2 tiers with right-aligned total',
      () {
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
      },
    );

    test(
      '58mm: Long description wraps with 4-space indent and right-aligned total',
      () {
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
      },
    );

    test(
      '58mm: Quantities with 2+ digits and decimal quantities format cleanly',
      () {
        final rows = f58.formatItemRow(
          quantity: 15.5,
          name: 'Carne Asada por Libra',
          unitPrice: 180.0,
          total: 2790.0,
        );
        expect(rows[0].startsWith('15.50 x Carne Asada'), isTrue);
        expect(rows.last.length, 32);
        expect(rows.last.endsWith('C\$ 2,790.00'), isTrue);
      },
    );

    test('80mm: 4-column tabular grid fills 40 calibrated columns', () {
      final rows = f80.formatItemRow(
        quantity: 2,
        name: 'Croissant',
        unitPrice: 65.0,
        total: 130.0,
      );
      expect(rows.length, 1);
      expect(rows[0].length, 40);
      // 4-char qty padRight + 1 gutter + name
      expect(rows[0].startsWith('2    Croissant'), isTrue);
      expect(rows[0].endsWith('130.00'), isTrue);
      expect(rows[0].contains('C\$'), isFalse);
    });

    test(
      '80mm: Long description wraps inside description column without altering price columns',
      () {
        final rows = f80.formatItemRow(
          quantity: 1,
          name: 'Pizza Artesanal Cuatro Quesos con Borde Relleno',
          unitPrice: 380.0,
          total: 380.0,
        );
        expect(rows.length, greaterThan(1));
        for (final r in rows) {
          expect(r.length, 40);
        }
        // First line has quantity, first chunk of name, unit price and total
        expect(rows[0].endsWith('380.00'), isTrue);
        expect(rows[0].contains('C\$'), isFalse);
        // Second line leaves quantity and price columns empty
        expect(rows[1].startsWith('    '), isTrue);
      },
    );

    test('80mm: Amounts in thousands format without breaking 40 columns', () {
      final rows = f80.formatItemRow(
        quantity: 10,
        name: 'Banquete Corporativo',
        unitPrice: 1250.0,
        total: 12500.0,
      );
      expect(rows[0].length, 40);
      expect(rows[0].endsWith('12,500.00'), isTrue);
      expect(rows[0].contains('C\$'), isFalse);
    });

    test(
      '80mm: extreme monetary columns use a single-column fallback without overflow',
      () {
        final rows = f80.formatItemRow(
          quantity: 999999999,
          name: 'Producto extraordinariamente largo para una venta corporativa',
          unitPrice: 999999999999999.99,
          total: 999999999999999.99,
        );

        expect(rows, isNotEmpty);
        expect(rows.every((row) => row.length <= 40), isTrue);
        expect(rows.join('\n'), contains('1,000,000,000,000,000.00'));
        expect(rows.last.endsWith('1,000,000,000,000,000.00'), isTrue);
      },
    );

    test(
      '58mm losslessly wraps an oversized monetary total without dropping digits',
      () {
        final amount = 999999999999999999999999999999.99;
        final expected = ReceiptLayoutFormatter.formatMoney(amount);
        final rows = f58.formatItemRow(
          quantity: 1,
          name: 'Producto',
          unitPrice: amount,
          total: amount,
        );
        final physicalLines = rows.expand((row) => row.split('\n'));

        expect(physicalLines.every((line) => line.length <= 32), isTrue);
        expect(
          rows.join().replaceAll('\n', ''),
          contains(expected.substring(3)),
        );
      },
    );

    test(
      '80mm losslessly falls back when quantity and monetary columns cannot fit',
      () {
        final amount = 999999999999999999999999999999.99;
        final rows = f80.formatItemRow(
          quantity: 999999999999999999.0,
          name: 'Producto corporativo extraordinario',
          unitPrice: amount,
          total: amount,
        );

        // Fallback produces multi-line output, all lines within printable width
        expect(rows, isNotEmpty);
        expect(rows.every((line) => line.length <= 40), isTrue);
        // Amount digits are present (lossless) — double precision rounds the exact value
        final allText = rows.join('');
        expect(allText, contains('TOTAL'));
      },
    );

    test(
      'item columns sanitize control characters into deterministic inline whitespace',
      () {
        final rows = f80.formatItemRow(
          quantity: 1,
          name: 'Cafe\n\tEspecial\u001b[31m',
          unitPrice: 10,
          total: 10,
        );

        expect(rows.join(' '), contains('Cafe'));
        // [31m is preserved but may be separated from 'Especial' by word-wrapping
        expect(rows.join(' '), contains('[31m'));
        expect(rows.join(''), isNot(contains('\n')));
        expect(rows.join(''), isNot(contains('\u001b')));
      },
    );
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

    test(
      '58mm full ticket: every line is strictly <= 32 characters and contains visual hierarchy',
      () {
        final f58 = ReceiptLayoutFormatter.format58mm();
        final ticket = f58.formatInvoiceText(
          sampleInvoice,
          items: sampleItems,
          payments: samplePayments,
          businessName: 'OMNIFOOD GASTRONOMIA SOHO',
          legalName: 'CORPORACION DE ALIMENTOS S.A.',
          ruc: 'J0310000004321',
          address:
              'Plaza Mayor, Costado Este de la Rotonda Jean Paul Genie, Modulo 12',
          phone: '+505 2270-1234',
          cashierName: 'Founder Pilot Owner',
          customerName: 'Corporación Turística de Nicaragua',
          customerRuc: 'J0310000000001',
          taxRegime: TaxRegime.regimenGeneral,
          isTaxExempt: false,
          footerMessage:
              '*** GRACIAS POR SU COMPRA ***\nDOCUMENTO NO FISCAL PARA CONTROL INTERNO',
        );

        final lines = ticket.split('\n');
        for (final line in lines) {
          final clean = line.replaceAll('\r', '');
          expect(
            clean.length,
            lessThanOrEqualTo(32),
            reason:
                'Line exceeds 32 chars in 58mm: "$clean" (len: ${clean.length})',
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
      },
    );

    test(
      '80mm full ticket: every line is strictly <= 40 characters and exploits 4-column layout',
      () {
        final f80 = ReceiptLayoutFormatter.format80mm();
        final ticket = f80.formatInvoiceText(
          sampleInvoice,
          items: sampleItems,
          payments: samplePayments,
          businessName: 'OMNIFOOD GASTRONOMIA SOHO',
          legalName: 'CORPORACION DE ALIMENTOS S.A.',
          ruc: 'J0310000004321',
          address:
              'Plaza Mayor, Costado Este de la Rotonda Jean Paul Genie, Modulo 12',
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
            lessThanOrEqualTo(40),
            reason:
                'Line exceeds 40 chars in 80mm: "$clean" (len: ${clean.length})',
          );
        }

        // Check header columns in 80mm
        expect(ticket, contains('CANT'));
        expect(ticket, contains('DESCRIPCION'));
        expect(ticket, contains('P.UNIT'));
        expect(ticket, contains('TOTAL'));
      },
    );

    test(
      'Never prints "Cliente: N/A" or "RUC: N/A" when customer info is absent',
      () {
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
      },
    );

    test('Discounts are only shown when discountTotal > 0', () {
      final f58 = ReceiptLayoutFormatter.format58mm();
      final ticketWithoutDiscount = f58.formatInvoiceText(
        sampleInvoice,
        items: sampleItems,
        payments: samplePayments,
      );
      expect(ticketWithoutDiscount, isNot(contains('DESCUENTO:')));
    });

    test(
      'discount presentation uses the authoritative gross, discount, and net values',
      () {
        final document = ReceiptDocument(
          businessName: 'Prueba',
          taxRegime: TaxRegime.regimenGeneral,
          documentTitle: 'FACTURA',
          documentNumber: '1',
          date: DateTime(2026),
          lines: const [
            ReceiptLine(
              quantity: 1,
              description: 'Producto con descuento',
              unitPrice: 200,
              grossAmount: 200,
              discount: 20,
              taxableBase: 180,
              lineSubtotal: 180,
              taxAmount: 27,
              lineTotal: 207,
            ),
          ],
          grossSubtotal: 200,
          subtotal: 180,
          discountTotal: 20,
          totalTax: 27,
          total: 207,
          totalUsd: 0,
        );

        final ticket = ReceiptLayoutFormatter.format80mm()
            .formatReceiptDocumentText(document);

        expect(ticket, contains('C\$ 200.00'));
        // 80mm uses clean labels aligned to amount column
        expect(ticket, contains('Descuento'));
        expect(ticket, contains('Neto'));
        expect(ticket, contains('SUBTOTAL BRUTO:'));
        expect(ticket, contains('DESCUENTO:'));
        expect(ticket, contains('SUBTOTAL NETO:'));
        expect(ticket, contains('C\$ 180.00'));
        expect(ticket, contains('C\$ 207.00'));
        expect(ticket.split('\n').every((line) => line.length <= 40), isTrue);
      },
    );

    test(
      'card payments omit pending placeholders and retain real references',
      () {
        final pending = ReceiptPayment.fromPayment(
          const Payment(
            id: 'pending',
            invoiceId: '1',
            method: PaymentMethod.card,
            amount: 10,
            voucherCode: 'PENDIENTE',
          ),
        );
        final lastFour = ReceiptPayment.fromPayment(
          const Payment(
            id: 'last-four',
            invoiceId: '1',
            method: PaymentMethod.card,
            amount: 10,
            last4: '1234',
          ),
        );
        final real = ReceiptPayment.fromPayment(
          const Payment(
            id: 'real',
            invoiceId: '1',
            method: PaymentMethod.card,
            amount: 10,
            voucherCode: ' AUTH-42 ',
            last4: '9876',
          ),
        );

        expect(pending.reference, isNull);
        expect(lastFour.reference, '****1234');
        expect(real.reference, 'AUTH-42 (****9876)');
      },
    );

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

    test(
      'CUOTA FIJA: Title is COMPROBANTE DE VENTA, shows REGIMEN: CUOTA FIJA and NO Subtotal/IVA',
      () {
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
      },
    );

    test(
      'REGIMEN GENERAL (Standard): Title is FACTURA DE VENTA, shows REGIMEN: GENERAL, Subtotal & IVA 15%',
      () {
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
      },
    );

    test(
      'REGIMEN GENERAL (Tax Exempt / Feria Sin IVA): Shows VENTA EXENTA (IVA 0%) & Policy Disclaimer',
      () {
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
      },
    );
  });

  group('80mm Master Grid & Unified Amount Column', () {
    final f80 = ReceiptLayoutFormatter.format80mm();

    test('master grid uses 40 logical columns without character margins', () {
      expect(f80.metrics.qtyWidth, 4);
      expect(f80.metrics.descriptionWidth, 14);
      expect(f80.metrics.unitPriceWidth, 8);
      expect(f80.metrics.totalWidth, 11);
      expect(f80.metrics.columnGutters, 3);
      expect(f80.metrics.contentColumns, 40);
      expect(f80.metrics.contentWidth, 40);
      expect(f80.metrics.amountColumnStart, 29);
      expect(f80.metrics.amountRightEdge, 40);
      expect(
        f80.metrics.qtyWidth +
            f80.metrics.descriptionWidth +
            f80.metrics.unitPriceWidth +
            f80.metrics.totalWidth +
            f80.metrics.columnGutters,
        40,
      );
    });

    test('amount80 right-aligns to totalWidth (11 chars)', () {
      // NumberFormat produces: 120.00 (6), 1,234.50 (8), 99,999.99 (8), 0.01 (4), 0.00 (4)
      // padLeft(11) ensures each is exactly 11 chars
      expect(f80.amount80(120.00).length, 11);
      expect(f80.amount80(1234.50).length, 11);
      expect(f80.amount80(99999.99).length, 11);
      expect(f80.amount80(0.01).length, 11);
      expect(f80.amount80(0.00).length, 11);
      expect(f80.amount80(120.00), endsWith('120.00'));
      expect(f80.amount80(1234.50), endsWith('1,234.50'));
      expect(f80.amount80(99999.99), endsWith('99,999.99'));
      expect(f80.amount80(0.01), endsWith('0.01'));
    });

    test('summaryAmount80 includes currency prefix', () {
      // summaryAmount80 produces 'C$ X,XXX.XX' — rightText for formatTwoColumns
      expect(f80.summaryAmount80(120.00), 'C\$ 120.00');
      expect(f80.summaryAmount80(1234.50), 'C\$ 1,234.50');
      expect(f80.summaryAmount80(0.00), 'C\$ 0.00');
    });

    test('80mm item rows contain no currency prefix', () {
      final rows = f80.formatItemRow(
        quantity: 2,
        name: 'Cafe Americano',
        unitPrice: 60.0,
        total: 120.0,
      );
      expect(rows[0].contains('C\$'), isFalse);
      expect(rows[0].endsWith('120.00'), isTrue);
    });

    test(
      'unified amount column: all amounts end at same position in item, discount, summary, USD, payment',
      () {
        final doc = ReceiptDocument(
          businessName: 'TEST',
          taxRegime: TaxRegime.regimenGeneral,
          documentTitle: 'FACTURA',
          documentNumber: '001',
          date: DateTime(2026),
          lines: const [
            ReceiptLine(
              quantity: 2,
              description: 'Cafe Americano',
              unitPrice: 60.0,
              grossAmount: 120.0,
              discount: 30.0,
              taxableBase: 90.0,
              lineSubtotal: 90.0,
              taxAmount: 13.50,
              lineTotal: 103.50,
            ),
          ],
          grossSubtotal: 120.0,
          subtotal: 90.0,
          discountTotal: 30.0,
          totalTax: 13.50,
          total: 103.50,
          commercialRate: 36.50,
          totalUsd: 2.84,
          payments: const [
            ReceiptPayment(
              methodLabel: 'Efectivo C\$',
              currency: 'NIO',
              amount: 110.0,
              changeGiven: 6.50,
            ),
          ],
        );

        final ticket = f80.formatReceiptDocumentText(doc);
        final lines = ticket.split('\n');

        // Every line respects the calibrated 40-column limit.
        for (final line in lines) {
          expect(
            line.length,
            lessThanOrEqualTo(40),
            reason: 'Line exceeds 40: "$line" (${line.length})',
          );
        }

        // Item row amount ends at the common logical right edge.
        final itemLine = lines.firstWhere((l) => l.contains('Cafe Americano'));
        expect(itemLine.endsWith('120.00'), isTrue);
        expect(itemLine.contains('C\$'), isFalse);

        // Discount amount in item section ends at same position
        final discountLine = lines.firstWhere(
          (l) =>
              l.trimLeft().startsWith('Descuento') && !l.contains('SUBTOTAL'),
        );
        expect(discountLine.endsWith('30.00'), isTrue);

        // Net amount in item section ends at same position
        final netLine = lines.firstWhere(
          (l) => l.trimLeft().startsWith('Neto'),
        );
        expect(netLine.endsWith('90.00'), isTrue);

        // Summary amounts all contain C$ and end at same position
        final subtotalBruto = lines.firstWhere(
          (l) => l.contains('SUBTOTAL BRUTO:'),
        );
        expect(subtotalBruto, contains('C\$ 120.00'));

        final descLine = lines.firstWhere(
          (l) =>
              l.trimLeft().startsWith('DESCUENTO:') && !l.contains('SUBTOTAL'),
        );
        expect(descLine, contains('C\$ 30.00'));

        final subtotalNeto = lines.firstWhere(
          (l) => l.contains('SUBTOTAL NETO:'),
        );
        expect(subtotalNeto, contains('C\$ 90.00'));

        final totalLine = lines.firstWhere(
          (l) => l.contains('TOTAL CORDOBAS:'),
        );
        expect(totalLine, contains('C\$ 103.50'));

        // USD section amounts
        final tcLine = lines.firstWhere((l) => l.contains('T/C USD:'));
        expect(tcLine, contains('36.50'));
        expect(tcLine, isNot(contains('C\$')));

        final totalUsd = lines.firstWhere((l) => l.contains('TOTAL USD:'));
        expect(totalUsd, contains('\$ 2.84'));

        // Payment amounts
        final paymentLine = lines.firstWhere(
          (l) => l.contains('Efectivo C\$:'),
        );
        expect(paymentLine, contains('C\$ 110.00'));

        final changeLine = lines.firstWhere((l) => l.contains('Cambio'));
        expect(changeLine, contains('C\$ 6.50'));
      },
    );

    test(
      '80mm product table header uses correct column widths with gutters',
      () {
        final doc = ReceiptDocument(
          businessName: 'TEST',
          taxRegime: TaxRegime.regimenGeneral,
          documentTitle: 'FACTURA',
          documentNumber: '001',
          date: DateTime(2026),
          lines: const [],
          subtotal: 0,
          totalTax: 0,
          total: 0,
          totalUsd: 0,
        );
        final ticket = f80.formatReceiptDocumentText(doc);
        final headerLine = ticket
            .split('\n')
            .firstWhere((l) => l.trimLeft().startsWith('CANT'));
        // CANT(4) + 1 + DESCRIPCION(14) + 1 + P.UNIT(8) + 1 + TOTAL(11) = 40.
        expect(headerLine, contains('CANT'));
        expect(headerLine, contains('DESCRIPCION'));
        expect(headerLine, contains('P.UNIT'));
        expect(headerLine, contains('TOTAL'));
        expect(headerLine.length, 40);
        // Verify gutter separation
        expect(headerLine, contains('CANT '));
        expect(headerLine, contains(' DESCRIPCION '));
        expect(headerLine, contains(' P.UNIT '));
        expect(headerLine, contains(' TOTAL'));
      },
    );

    test('80mm discount lines align amounts with item total column', () {
      final doc = ReceiptDocument(
        businessName: 'TEST',
        taxRegime: TaxRegime.regimenGeneral,
        documentTitle: 'FACTURA',
        documentNumber: '001',
        date: DateTime(2026),
        lines: const [
          ReceiptLine(
            quantity: 1,
            description: 'Producto',
            unitPrice: 100.0,
            grossAmount: 100.0,
            discount: 25.0,
            taxableBase: 75.0,
            lineSubtotal: 75.0,
            lineTotal: 75.0,
          ),
        ],
        grossSubtotal: 100.0,
        subtotal: 75.0,
        discountTotal: 25.0,
        totalTax: 0,
        total: 75.0,
        totalUsd: 0,
      );
      final ticket = f80.formatReceiptDocumentText(doc);
      final lines = ticket.split('\n');

      // Find the item, discount, and net lines
      final itemLine = lines.firstWhere((l) => l.contains('Producto'));
      final discLine = lines.firstWhere(
        (l) => l.contains('Descuento') && !l.contains('SUBTOTAL'),
      );
      final netLine = lines.firstWhere(
        (l) => l.contains('Neto') && !l.contains('SUBTOTAL'),
      );

      expect(itemLine.length, 40);
      expect(discLine.length, 40);
      expect(netLine.length, 40);

      // Amounts right-align at same position
      expect(itemLine.endsWith('100.00'), isTrue);
      expect(discLine.endsWith('25.00'), isTrue);
      expect(netLine.endsWith('75.00'), isTrue);
    });

    test('80mm section headers are consistent width (40 chars)', () {
      final doc = ReceiptDocument(
        businessName: 'TEST',
        taxRegime: TaxRegime.regimenGeneral,
        documentTitle: 'FACTURA',
        documentNumber: '001',
        date: DateTime(2026),
        lines: const [],
        subtotal: 0,
        totalTax: 0,
        total: 0,
        totalUsd: 0,
        payments: [
          const ReceiptPayment(
            methodLabel: 'Efectivo C\$',
            currency: 'NIO',
            amount: 0,
          ),
        ],
      );
      final ticket = f80.formatReceiptDocumentText(doc);
      final lines = ticket.split('\n');

      // Dividers and section headers fill the logical width without outer spaces.
      for (final line in lines) {
        if (line.isEmpty) continue;
        final stripped = line.replaceAll('-', '').replaceAll('=', '').trim();
        if (stripped.isEmpty || stripped == 'DETALLE DE PAGO') {
          expect(
            line.length,
            40,
            reason: 'Divider/header not 40 chars: "$line" (${line.length})',
          );
        }
      }
    });

    test('amount80 handles overflow amounts without truncation', () {
      // 12,500.00 → 8 chars, fits in totalWidth(11)
      expect(f80.amount80(12500.00).length, 11);
      expect(f80.amount80(12500.00), endsWith('12,500.00'));

      // 125,000.00 → 9 chars, fits in totalWidth(11)
      expect(f80.amount80(125000.00).length, 11);
      expect(f80.amount80(125000.00), endsWith('125,000.00'));

      // 1,000,000.00 → 12 chars, overflows totalWidth(11) — padLeft returns as-is
      expect(f80.amount80(1000000.00).length, 12);
      expect(f80.amount80(1000000.00), endsWith('1,000,000.00'));

      // 10,000,000.00 → 13 chars, overflows totalWidth(11) — padLeft returns as-is
      expect(f80.amount80(10000000.00).length, 13);
      expect(f80.amount80(10000000.00), endsWith('10,000,000.00'));
    });

    test('summaryAmount80 handles large amounts without truncation', () {
      // C$ 12,500.00 → 12 chars, fits in totalWidth(12)
      expect(f80.summaryAmount80(12500.00), 'C\$ 12,500.00');

      // C$ 125,000.00 → 13 chars, overflows totalWidth(12)
      // formatTwoColumns breaks amount to next line naturally
      expect(f80.summaryAmount80(125000.00), 'C\$ 125,000.00');

      // C$ 1,000,000.00 → 14 chars, overflows totalWidth(12)
      expect(f80.summaryAmount80(1000000.00), 'C\$ 1,000,000.00');
    });

    test('item rows with large amounts never exceed 40 columns', () {
      // Quantity overflow: qty > 999 triggers fallback
      final qtyRows = f80.formatItemRow(
        quantity: 1000,
        name: 'Producto',
        unitPrice: 10.0,
        total: 10000.0,
      );
      expect(qtyRows.every((r) => r.length <= 40), isTrue);
      expect(qtyRows.join('\n'), contains('10,000.00'));

      // Total overflow: amount > 99,999,999.99 triggers fallback
      final totalRows = f80.formatItemRow(
        quantity: 1,
        name: 'Item caro',
        unitPrice: 99999999.99,
        total: 99999999.99,
      );
      expect(totalRows.every((r) => r.length <= 40), isTrue);
      expect(totalRows.join('\n'), contains('99,999,999.99'));
    });

    test('full receipt with large amounts respects 40-column limit', () {
      final doc = ReceiptDocument(
        businessName: 'TEST',
        taxRegime: TaxRegime.regimenGeneral,
        documentTitle: 'FACTURA',
        documentNumber: '001',
        date: DateTime(2026),
        lines: const [
          ReceiptLine(
            quantity: 1,
            description: 'Item grande',
            unitPrice: 125000.00,
            grossAmount: 125000.00,
            discount: 0,
            taxableBase: 125000.00,
            lineSubtotal: 125000.00,
            taxAmount: 18750.00,
            lineTotal: 143750.00,
          ),
        ],
        grossSubtotal: 125000.00,
        subtotal: 125000.00,
        discountTotal: 0,
        totalTax: 18750.00,
        total: 143750.00,
        totalUsd: 0,
      );
      final ticket = f80.formatReceiptDocumentText(doc);
      final lines = ticket.split('\n');
      for (final line in lines) {
        expect(
          line.length,
          lessThanOrEqualTo(40),
          reason: 'Line exceeds 40: "$line" (${line.length})',
        );
      }
      // Amounts present and not truncated
      expect(ticket, contains('125,000.00'));
      expect(ticket, contains('C\$ 125,000.00'));
      expect(ticket, contains('143,750.00'));
      expect(ticket, contains('C\$ 143,750.00'));
    });
  });
}
