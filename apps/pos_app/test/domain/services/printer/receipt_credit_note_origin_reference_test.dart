import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'package:pos_app/domain/models/printer/receipt_document.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/services/printer/receipt_layout_formatter.dart';

/// H8 (batch 8 slice 8a): the origin-reference block of DGI credit notes.
/// A credit note must reference the affected document ('Doc. Origen:') and
/// name the persisted refund reason at document level ('Motivo:'). Both are
/// rendered ONLY from persisted data (the note's originInvoiceId and the
/// reason stamped on every refund line at issuance) — the formatter never
/// invents fiscal copy, and a canceled document's 'Motivo:' (the
/// cancellation reason) is never mixed with the refund reason.
void main() {
  final formatter = ReceiptLayoutFormatter.format58mm();

  Invoice buildCreditNote({
    bool isCanceled = false,
    String? voidReason,
    String? originInvoiceId = 'F001-ORIGIN-ID',
  }) =>
      Invoice(
        id: 'cn-1',
        number: '001-001-01-00000099',
        createdAt: DateTime(2026, 10, 1, 9, 30),
        userId: 'cashier-1',
        subtotal: -100,
        totalTax: -15,
        total: -115,
        isCanceled: isCanceled,
        voidReason: voidReason,
        paymentStatus: PaymentStatus.paid,
        syncStatus: SyncStatus.pending,
        type: InvoiceType.creditNote,
        originInvoiceId: originInvoiceId,
        refundReasonCode: 'Producto defectuoso',
      );

  InvoiceItem buildRefundLine({String? notes = 'Producto defectuoso'}) =>
      InvoiceItem(
        id: 'cn-line-1',
        invoiceId: 'cn-1',
        productId: 'combo-1',
        productName: 'RETURN: Combo 1',
        quantity: -1,
        unitPrice: 50,
        originalTaxRate: 15,
        appliedTaxRate: 15,
        taxAmount: -7.5,
        total: -57.5,
        notes: notes,
      );

  ReceiptDocument buildDocument(
    Invoice invoice,
    List<InvoiceItem> items, {
    String? originDocumentReference,
  }) =>
      ReceiptDocument.fromInvoice(
        invoice,
        items: items,
        payments: const [],
        businessName: 'Café Original',
        ruc: 'A0011234567890',
        taxRegime: TaxRegime.regimenGeneral,
        originDocumentReference: originDocumentReference,
      );

  group('credit-note origin-reference block (58mm text renderer)', () {
    test(
        'renders the resolved origin FISCAL NUMBER and the unified persisted refund reason',
        () {
      final doc = buildDocument(
        buildCreditNote(),
        [buildRefundLine()],
        originDocumentReference: '001-001-01-00000042',
      );

      final text = formatter.formatReceiptDocumentText(doc);

      expect(text, contains('NOTA DE CREDITO'));
      expect(text, contains('Doc. Origen:'));
      expect(text, contains('001-001-01-00000042'));
      // REQ-8 (slice 8a): the internal UUID must NEVER reach the paper.
      expect(text, isNot(contains('F001-ORIGIN-ID')));
      expect(text, contains('Motivo:'));
      expect(text, contains('Producto defectuoso'));
    });

    test(
        'renders no origin line when the reference was not resolved (never the UUID)',
        () {
      final doc = buildDocument(buildCreditNote(), [buildRefundLine()]);

      final text = formatter.formatReceiptDocumentText(doc);

      expect(text, contains('NOTA DE CREDITO'));
      expect(text, isNot(contains('Doc. Origen:')));
      expect(text, isNot(contains('F001-ORIGIN-ID')));
    });

    test('renders nothing when the refund lines carry no reason at all', () {
      final doc = buildDocument(
        buildCreditNote(),
        [buildRefundLine(notes: null)],
      );

      final text = formatter.formatReceiptDocumentText(doc);

      expect(doc.unifiedReasonForTest, isNull);
      expect(text, isNot(contains('Doc. Origen:')));
      // No fabricated default reason on the paper.
      expect(text, isNot(contains('SIN MOTIVO')));
    });

    test('renders nothing when the refund lines disagree on the reason', () {
      final doc = buildDocument(buildCreditNote(), [
        buildRefundLine(),
        buildRefundLine(notes: 'Otro motivo'),
      ]);

      final text = formatter.formatReceiptDocumentText(doc);

      expect(doc.unifiedReasonForTest, isNull);
      expect(text, isNot(contains('Motivo:')));
    });

    test('a CANCELED credit note keeps its cancellation Motivo and never '
        'mixes it with the refund reason', () {
      final doc = buildDocument(
        buildCreditNote(
          isCanceled: true,
          voidReason: 'ERROR_DE_EMISION',
        ),
        [buildRefundLine()],
      );

      final text = formatter.formatReceiptDocumentText(doc);

      expect(text, contains('*** DOCUMENTO ANULADO ***'));
      expect(text, contains('ERROR_DE_EMISION'));
      // Exactly one Motivo line: the cancellation reason.
      expect('Motivo:'.allMatches(text), hasLength(1));
      expect(text, isNot(contains('Producto defectuoso Motivo')));
    });

    test('non-credit-note documents never render the origin or refund blocks',
        () {
      final regular = Invoice(
        id: 'inv-1',
        number: '001-001-01-00000001',
        createdAt: DateTime(2026, 10, 1, 9, 30),
        userId: 'cashier-1',
        subtotal: 100,
        totalTax: 15,
        total: 115,
        paymentStatus: PaymentStatus.paid,
        syncStatus: SyncStatus.synced,
      );
      final doc = buildDocument(
        regular,
        [buildRefundLine()],
        // Even with a reference present, a non-CN document is inert.
        originDocumentReference: '001-001-01-00000042',
      );

      final text = formatter.formatReceiptDocumentText(doc);

      expect(text, isNot(contains('NOTA DE CREDITO')));
      expect(text, isNot(contains('Doc. Origen:')));
      expect(text, isNot(contains('Motivo:')));
    });
  });

  group('credit-note origin-reference block (ESC/POS renderer)', () {
    test(
        'renders the resolved origin FISCAL NUMBER and the unified persisted refund reason',
        () {
      final doc = buildDocument(
        buildCreditNote(),
        [buildRefundLine()],
        originDocumentReference: '001-001-01-00000042',
      );

      final bytes = formatter.formatReceiptDocumentEscPos(doc);
      final text = String.fromCharCodes(bytes);

      expect(text, contains('NOTA DE CREDITO'));
      expect(text, contains('Doc. Origen:'));
      expect(text, contains('001-001-01-00000042'));
      expect(text, isNot(contains('F001-ORIGIN-ID')));
      expect(text, contains('Motivo:'));
      expect(text, contains('Producto defectuoso'));
    });

    test('renders no Motivo and no origin line without resolved reference',
        () {
      final doc = buildDocument(
        buildCreditNote(),
        [buildRefundLine(notes: null)],
      );

      final bytes = formatter.formatReceiptDocumentEscPos(doc);
      final text = String.fromCharCodes(bytes);

      expect(text, isNot(contains('Doc. Origen:')));
      expect(text, isNot(contains('F001-ORIGIN-ID')));
      expect(text, isNot(contains('Motivo:')));
    });
  });

  test('unifiedCreditNoteReason exposes the single persisted reason', () {
    expect(
      buildDocument(buildCreditNote(), [buildRefundLine()])
          .unifiedReasonForTest,
      'Producto defectuoso',
    );
  });
}

extension on ReceiptDocument {
  /// Test seam for the public formatter helper.
  String? get unifiedReasonForTest =>
      ReceiptLayoutFormatter.format58mm().unifiedCreditNoteReason(this);
}
