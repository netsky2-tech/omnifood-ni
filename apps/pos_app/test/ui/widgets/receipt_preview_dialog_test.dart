import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'package:pos_app/ui/widgets/receipt_preview_dialog.dart';

void main() {
  Widget buildTestWidget({
    TaxRegime initialTaxRegime = TaxRegime.cuotaFija,
    int initialPaperWidthMm = 58,
  }) {
    return MaterialApp(
      home: Scaffold(
        body: Builder(
          builder: (context) => ElevatedButton(
            onPressed: () => ReceiptPreviewDialog.show(
              context,
              initialTaxRegime: initialTaxRegime,
              initialPaperWidthMm: initialPaperWidthMm,
            ),
            child: const Text('Open Preview'),
          ),
        ),
      ),
    );
  }

  group('ReceiptPreviewDialog Tests', () {
    testWidgets('renders dialog with monospaced sample receipt and initial Cuota Fija text', (tester) async {
      await tester.pumpWidget(buildTestWidget(initialTaxRegime: TaxRegime.cuotaFija));

      // Tap to open dialog
      await tester.tap(find.text('Open Preview'));
      await tester.pumpAndSettle();

      expect(find.text('Preview de Comprobante Térmico'), findsOneWidget);
      expect(find.textContaining('58 mm (32 columnas)'), findsOneWidget);

      // Verify Cuota Fija texts are visible in preview
      expect(find.textContaining('REGIMEN: CUOTA FIJA'), findsOneWidget);
      expect(find.textContaining('COMPROBANTE DE VENTA'), findsOneWidget);
      expect(find.textContaining('NO RECAUDA IVA'), findsOneWidget);
      expect(find.textContaining('IVA (15%):'), findsNothing);

      // Verify monospace typography
      final textWidget = tester.widget<Text>(find.byWidgetPredicate(
        (widget) => widget is Text && widget.data != null && widget.data!.contains('COMPROBANTE DE VENTA'),
      ));
      expect(textWidget.style?.fontFamily, 'monospace');
    });

    testWidgets('toggling between 58mm and 80mm updates header and columns', (tester) async {
      await tester.pumpWidget(buildTestWidget(initialPaperWidthMm: 58));

      await tester.tap(find.text('Open Preview'));
      await tester.pumpAndSettle();

      expect(find.textContaining('58 mm (32 columnas)'), findsOneWidget);

      // Switch to 80mm
      await tester.tap(find.text('80 mm (48 col)'));
      await tester.pumpAndSettle();

      expect(find.textContaining('80 mm (48 columnas)'), findsOneWidget);
    });

    testWidgets('toggling regime switches between Cuota Fija and Régimen General', (tester) async {
      await tester.pumpWidget(buildTestWidget(initialTaxRegime: TaxRegime.cuotaFija));

      await tester.tap(find.text('Open Preview'));
      await tester.pumpAndSettle();

      expect(find.textContaining('COMPROBANTE DE VENTA'), findsOneWidget);
      expect(find.textContaining('IVA (15%):'), findsNothing);

      // Switch to Régimen General
      await tester.tap(find.text('Régimen Gral.'));
      await tester.pumpAndSettle();

      expect(find.textContaining('FACTURA DE VENTA'), findsOneWidget);
      expect(find.textContaining('REGIMEN: GENERAL'), findsOneWidget);
      expect(find.textContaining('IVA (15%):'), findsOneWidget);
    });
  });
}
