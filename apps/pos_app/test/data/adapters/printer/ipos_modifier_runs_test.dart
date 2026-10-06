import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/adapters/printer/ipos_printer_adapter.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'package:pos_app/domain/models/printer/receipt_document.dart';
import 'package:pos_app/domain/services/printer/receipt_layout_formatter.dart';

/// T5 (ticket-modifier-print): the iPOS/Nyx adapter must keep the legacy
/// single-blob `printText` contract when the receipt has no small runs, and
/// send size-tagged segments (complete lines only) when modifier runs exist.
/// The concatenation of the sent segment texts must equal the original blob.

ReceiptDocument documentWithModifiers({required int paperWidthMm}) {
  return ReceiptDocument(
    businessName: 'Cafeteria La Parroquia',
    taxRegime: TaxRegime.regimenGeneral,
    documentTitle: 'FACTURA DE VENTA',
    documentNumber: '001-001-01-00000042',
    date: DateTime(2026, 1, 2, 10, 30),
    lines: [
      const ReceiptLine(
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
        ],
      ),
      const ReceiptLine(
        quantity: 1,
        description: 'Torta de Tres Leches',
        unitPrice: 80,
        taxableBase: 80,
        lineTotal: 80,
      ),
    ],
    subtotal: 310,
    totalTax: 0,
    total: 310,
    totalUsd: 8.49,
  );
}

ReceiptDocument documentWithoutModifiers() {
  return ReceiptDocument(
    businessName: 'Cafeteria La Parroquia',
    taxRegime: TaxRegime.regimenGeneral,
    documentTitle: 'FACTURA DE VENTA',
    documentNumber: '001-001-01-00000042',
    date: DateTime(2026, 1, 2, 10, 30),
    lines: const [
      ReceiptLine(
        quantity: 1,
        description: 'Capuccino',
        unitPrice: 100,
        taxableBase: 115,
        lineTotal: 115,
      ),
    ],
    subtotal: 115,
    totalTax: 0,
    total: 115,
    totalUsd: 3.15,
  );
}

/// The exact lines the formatter emits for a document's modifier extras
/// (same `wrap('  + $mod', width, '    ')` call as the item loop).
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
  TestWidgetsFlutterBinding.ensureInitialized();

  const channel = MethodChannel('com.nhilos.pos/ipos_printer');
  late List<MethodCall> calls;
  late IPosPrinterAdapter adapter;

  setUp(() {
    calls = [];
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
      calls.add(call);
      return true;
    });
    adapter = IPosPrinterAdapter(channel: channel);
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  test('the small modifier size tunable is 3/4 of the 24px body size', () {
    expect(IPosPrinterAdapter.smallModifierTextSize, 18);
  });

  test(
    'a receipt with modifiers sends size-tagged segments whose join equals the blob (58mm)',
    () async {
      const paperWidthMm = 58;
      final document = documentWithModifiers(paperWidthMm: paperWidthMm);

      final result = await adapter.printReceiptDocument(
        document,
        paperWidthMm: paperWidthMm,
      );
      expect(result.isSuccess, isTrue);

      final printCalls =
          calls.where((call) => call.method == 'printText').toList();
      expect(printCalls, hasLength(1));
      final args = printCalls.single.arguments as Map;
      expect(args['paperWidthMm'], paperWidthMm);

      final segments = args['segments'] as List;
      expect(segments, isNotEmpty);

      final normalSegments = segments
          .where((segment) => !(segment as Map).containsKey('textSize'))
          .toList();
      final smallSegments = segments
          .where((segment) =>
              (segment as Map).containsKey('textSize') &&
              segment['textSize'] == IPosPrinterAdapter.smallModifierTextSize)
          .toList();

      // Normal segments leave textSize absent: the native handler keeps its
      // current effective size untouched.
      expect(normalSegments, isNotEmpty);
      // Small segments carry exactly the 18px tunable.
      expect(smallSegments, isNotEmpty);
      for (final segment in segments) {
        final map = segment as Map;
        if (map.containsKey('textSize')) {
          expect(map['textSize'], IPosPrinterAdapter.smallModifierTextSize);
        }
      }

      // Only modifier lines may travel in small segments.
      final expected =
          expectedModifierLines(ReceiptLayoutFormatter.fromPaperWidth(58), document);
      for (final segment in smallSegments) {
        for (final line in ((segment as Map)['text'] as String)
            .split('\n')
            .where((l) => l.isNotEmpty)) {
          expect(expected.contains(line), isTrue,
              reason: 'small segment leaked a non-modifier line: "$line"');
        }
      }
      // And no modifier line may travel at normal size.
      for (final segment in normalSegments) {
        final lines = ((segment as Map)['text'] as String).split('\n');
        expect(lines.any(expected.contains), isFalse,
            reason: 'modifier line rendered at normal size');
      }

      // Exact newline equivalence: join of segment texts == original blob,
      // and every non-final segment ends at a complete line boundary.
      final rebuilt =
          segments.map((segment) => (segment as Map)['text'] as String).join();
      expect(
        rebuilt,
        ReceiptLayoutFormatter.fromPaperWidth(paperWidthMm)
            .formatReceiptDocumentText(document),
      );
      for (final segment in segments.take(segments.length - 1)) {
        expect(((segment as Map)['text'] as String).endsWith('\n'), isTrue);
      }
    },
  );

  test(
    'a receipt with modifiers sends size-tagged segments whose join equals the blob (80mm)',
    () async {
      const paperWidthMm = 80;
      final document = documentWithModifiers(paperWidthMm: paperWidthMm);

      final result = await adapter.printReceiptDocument(
        document,
        paperWidthMm: paperWidthMm,
      );
      expect(result.isSuccess, isTrue);

      final args =
          calls.where((call) => call.method == 'printText').single.arguments
              as Map;
      expect(args['paperWidthMm'], paperWidthMm);

      final segments = args['segments'] as List;
      final rebuilt =
          segments.map((segment) => (segment as Map)['text'] as String).join();
      expect(
        rebuilt,
        ReceiptLayoutFormatter.fromPaperWidth(paperWidthMm)
            .formatReceiptDocumentText(document),
      );
      expect(
        segments.any((segment) =>
            (segment as Map)['textSize'] ==
            IPosPrinterAdapter.smallModifierTextSize),
        isTrue,
      );
    },
  );

  test(
    'a receipt without modifiers keeps the legacy single-blob printText contract',
    () async {
      const paperWidthMm = 58;
      final document = documentWithoutModifiers();

      final result = await adapter.printReceiptDocument(
        document,
        paperWidthMm: paperWidthMm,
      );
      expect(result.isSuccess, isTrue);

      final printCalls =
          calls.where((call) => call.method == 'printText').toList();
      expect(printCalls, hasLength(1));
      final args = printCalls.single.arguments as Map;
      expect(args.containsKey('segments'), isFalse,
          reason: 'no small runs: the method-channel contract must not change');
      expect(
        args['text'],
        ReceiptLayoutFormatter.fromPaperWidth(paperWidthMm)
            .formatReceiptDocumentText(document),
      );
      expect(args['paperWidthMm'], paperWidthMm);
    },
  );
}
