import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/adapters/printer/mock_printer_adapter.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'package:pos_app/domain/models/printer/receipt_document.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/services/printer/receipt_layout_formatter.dart';

/// D-17: the fiscal authorization number (número de autorización DGI) must
/// print at the bottom-right of the invoice (DT 09-2007 QUINTO), and must
/// survive the whole printInvoice chain — the same chain that previously
/// dropped customerRuc (#540 T4).
void main() {
  const authorizationNumber = 'AUT-DGI-2026-9876';

  Invoice invoice() => Invoice(
        id: 'inv-d17',
        number: '001-001-01-00000042',
        createdAt: DateTime(2026, 9, 24, 0, 15),
        userId: 'cashier-1',
        subtotal: 100,
        totalTax: 15,
        total: 115,
        paymentStatus: PaymentStatus.paid,
        syncStatus: SyncStatus.pending,
        type: InvoiceType.regular,
      );

  ReceiptDocument document({String? authorization}) =>
      ReceiptDocument.fromInvoice(
        invoice(),
        items: const [
          InvoiceItem(
            id: 'item-1',
            invoiceId: 'inv-d17',
            productId: 'prod-1',
            productName: 'Café Americano',
            quantity: 2,
            unitPrice: 50,
            originalTaxRate: 15,
            appliedTaxRate: 15,
            taxAmount: 15,
            total: 115,
          ),
        ],
        payments: const [],
        taxRegime: TaxRegime.regimenGeneral,
        fiscalAuthorizationNumber: authorization,
      );

  List<String> textLines(String receiptText) =>
      receiptText.split('\n').map((l) => l).toList();

  int lastDividerIndex(List<String> lines) {
    var index = -1;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].contains('====')) index = i;
    }
    return index;
  }

  group('D-17 rendering — plain text path', () {
    for (final widthMm in [58, 80]) {
      test(
          'prints the authorization number near the bottom at ${widthMm}mm',
          () {
        final formatter = ReceiptLayoutFormatter.fromPaperWidth(widthMm);
        final text =
            formatter.formatReceiptDocumentText(document(authorization: authorizationNumber));
        final lines = textLines(text);

        // 32 cols: the label+value line cannot fit, so the label sits alone
        // above the value (formatKeyValue fallback). 40 cols: the full
        // one-line form fits, right-aligned.
        final oneLineFits = widthMm == 80;
        final labelLineIndexes = <int>[
          for (var i = 0; i < lines.length; i++)
            if (lines[i].trim() == 'Autorización DGI:') i,
        ];
        expect(labelLineIndexes.length, oneLineFits ? 0 : 1);
        expect(text, contains(authorizationNumber));

        if (oneLineFits) {
          final authLineIndexes = <int>[
            for (var i = 0; i < lines.length; i++)
              if (lines[i].trim() == 'Autorización DGI: $authorizationNumber') i,
          ];
          expect(authLineIndexes, hasLength(1),
              reason: 'exactly one authorization line, unambiguous on paper');
          final authLine = lines[authLineIndexes.single];
          // Right-aligned within the printable width: the value touches the
          // right margin, never floats mid-line.
          expect(authLine.trim().length, lessThanOrEqualTo(formatter.maxCols));
          expect(authLine.startsWith(' '), isTrue,
              reason: 'line is pushed to the right margin');
          expect(authLine.endsWith(authorizationNumber), isTrue);
          // Near the bottom: in the footer block, after the totals.
          expect(authLineIndexes.single,
              greaterThan(lastDividerIndex(lines) - 6));
        } else {
          final valueLineIndex =
              lines.indexWhere((l) => l.trim() == authorizationNumber);
          expect(valueLineIndex, greaterThan(0));
          expect(valueLineIndex, labelLineIndexes.single + 1);
          expect(valueLineIndex, greaterThan(lastDividerIndex(lines) - 6));
        }
      });
    }

    test('wraps gracefully at 32 columns when the line cannot fit', () {
      final longNumber = 'AUT-DGI-2026-987654321-RESOLUCION-0001';
      final formatter = ReceiptLayoutFormatter.format58mm();
      final text = formatter.formatReceiptDocumentText(
        document(authorization: longNumber),
      );
      final lines = textLines(text);
      // Label stays identifiable and the value survives in full (wrapped,
      // never truncated): rejoining the whitespace-stripped text restores
      // the number even when the wrap splits it mid-token.
      expect(lines.any((l) => l.contains('Autorización DGI')), isTrue);
      expect(text.replaceAll(RegExp(r'\s'), ''), contains(longNumber));
      // Nothing exceeds the printable width.
      for (final line in lines) {
        expect(line.length, lessThanOrEqualTo(formatter.maxCols + 1),
            reason: 'wrapped, not truncated: "$line"');
      }
    });

    test('prints NOTHING when the number is null (no fabricated placeholder)',
        () {
      final formatter = ReceiptLayoutFormatter.format58mm();
      final text =
          formatter.formatReceiptDocumentText(document(authorization: null));
      expect(text, isNot(contains('Autorización DGI')));
      expect(text, isNot(contains('AUT-DGI')));
    });

    test('prints NOTHING when the number is blank (no blank-looking line)',
        () {
      final formatter = ReceiptLayoutFormatter.format58mm();
      final text = formatter.formatReceiptDocumentText(
        document(authorization: '   '),
      );
      expect(text, isNot(contains('Autorización DGI')));
    });
  });

  group('D-17 rendering — ESC/POS path', () {
    for (final widthMm in [58, 80]) {
      test(
          'prints the authorization number in the byte stream at ${widthMm}mm',
          () {
        final formatter = ReceiptLayoutFormatter.fromPaperWidth(widthMm);
        final bytes = formatter
            .formatReceiptDocumentEscPos(document(authorization: authorizationNumber));
        final decoded = String.fromCharCodes(bytes);
        expect(decoded, contains('Autorización DGI'));
        expect(decoded, contains(authorizationNumber));
      });
    }

    test('absent number leaves the byte stream clean', () {
      final formatter = ReceiptLayoutFormatter.format58mm();
      final bytes = formatter
          .formatReceiptDocumentEscPos(document(authorization: null));
      final decoded = String.fromCharCodes(bytes);
      expect(decoded, isNot(contains('Autorización DGI')));
    });
  });

  group('D-17 chain — printInvoice must not drop the field', () {
    test(
        'the number survives from printInvoice to the rendered text of an adapter',
        () async {
      final adapter = MockPrinterAdapter();
      final result = await adapter.printInvoice(
        invoice(),
        items: const [],
        payments: const [],
        businessName: 'OMNIFOOD NI',
        ruc: 'J0310000001234',
        taxRegime: TaxRegime.regimenGeneral,
        fiscalAuthorizationNumber: authorizationNumber,
      );

      expect(result.isSuccess, isTrue);
      final printed = result.printedText ?? adapter.lastPrintedText ?? '';
      expect(
        printed,
        contains('Autorización DGI'),
        reason:
            'a future port edit must not silently drop the field the way '
            'customerRuc was dropped (#540 T4)',
      );
      expect(printed.replaceAll(RegExp(r'\s'), ''),
          contains(authorizationNumber));
    });

    test('unconfigured number prints a receipt without the field', () async {
      final adapter = MockPrinterAdapter();
      final result = await adapter.printInvoice(
        invoice(),
        items: const [],
        payments: const [],
        businessName: 'OMNIFOOD NI',
        ruc: 'J0310000001234',
        taxRegime: TaxRegime.regimenGeneral,
      );

      expect(result.isSuccess, isTrue);
      final printed = result.printedText ?? adapter.lastPrintedText ?? '';
      expect(printed, isNot(contains('Autorización DGI')));
    });
  });
}
