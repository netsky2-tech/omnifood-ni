import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/adapters/printer/mock_printer_adapter.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'package:pos_app/domain/models/printer/receipt_document.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/services/printer/receipt_layout_formatter.dart';

/// NHILOS §45.1: the ticket identifies the point of sale (Caja). The label is
/// an operator-assigned alias for THIS terminal — never the device serial —
/// and an unassigned terminal must keep printing byte-identically to before
/// the field existed. These tests pin both guarantees.
Invoice _invoice() => Invoice(
      id: 'inv-caja',
      number: '001-001-01-00000042',
      createdAt: DateTime(2026, 10, 22, 20, 15),
      userId: 'u-1',
      subtotal: 250,
      totalTax: 37.5,
      total: 287.5,
      totalUsd: 7.88,
      paymentStatus: PaymentStatus.paid,
      syncStatus: SyncStatus.synced,
    );

const _items = [
  InvoiceItem(
    id: 'item-1',
    invoiceId: 'inv-caja',
    productId: 'p-1',
    productName: 'Smash Burger Doble',
    quantity: 2,
    unitPrice: 125,
    originalTaxRate: 15,
    appliedTaxRate: 15,
    taxAmount: 37.5,
    total: 287.5,
  ),
];

const _payments = [
  Payment(id: 'pay-1', invoiceId: 'inv-caja', method: PaymentMethod.cash, amount: 287.5),
];

ReceiptDocument _doc({String? cajaLabel}) => ReceiptDocument.fromInvoice(
      _invoice(),
      items: _items,
      payments: _payments,
      taxRegime: TaxRegime.regimenGeneral,
      businessName: 'OMNIFOOD CAFE & BISTRO',
      ruc: 'J0310000001234',
      address: 'Plaza Las Victorias, Modulo 4',
      phone: '+505 2222-8888',
      cashierName: 'Juan Cajero',
      fiscalAuthorizationNumber: 'AUT-DGI-2026-9876',
      cajaLabel: cajaLabel,
    );

void main() {
  final formatter = ReceiptLayoutFormatter.format80mm();

  group('Caja label on the 80mm ticket', () {
    test('BYTE-FOR-BYTE: unassigned output is frozen (same bytes as today)',
        () {
      // Golden hashes of the complete 80mm payload for this fixed fixture.
      // A no-Caja, no-tip, no-loyalty sale is what production prints today;
      // this locks that output so a layout tweak can never slip into a
      // go-live unnoticed. If a change is intentional, update the hashes
      // deliberately — never to "make the test pass".
      final text = formatter.formatReceiptDocumentText(_doc());
      final bytes = formatter.formatReceiptDocumentEscPos(_doc());

      expect(text.length, 1233);
      expect(bytes.length, 1144);
      expect(sha256.convert(utf8.encode(text)).toString(),
          '192b06c792a276a6fc02aafdcdf00c8820420e1cba338b28279559c423c9a369');
      expect(sha256.convert(bytes).toString(),
          '182f7d5a0bc1340418cca402ecd44b7e132e943a38173c0f0bfe694e5f301ab7');
    });

    test('an unassigned terminal prints NO Caja line', () {
      final text = formatter.formatReceiptDocumentText(_doc());
      expect(text, isNot(contains('Caja:')));
    });

    test('a blank label is the same as unassigned', () {
      final text = formatter.formatReceiptDocumentText(_doc(cajaLabel: '   '));
      expect(text, isNot(contains('Caja:')));
      expect(
        text,
        equals(formatter.formatReceiptDocumentText(_doc())),
        reason: 'blank is unassigned: no whitespace-only line',
      );
    });

    test('the Caja line is inserted right after Fecha and is the ONLY change',
        () {
      final without = formatter.formatReceiptDocumentText(_doc()).split('\n');
      final withCaja =
          formatter.formatReceiptDocumentText(_doc(cajaLabel: '1')).split('\n');

      final inserted = withCaja.where((l) => l.trim().startsWith('Caja:')).toList();
      expect(inserted, hasLength(1));
      expect(inserted.single, contains('Caja:'));
      expect(inserted.single, contains('1'));

      final stripped = withCaja.where((l) => !l.trim().startsWith('Caja:')).toList();
      expect(stripped, equals(without),
          reason: 'nothing else may move: byte-identical minus the one line');

      final fechaIndex = withCaja.indexWhere((l) => l.trim().startsWith('Fecha:'));
      final cajaIndex = withCaja.indexOf(inserted.single);
      expect(cajaIndex, fechaIndex + 1);
      final cashierIndex =
          withCaja.indexWhere((l) => l.trim().startsWith('Atendido por:'));
      expect(cajaIndex, lessThan(cashierIndex));
    });

    test('every line stays within the 40-column 80mm budget', () {
      final text =
          formatter.formatReceiptDocumentText(_doc(cajaLabel: 'CAJA PRINCIPAL'));
      for (final line in text.split('\n')) {
        expect(line.length, lessThanOrEqualTo(40), reason: line);
      }
    });

    test('a long label wraps instead of truncating or overflowing', () {
      final text = formatter.formatReceiptDocumentText(
        _doc(cajaLabel: 'BARRA DEL PATIO CENTRAL'),
      );
      expect(text, contains('Caja:'));
      for (final line in text.split('\n')) {
        expect(line.length, lessThanOrEqualTo(40), reason: line);
      }
      final joined = text.replaceAll('\n', ' ');
      expect(joined.replaceAll(RegExp(r'\s+'), ' '),
          contains('BARRA DEL PATIO CENTRAL'));
    });

    test('58mm keeps the 32-column budget too', () {
      final text = ReceiptLayoutFormatter.format58mm()
          .formatReceiptDocumentText(_doc(cajaLabel: 'CAJA PRINCIPAL 2'));
      expect(text, contains('Caja:'));
      for (final line in text.split('\n')) {
        expect(line.length, lessThanOrEqualTo(32), reason: line);
      }
    });

    test('ESC/POS carries the label, and no bytes when unassigned', () {
      final withLabel = formatter
          .formatReceiptDocumentEscPos(_doc(cajaLabel: '2'))
          .map((b) => b.toSigned(32))
          .map(String.fromCharCode)
          .join();
      expect(withLabel, contains('Caja:'));

      final without = formatter
          .formatReceiptDocumentEscPos(_doc())
          .map((b) => b.toSigned(32))
          .map(String.fromCharCode)
          .join();
      expect(without, isNot(contains('Caja:')));
    });
  });

  group('adapter contract', () {
    test('MockPrinterAdapter forwards the Caja label to the paper', () async {
      final adapter = MockPrinterAdapter();
      final result = await adapter.printInvoice(
        _invoice(),
        items: _items,
        payments: _payments,
        taxRegime: TaxRegime.regimenGeneral,
        paperWidthMm: 80,
        cashierName: 'Juan Cajero',
        cajaLabel: 'BARRA',
      );

      expect(result.isSuccess, isTrue);
      expect(adapter.lastPrintedText, contains('Caja:'));
      expect(adapter.lastPrintedText, contains('BARRA'));
    });

    test('MockPrinterAdapter without a label omits the line', () async {
      final adapter = MockPrinterAdapter();
      await adapter.printInvoice(
        _invoice(),
        items: _items,
        payments: _payments,
        taxRegime: TaxRegime.regimenGeneral,
        paperWidthMm: 80,
      );
      expect(adapter.lastPrintedText, isNot(contains('Caja:')));
    });
  });
}
