import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'package:pos_app/domain/models/printer/receipt_document.dart';
import 'package:pos_app/domain/services/printer/receipt_layout_formatter.dart';

/// T5 (ticket-modifier-print): the segmented runs API must reproduce the
/// plain-text receipt byte-for-byte while tagging every modifier line
/// (`  + ...`) as a small-font run. Layout invariants (column widths,
/// ordering, wrapping) stay untouched.

ReceiptDocument documentWithModifiers({bool isReprint = false}) {
  return ReceiptDocument(
    businessName: 'Cafeteria La Parroquia',
    taxRegime: TaxRegime.regimenGeneral,
    documentTitle: 'FACTURA DE VENTA',
    documentNumber: '001-001-01-00000042',
    date: DateTime(2026, 1, 2, 10, 30),
    cashierName: 'Maria Lopez',
    lines: const [
      ReceiptLine(
        quantity: 2,
        description: 'Capuccino',
        unitPrice: 100,
        taxableBase: 230,
        lineTotal: 230,
        modifierDisplays: [
          ReceiptModifierDisplay(
            name: 'Extra Shot',
            displayAmount: 'C\$ 15.00',
            scope: 'por unidad',
          ),
          ReceiptModifierDisplay(
            name: 'Leche de Almendras',
            scope: 'por unidad',
          ),
        ],
        notes: 'Servir en vaso grande para llevar',
      ),
      ReceiptLine(
        quantity: 1,
        description:
            'Torta de Tres Leches con un nombre bastante largo para forzar wrap',
        unitPrice: 80,
        taxableBase: 80,
        lineTotal: 80,
        // Legacy string-modifier path must behave like modifier displays.
        modifiers: ['Sin Azucar'],
      ),
    ],
    subtotal: 310,
    totalTax: 0,
    total: 310,
    totalUsd: 8.49,
    payments: [
      ReceiptPayment(
        methodLabel: 'Efectivo C\$',
        currency: 'NIO',
        amount: 310,
      ),
    ],
    isReprint: isReprint,
    reprintAt: isReprint ? DateTime(2026, 1, 3, 9, 0) : null,
  );
}

ReceiptDocument documentWithoutModifiers() {
  final doc = documentWithModifiers();
  return ReceiptDocument(
    businessName: doc.businessName,
    taxRegime: doc.taxRegime,
    documentTitle: doc.documentTitle,
    documentNumber: doc.documentNumber,
    date: doc.date,
    cashierName: doc.cashierName,
    lines: const [
      ReceiptLine(
        quantity: 2,
        description: 'Capuccino',
        unitPrice: 100,
        taxableBase: 230,
        lineTotal: 230,
      ),
    ],
    subtotal: 230,
    totalTax: 0,
    total: 230,
    totalUsd: 6.30,
  );
}

List<String> runLines(ReceiptTextRun run) {
  final lines = run.text.split('\n');
  if (lines.isNotEmpty && lines.last.isEmpty) lines.removeLast();
  return lines;
}

/// The exact lines the formatter emits for a document's modifier extras:
/// the same `wrap('  + $mod', contentWidth, '    ')` call the item loop
/// uses. `wrap` trims the leading two spaces of the first line and hangs a
/// 4-space indent on continuations, so these are the authoritative shapes.
Set<String> expectedModifierLines(
  ReceiptLayoutFormatter formatter,
  ReceiptDocument doc,
) {
  final lines = <String>{};
  for (final line in doc.lines) {
    final mods = line.modifierDisplays.isNotEmpty
        ? line.modifierDisplays.map((m) => m.printableText)
        : line.modifiers;
    for (final mod in mods) {
      lines.addAll(formatter.wrap('  + $mod', formatter.maxCols, '    '));
    }
  }
  return lines;
}

void main() {
  group('formatReceiptDocumentTextRuns (T5: modifiers in small font)', () {
    for (final (label, formatter, maxCols) in [
      ('58mm', ReceiptLayoutFormatter.format58mm(), 32),
      ('80mm', ReceiptLayoutFormatter.format80mm(), 40),
    ]) {
      group(label, () {
        test('run concatenation is byte-for-byte the plain text (with modifiers)',
            () {
          final doc = documentWithModifiers();
          final runs = formatter.formatReceiptDocumentTextRuns(doc);
          expect(
            runs.map((run) => run.text).join(),
            formatter.formatReceiptDocumentText(doc),
          );
        });

        test('run concatenation is byte-for-byte the plain text (no modifiers)',
            () {
          final doc = documentWithoutModifiers();
          final runs = formatter.formatReceiptDocumentTextRuns(doc);
          expect(
            runs.map((run) => run.text).join(),
            formatter.formatReceiptDocumentText(doc),
          );
        });

        test('every modifier extra line belongs to a small run', () {
          final doc = documentWithModifiers();
          final runs = formatter.formatReceiptDocumentTextRuns(doc);
          final expected = expectedModifierLines(formatter, doc);
          expect(expected, isNotEmpty);

          final smallLines = <String>{};
          final normalLines = <String>{};
          for (final run in runs) {
            (run.size == ReceiptTextRunSize.small
                    ? smallLines
                    : normalLines)
                .addAll(runLines(run));
          }

          // Small runs carry EXACTLY the modifier lines, and no modifier
          // line may render at normal size.
          expect(smallLines, expected);
          expect(normalLines.intersection(expected), isEmpty);
        });

        test('a document without modifiers produces only normal runs', () {
          final doc = documentWithoutModifiers();
          final runs = formatter.formatReceiptDocumentTextRuns(doc);
          expect(runs, isNotEmpty);
          expect(
            runs.every((run) => run.size == ReceiptTextRunSize.normal),
            isTrue,
          );
        });

        test('every emitted line fits the printable width invariant', () {
          final doc = documentWithModifiers();
          final runs = formatter.formatReceiptDocumentTextRuns(doc);
          for (final run in runs) {
            for (final line in runLines(run)) {
              expect(line.length, lessThanOrEqualTo(maxCols),
                  reason: 'line exceeds $maxCols columns: "$line"');
            }
          }
        });

        test('ordering stays item -> modifiers -> notes', () {
          final doc = documentWithModifiers();
          final runs = formatter.formatReceiptDocumentTextRuns(doc);
          final text = runs.map((run) => run.text).join();

          final itemIndex = text.indexOf('Capuccino');
          final modifierIndex = text.indexOf('+ Extra Shot');
          final notesIndex = text.indexOf('* Servir en vaso grande');
          expect(itemIndex, greaterThanOrEqualTo(0));
          expect(modifierIndex, greaterThan(itemIndex));
          expect(notesIndex, greaterThan(modifierIndex));
        });

        test('reprinted documents with modifiers inherit the segmentation', () {
          final doc = documentWithModifiers(isReprint: true);
          final runs = formatter.formatReceiptDocumentTextRuns(doc);
          expect(
            runs.map((run) => run.text).join(),
            formatter.formatReceiptDocumentText(doc),
          );
          final expected = expectedModifierLines(formatter, doc);
          expect(
            runs.any((run) =>
                run.size == ReceiptTextRunSize.small &&
                runLines(run).any(expected.contains)),
            isTrue,
          );
        });

        test('runs split only on complete lines', () {
          final doc = documentWithModifiers();
          final runs = formatter.formatReceiptDocumentTextRuns(doc);
          for (final run in runs.take(runs.length - 1)) {
            expect(run.text.endsWith('\n'), isTrue,
                reason: 'a mid-receipt run must end at a line boundary');
          }
        });
      });
    }
  });
}
