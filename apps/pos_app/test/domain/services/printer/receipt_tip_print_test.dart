import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/adapters/printer/mock_printer_adapter.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'package:pos_app/domain/models/loyalty/loyalty_program.dart';
import 'package:pos_app/domain/models/printer/receipt_document.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/services/printer/receipt_layout_formatter.dart';
import 'package:pos_app/domain/services/sales/post_paid_feedback_service.dart';

/// Batch 7 Slice 2 / DGI INV-16.1: the voluntary tip is NOT part of the
/// taxable total. It must reach paper as its own non-taxable block so the
/// payment breakdown — registered against total + tip — balances, without
/// ever altering the fiscal total, the 80mm grid or the existing layout when
/// no tip was selected.
void main() {
  Invoice invoice({
    double? tipAmountNio,
    double? tipAmountUsd,
    double? tipPercentage,
    bool isCanceled = false,
  }) => Invoice(
        id: 'inv-tip',
        number: '001-001-01-00000042',
        createdAt: DateTime(2026, 9, 24, 20, 15),
        userId: 'cashier-1',
        subtotal: 250.0,
        totalTax: 37.5,
        total: 287.5,
        totalUsd: 7.88,
        paymentStatus: PaymentStatus.paid,
        syncStatus: SyncStatus.pending,
        type: InvoiceType.regular,
        isCanceled: isCanceled,
        tipAmountNio: tipAmountNio,
        tipAmountUsd: tipAmountUsd,
        tipPercentage: tipPercentage,
      );

  const items = [
    InvoiceItem(
      id: 'item-1',
      invoiceId: 'inv-tip',
      productId: 'prod-1',
      productName: 'Smash Burger',
      quantity: 2,
      unitPrice: 125.0,
      originalTaxRate: 15,
      appliedTaxRate: 15,
      taxAmount: 37.5,
      total: 287.5,
    ),
  ];

  ReceiptDocument build({
    double? tipAmountNio = 28.75,
    double? tipAmountUsd = 0.79,
    double? tipPercentage = 10.0,
    bool isCanceled = false,
    PostPaidFeedback? loyaltyFeedback,
    bool isReprint = false,
  }) => ReceiptDocument.fromInvoice(
    invoice(
      tipAmountNio: tipAmountNio,
      tipAmountUsd: tipAmountUsd,
      tipPercentage: tipPercentage,
      isCanceled: isCanceled,
    ),
    items: items,
    payments: [
      Payment(
        id: 'pay-1',
        invoiceId: 'inv-tip',
        method: PaymentMethod.cash,
        amount: 316.25,
      ),
    ],
    taxRegime: TaxRegime.regimenGeneral,
    loyaltyFeedback: loyaltyFeedback,
    isReprint: isReprint,
  );

  final f58 = ReceiptLayoutFormatter.format58mm();
  final f80 = ReceiptLayoutFormatter.format80mm();

  group('ReceiptDocument — tip snapshot', () {
    test('maps the persisted tip fields and derives the amount payable', () {
      final doc = build();
      expect(doc.hasTip, isTrue);
      expect(doc.tipAmountNio, 28.75);
      expect(doc.tipAmountUsd, 0.79);
      expect(doc.tipPercentage, 10.0);
      expect(doc.total, 287.5, reason: 'fiscal total is never altered');
      expect(doc.totalWithTipNio, 316.25);
      expect(doc.totalWithTipUsd, closeTo(8.67, 0.0001));
    });

    test('a null stored tip is the same absence as zero', () {
      final doc = build(
        tipAmountNio: null,
        tipAmountUsd: null,
        tipPercentage: null,
      );
      expect(doc.hasTip, isFalse);
      expect(doc.totalWithTipNio, doc.total);
    });
  });

  group('tip block — text renderer', () {
    test('80mm prints the tip and the amount payable after the fiscal total',
        () {
      final text = f80.formatReceiptDocumentText(build());
      final lines = text.split('\n');

      expect(text, contains('TOTAL CORDOBAS:'));
      expect(text, contains('PROPINA (10%):'));
      expect(text, contains('TOTAL A PAGAR:'));
      expect(text, contains('PROPINA USD:'));
      expect(text, contains('TOTAL A PAGAR USD:'));

      final fiscalTotal = lines.indexWhere((l) => l.contains('TOTAL CORDOBAS:'));
      final tip = lines.indexWhere((l) => l.contains('PROPINA (10%):'));
      final payable = lines.indexWhere((l) => l.contains('TOTAL A PAGAR:'));
      expect(fiscalTotal, lessThan(tip));
      expect(tip, lessThan(payable));

      // The fiscal total line itself is untouched: 287.50, not 316.25.
      expect(lines[fiscalTotal], contains('287.50'));
      expect(lines[payable], contains('316.25'));
    });

    test('80mm keeps every line within the 40-column grid', () {
      final lines = f80.formatReceiptDocumentText(build()).split('\n');
      for (final line in lines) {
        expect(
          line.length,
          lessThanOrEqualTo(40),
          reason: 'line overflows the 80mm grid: "$line"',
        );
      }
    });

    test('58mm keeps every line within the 32-column grid', () {
      final lines = f58.formatReceiptDocumentText(build()).split('\n');
      for (final line in lines) {
        expect(
          line.length,
          lessThanOrEqualTo(32),
          reason: 'line overflows the 58mm grid: "$line"',
        );
      }
    });

    test('58mm wraps an oversized USD amount instead of truncating the label',
        () {
      final doc = build(tipAmountNio: 287.5, tipAmountUsd: 1234.0);
      final text = f58.formatReceiptDocumentText(doc);
      expect(text, contains('TOTAL A PAGAR USD:'));
      expect(text, contains('1,234.00'));
      for (final line in text.split('\n')) {
        expect(line.length, lessThanOrEqualTo(32));
      }
    });

    test('a historical tip without a percentage prints a plain label', () {
      final text = f80.formatReceiptDocumentText(
        build(tipPercentage: null),
      );
      expect(text, contains('PROPINA:'));
      expect(text, isNot(contains('PROPINA (')));
    });

    test('no tip selected renders no tip lines at all', () {
      final doc = build(
        tipAmountNio: null,
        tipAmountUsd: null,
        tipPercentage: null,
      );
      final text = f80.formatReceiptDocumentText(doc);
      expect(text, isNot(contains('PROPINA')));
      expect(text, isNot(contains('TOTAL A PAGAR')));
    });

    test('the tip block is the ONLY difference vs. a no-tip receipt', () {
      final without = f80
          .formatReceiptDocumentText(
            build(tipAmountNio: null, tipAmountUsd: null, tipPercentage: null),
          )
          .split('\n');
      final withTip = f80
          .formatReceiptDocumentText(build())
          .split('\n')
          .where((l) => !l.contains('PROPINA') && !l.contains('TOTAL A PAGAR'))
          .toList();
      expect(withTip, equals(without));
    });
  });

  group('tip block — ESC/POS renderer', () {
    test('prints the same tip block on the byte stream', () {
      final bytes = f80.formatReceiptDocumentEscPos(build());
      final text = latin1.decode(bytes);
      expect(text, contains('PROPINA (10%):'));
      expect(text, contains('TOTAL A PAGAR:'));
      expect(text, contains('316.25'));
      expect(text, contains('TOTAL CORDOBAS:'));
      expect(text, contains('287.50'));
    });

    test('no tip selected emits no tip bytes', () {
      final bytes = f80.formatReceiptDocumentEscPos(
        build(tipAmountNio: null, tipAmountUsd: null, tipPercentage: null),
      );
      final text = latin1.decode(bytes);
      expect(text, isNot(contains('PROPINA')));
      expect(text, isNot(contains('TOTAL A PAGAR')));
    });
  });

  group('tip + fiscal banners', () {
    test('a canceled document keeps ANULADO and still prints the tip', () {
      final text = f80.formatReceiptDocumentText(build(isCanceled: true));
      expect(text, contains('*** DOCUMENTO ANULADO ***'));
      expect(text, contains('PROPINA (10%):'));
    });

    test('a reprint keeps the REIMPRESIÓN banner and the tip', () {
      final text = f80.formatReceiptDocumentText(build(isReprint: true));
      expect(text, contains('*** REIMPRESIÓN ***'));
      expect(text, contains('PROPINA (10%):'));
    });
  });

  group('unified renderer — loyalty sales use the canonical layout', () {
    PostPaidFeedback feedback() => PostPaidFeedback(
      programs: [
        ProgramFeedback(
          programId: 'prog-1',
          programName: 'Puntos SOHO',
          programType: LoyaltyProgramType.spendPoints,
          unitsEarned: 120,
          newBalance: 320,
          unitsToNextReward: 80,
        ),
      ],
    );

    test('loyalty is a presentation field of the document', () {
      final doc = build(loyaltyFeedback: feedback());
      expect(doc.loyaltyFeedback, isNotNull);
      final text = f80.formatReceiptDocumentText(doc);
      expect(text, contains('LEALTAD'));
      expect(text, contains('Puntos SOHO'));
    });

    test('loyalty sales now disclose discounts and the tip on the same layout',
        () {
      final text = f80.formatReceiptDocumentText(
        build(loyaltyFeedback: feedback()),
      );
      expect(text, contains('PROPINA (10%):'));
      expect(text, contains('TOTAL A PAGAR:'));
      expect(text, contains('LEALTAD'));
    });

    test('loyalty sales disclose the document discount (legacy path dropped it)',
        () {
      final doc = ReceiptDocument.fromInvoice(
        Invoice(
          id: 'inv-disc',
          number: '001-001-01-00000043',
          createdAt: DateTime(2026, 9, 24, 20, 20),
          userId: 'cashier-1',
          subtotal: 225.0,
          totalTax: 33.75,
          total: 258.75,
          paymentStatus: PaymentStatus.paid,
        ),
        items: const [
          InvoiceItem(
            id: 'item-1',
            invoiceId: 'inv-disc',
            productId: 'prod-1',
            productName: 'Smash Burger',
            quantity: 1,
            unitPrice: 250.0,
            originalTaxRate: 15,
            appliedTaxRate: 15,
            taxAmount: 33.75,
            total: 258.75,
            discount: 25.0,
          ),
        ],
        payments: const [],
        taxRegime: TaxRegime.regimenGeneral,
        loyaltyFeedback: feedback(),
      );
      final text = f80.formatReceiptDocumentText(doc);
      expect(text, contains('DESCUENTO:'));
      expect(text, contains('SUBTOTAL NETO:'));
      expect(text, contains('LEALTAD'));
    });

    test('loyalty sales keep every line within the 80mm grid', () {
      final lines = f80
          .formatReceiptDocumentText(build(loyaltyFeedback: feedback()))
          .split('\n');
      for (final line in lines) {
        expect(line.length, lessThanOrEqualTo(40), reason: line);
      }
    });

    test('loyalty also reaches the ESC/POS byte stream', () {
      final bytes = f80.formatReceiptDocumentEscPos(
        build(loyaltyFeedback: feedback()),
      );
      final text = latin1.decode(bytes);
      expect(text, contains('LEALTAD'));
      expect(text, contains('PROPINA (10%):'));
    });

    test('the loyalty block is never rendered on a reprint (not persisted)',
        () {
      final doc = ReceiptDocument.fromInvoice(
        invoice(tipAmountNio: 28.75, tipAmountUsd: 0.79, tipPercentage: 10),
        items: items,
        payments: const [],
        taxRegime: TaxRegime.regimenGeneral,
        isReprint: true,
      );
      final text = f80.formatReceiptDocumentText(doc);
      expect(text, isNot(contains('LEALTAD')));
      expect(text, contains('*** REIMPRESIÓN ***'));
      expect(text, contains('PROPINA (10%):'));
    });
  });

  group('formatInvoiceText compatibility wrapper', () {
    test('routes loyalty sales through the canonical renderer', () {
      final formatter = ReceiptLayoutFormatter.format80mm();
      final text = formatter.formatInvoiceText(
        invoice(tipAmountNio: 28.75, tipAmountUsd: 0.79, tipPercentage: 10),
        items: items,
        payments: const [],
        taxRegime: TaxRegime.regimenGeneral,
        loyaltyFeedback: PostPaidFeedback(
          programs: [
            ProgramFeedback(
              programId: 'prog-1',
              programName: 'Puntos SOHO',
              programType: LoyaltyProgramType.spendPoints,
              unitsEarned: 120,
              newBalance: 320,
            ),
          ],
        ),
      );
      expect(text, contains('LEALTAD'));
      expect(text, contains('PROPINA (10%):'));
      for (final line in text.split('\n')) {
        expect(line.length, lessThanOrEqualTo(40));
      }
    });
  });

  group('adapter — one canonical document for loyalty + tip', () {
    test('MockPrinterAdapter prints loyalty, tip and discounts on 80mm', () async {
      final adapter = MockPrinterAdapter();
      final result = await adapter.printInvoice(
        invoice(tipAmountNio: 28.75, tipAmountUsd: 0.79, tipPercentage: 10),
        items: items,
        payments: [
          Payment(
            id: 'pay-1',
            invoiceId: 'inv-tip',
            method: PaymentMethod.cash,
            amount: 316.25,
          ),
        ],
        taxRegime: TaxRegime.regimenGeneral,
        paperWidthMm: 80,
        loyaltyFeedback: PostPaidFeedback(
          programs: [
            ProgramFeedback(
              programId: 'prog-1',
              programName: 'Puntos SOHO',
              programType: LoyaltyProgramType.spendPoints,
              unitsEarned: 120,
              newBalance: 320,
            ),
          ],
        ),
      );

      expect(result.isSuccess, isTrue);
      final text = adapter.lastPrintedText!;
      expect(text, contains('LEALTAD'));
      expect(text, contains('PROPINA (10%):'));
      expect(text, contains('TOTAL A PAGAR:'));
      for (final line in text.split('\n')) {
        expect(line.length, lessThanOrEqualTo(40), reason: line);
      }
    });
  });
}
