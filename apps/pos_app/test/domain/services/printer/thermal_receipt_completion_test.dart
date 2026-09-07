import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'package:pos_app/domain/models/printer/receipt_document.dart';
import 'package:pos_app/domain/models/sales/cashier_session.dart';
import 'package:pos_app/domain/services/printer/receipt_58mm_formatter.dart';
import 'package:pos_app/domain/services/printer/receipt_layout_formatter.dart';

void _expectWidth(String text, int width) {
  expect(text.split('\n').every((line) => line.length <= width), isTrue, reason: text.split('\n').where((line) => line.length > width).join('|'));
}

void main() {
  group('thermal receipt completion regressions', () {
    test('codec handles all Spanish, decomposed, punctuation, emoji, and unsupported-script samples', () {
      final formatter = ReceiptLayoutFormatter.format58mm();
      const samples = ['á é í ó ú', 'Á É Í Ó Ú', 'ñ Ñ', 'ü Ü', 'Cédula', 'Módulo', 'Jamón', 'Café', 'Descripción', 'Córdoba', 'Cafe\u0301', '😀', '“comillas”', 'uno — dos', '中文'];
      for (final input in samples) {
        expect(() => formatter.normalizePrintableText(input), returnsNormally);
        final output = formatter.normalizePrintableText(input);
        expect(output.codeUnits.every((unit) => unit <= 0xff), isTrue);
        expect(formatter.wrap(output).every((line) => line.length <= 32), isTrue);
      }
    });

    test('dividers are dynamic exact-width rules for 58 and 80mm', () {
      for (final formatter in [ReceiptLayoutFormatter.format58mm(), ReceiptLayoutFormatter.format80mm()]) {
        expect(formatter.divider(), hasLength(formatter.maxCols));
        expect(formatter.doubleDivider(), hasLength(formatter.maxCols));
      }
      // Receipt58mmFormatter's literal rules are intentionally classified by this
      // regression: every public 58mm text formatter must emit 32-column rules.
      expect(Receipt58mmFormatter.divider(), hasLength(32));
    });

    test('58mm extreme descriptions, quantities, amounts, modifiers, customer and cashier stay printable', () {
      final formatter = ReceiptLayoutFormatter.format58mm();
      const amount = 9999999.99;
      final document = ReceiptDocument(
        businessName: 'Negocio', taxRegime: TaxRegime.regimenGeneral, documentTitle: 'FACTURA', documentNumber: '1', date: DateTime(2026),
        cashierName: 'Cajero con nombre extraordinariamente largo', customerName: 'Cliente con nombre extraordinariamente largo',
        lines: const [ReceiptLine(quantity: 1000, description: 'Supercalifragilisticoespialidoso descripción extremadamente larga', unitPrice: amount, taxableBase: amount, lineSubtotal: amount, lineTotal: amount, modifiers: ['Extra Jamón C\$ 1.00', 'Queso C\$ 2.00', 'Café C\$ 3.00'])],
        subtotal: amount, totalTax: amount, total: amount, totalUsd: 0,
      );
      final text = formatter.formatReceiptDocumentText(document);
      _expectWidth(text, 32);
      expect(text, contains('1000'));
      expect(text, contains(ReceiptLayoutFormatter.formatMoney(amount)));
    });

    test('80mm monetary and quantity boundaries align normal totals and preserve fallback values', () {
      final formatter = ReceiptLayoutFormatter.format80mm();
      const amounts = [0.01, 9.99, 10.00, 99.99, 100.00, 999.99, 1000.00, 9999.99, 9999999.99];
      const quantities = [1.0, 9.0, 10.0, 99.0, 100.0, 999.0, 1000.0, 0.5, 1.25, 12.50, 999.99];
      for (final amount in amounts) {
        final money = ReceiptLayoutFormatter.formatMoney(amount);
        final normal = formatter.formatItemRow(quantity: 1, name: 'Producto normal', unitPrice: amount, total: amount);
        expect(normal.first.lastIndexOf(money) + money.length, 48);
        for (final quantity in quantities) {
          final rows = formatter.formatItemRow(quantity: quantity, name: 'Descripción larga con varios modificadores', unitPrice: amount, total: amount);
          expect(rows.every((line) => line.length <= 48), isTrue);
          expect(rows.join('\n'), contains(money));
        }
      }
      final fallback = formatter.formatItemRow(quantity: 1000000000, name: 'Descripción extraordinariamente larga para fallback', unitPrice: 999999999999999.99, total: 999999999999999.99);
      expect(fallback.every((line) => line.length <= 48), isTrue);
      expect(fallback.join('\n'), contains('1000000000'));
      expect(fallback.join('\n'), contains('C\$ 1,000,000,000,000,000.00'));
    });

    test('kitchen, Corte X, Corte Z, and FIFO label retain extreme key information within 32 columns', () {
      final kitchen = Receipt58mmFormatter.formatKitchenOrderText(
        ticketId: 'TK-EXTREMO-000000000000', orderTitle: 'Orden extraordinariamente larga', cashierName: 'Cajero extraordinariamente largo', timestamp: DateTime(2026), items: const [], tableName: 'Mesa extraordinariamente larga',
      );
      final session = CashierSession(id: 'id', userId: 'user', terminalId: 'TERMINAL-EXTRAORDINARIAMENTE-LARGO', openedAt: DateTime(2026), openingBalanceNio: 9999999.99, openingBalanceUsd: 9999999.99, expectedNio: 9999999.99);
      final corteX = Receipt58mmFormatter.formatCorteXText(session, cashierName: 'Cajero extraordinariamente largo', totalsByMethod: const {});
      final corteZ = Receipt58mmFormatter.formatCorteZText(session, cashierName: 'Cajero extraordinariamente largo', totalsByMethod: const {}, zSequence: 999999);
      final label = Receipt58mmFormatter.formatProductionBatchLabelText(productName: 'Producto extraordinariamente largo que no debe truncarse', batchCode: 'LOTE-EXTREMO-000000000000000', quantity: 999999.99, uom: 'kilogramos', productionDate: DateTime(2026), expirationDate: DateTime(2026, 12, 31), operatorName: 'Operador extraordinariamente largo');
      for (final text in [kitchen, corteX, corteZ, label]) {
        _expectWidth(text, 32);
      }
      expect(kitchen.replaceAll(RegExp(r'\s+'), ' '), contains('Mesa extraordinariamente larga'));
      expect(corteX.replaceAll(RegExp(r'\s+'), ''), contains('TERMINAL-EXTRAORDINARIAMENTE-LARGO'));
      expect(corteZ, contains('999999'));
      expect(label.replaceAll(RegExp(r'\s+'), ' '), contains('Producto extraordinariamente largo que no debe truncarse'));
    });

    test('renderer treats receipt document monetary and modifier display fields as authoritative', () {
      final doc = ReceiptDocument(
        businessName: 'Prueba', taxRegime: TaxRegime.regimenGeneral, documentTitle: 'FACTURA', documentNumber: '1', date: DateTime(2026),
        lines: const [ReceiptLine(quantity: 2, description: 'Producto', unitPrice: 10, taxableBase: 123.45, lineSubtotal: 123.45, lineTotal: 999.99, modifierDisplays: [ReceiptModifierDisplay(name: 'Extra', scope: 'por línea', displayAmount: 'C\$ 7.77')])],
        subtotal: 123.45, totalTax: 876.54, total: 999.99, totalUsd: 0,
      );
      final text = ReceiptLayoutFormatter.format58mm().formatReceiptDocumentText(doc);
      expect(text, contains('C\$ 123.45'));
      expect(text, contains('Extra (por línea: C\$ 7.77)'));
      expect(text, isNot(contains('C\$ 15.54')));
    });
  });
}
