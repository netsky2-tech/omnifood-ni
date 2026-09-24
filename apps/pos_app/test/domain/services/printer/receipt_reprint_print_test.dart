import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/adapters/printer/mock_printer_adapter.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'package:pos_app/domain/models/printer/receipt_document.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/services/printer/receipt_layout_formatter.dart';

/// B1r (D-13, #547): the REIMPRESIÓN banner and the chain that carries it.
void main() {
  final reprintAt = DateTime(2026, 9, 25, 9, 30);

  Invoice invoice({bool isCanceled = false}) => Invoice(
        id: 'inv-reprint',
        number: '001-001-01-00000010',
        createdAt: DateTime(2026, 9, 24, 12, 0),
        userId: 'cashier-1',
        subtotal: 100,
        totalTax: 15,
        total: 115,
        isCanceled: isCanceled,
        paymentStatus: PaymentStatus.paid,
        syncStatus: SyncStatus.pending,
        type: InvoiceType.regular,
      );

  ReceiptDocument document({bool isReprint = false, bool isCanceled = false}) =>
      ReceiptDocument.fromInvoice(
        invoice(isCanceled: isCanceled),
        items: const [
          InvoiceItem(
            id: 'item-1',
            invoiceId: 'inv-reprint',
            productId: 'prod-1',
            productName: 'Café Espresso',
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
        isReprint: isReprint,
        reprintAt: isReprint ? reprintAt : null,
      );

  group('REIMPRESIÓN rendering — plain text path', () {
    for (final widthMm in [58, 80]) {
      test(
          'reprint banner + datetime render at ${widthMm}mm and coexist with ANULADO',
          () {
        final formatter = ReceiptLayoutFormatter.fromPaperWidth(widthMm);
        final text = formatter.formatReceiptDocumentText(
          document(isReprint: true, isCanceled: true),
        );
        expect(text, contains('*** REIMPRESIÓN ***'));
        expect(text, contains('Reimpresión:'));
        expect(text, contains('25/09/2026 09:30'));
        expect(text, contains('*** DOCUMENTO ANULADO ***'));
      });
    }

    test('a reprint of an ACTIVE invoice shows REIMPRESIÓN without ANULADO',
        () {
      final text = ReceiptLayoutFormatter.format58mm()
          .formatReceiptDocumentText(document(isReprint: true));
      expect(text, contains('*** REIMPRESIÓN ***'));
      expect(text, isNot(contains('DOCUMENTO ANULADO')));
      expect(text, contains('Reimpresión:'));
      expect(text, contains('25/09/2026 09:30'));
    });

    test('first-issuance documents render neither banner (negative)', () {
      for (final widthMm in [58, 80]) {
        final formatter = ReceiptLayoutFormatter.fromPaperWidth(widthMm);
        final text = formatter
            .formatReceiptDocumentText(document(isReprint: false));
        expect(text, isNot(contains('REIMPRESIÓN')));
        expect(text, isNot(contains('Reimpresión:')));
      }
    });
  });

  group('REIMPRESIÓN rendering — ESC/POS path', () {
    for (final widthMm in [58, 80]) {
      test('banner + datetime render in the byte stream at ${widthMm}mm',
          () {
        final formatter = ReceiptLayoutFormatter.fromPaperWidth(widthMm);
        final bytes = formatter.formatReceiptDocumentEscPos(
          document(isReprint: true, isCanceled: true),
        );
        final decoded = String.fromCharCodes(bytes);
        expect(decoded, contains('*** REIMPRESIÓN ***'));
        expect(decoded, contains('Reimpresión:'));
        expect(decoded, contains('25/09/2026 09:30'));
        expect(decoded, contains('*** DOCUMENTO ANULADO ***'));
      });
    }

    test('absent reprint flag leaves the byte stream clean', () {
      final formatter = ReceiptLayoutFormatter.format58mm();
      final bytes = formatter
          .formatReceiptDocumentEscPos(document(isReprint: false));
      final decoded = String.fromCharCodes(bytes);
      expect(decoded, isNot(contains('REIMPRESIÓN')));
    });
  });

  group('D-13 chain — printInvoice must carry isReprint to the paper', () {
    test('the reprint flag and datetime survive the adapter chain', () async {
      final adapter = MockPrinterAdapter();
      final result = await adapter.printInvoice(
        invoice(),
        items: const [],
        payments: const [],
        businessName: 'Café Original',
        ruc: 'A0011234567890',
        taxRegime: TaxRegime.regimenGeneral,
        isReprint: true,
        reprintAt: reprintAt,
      );

      expect(result.isSuccess, isTrue);
      final printed = result.printedText ?? adapter.lastPrintedText ?? '';
      expect(
        printed,
        contains('*** REIMPRESIÓN ***'),
        reason: 'a future port edit must not silently drop the reprint flag',
      );
      expect(printed, contains('Reimpresión:'));
      expect(printed, contains('25/09/2026 09:30'));
    });

    test('non-reprint invoices print without the banner', () async {
      final adapter = MockPrinterAdapter();
      final result = await adapter.printInvoice(
        invoice(),
        items: const [],
        payments: const [],
        businessName: 'Café Original',
        ruc: 'A0011234567890',
        taxRegime: TaxRegime.regimenGeneral,
      );

      expect(result.isSuccess, isTrue);
      final printed = result.printedText ?? adapter.lastPrintedText ?? '';
      expect(printed, isNot(contains('REIMPRESIÓN')));
    });
  });
}
