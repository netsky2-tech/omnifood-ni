import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'package:pos_app/domain/models/printer/receipt_document.dart';
import 'package:pos_app/domain/services/printer/receipt_layout_formatter.dart';

void main() {
  ReceiptDocument buildDoc() => ReceiptDocument.nonFiscalTestPage(
    businessName: 'CAFE DE PRUEBA',
    legalName: 'CAFE DE PRUEBA S.A.',
    address: 'Managua, Nicaragua',
    phone: '2222-3333',
    cashierName: 'cajero-1',
    date: DateTime(2026, 10, 23, 9, 30),
    taxRegime: TaxRegime.regimenGeneral,
  );

  group('Issue #957 non-fiscal test page', () {
    test('text page says it is not an invoice and omits every fiscal element', () {
      final text = ReceiptLayoutFormatter.format58mm()
          .formatReceiptDocumentText(buildDoc());

      expect(text, contains('NO ES FACTURA'));
      expect(text, contains('PRUEBA DE IMPRESION'));
      expect(text, contains('SIN VALIDEZ FISCAL'));

      expect(text, isNot(contains('FACTURA DE VENTA')));
      expect(text, isNot(contains('COMPROBANTE DE VENTA')));
      expect(text, isNot(contains('REGIMEN:')));
      expect(text, isNot(contains('RUC')));
      expect(text, isNot(contains('No. ')));
      expect(text, isNot(contains('Cliente:')));
      expect(text, isNot(contains('TOTAL')));
      expect(text, isNot(contains('Autorizacion')));
    });

    test('80mm text page keeps the same non-fiscal contract', () {
      final text = ReceiptLayoutFormatter.format80mm()
          .formatReceiptDocumentText(buildDoc());

      expect(text, contains('NO ES FACTURA'));
      expect(text, isNot(contains('FACTURA DE VENTA')));
      expect(text, isNot(contains('REGIMEN:')));
    });

    test('ESC/POS page carries the banner and no fiscal header bytes', () {
      final bytes = ReceiptLayoutFormatter.format58mm()
          .formatReceiptDocumentEscPos(buildDoc());
      final decoded = latin1.decode(bytes);

      expect(decoded, contains('NO ES FACTURA'));
      expect(decoded, contains('PRUEBA DE IMPRESION'));
      expect(decoded, isNot(contains('FACTURA DE VENTA')));
      expect(decoded, isNot(contains('REGIMEN: GENERAL')));
    });

    test('the factory marks the page as non-fiscal', () {
      expect(buildDoc().isFiscalDocument, isFalse);
    });
  });
}
