import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'package:pos_app/ui/widgets/receipt_preview_dialog.dart';

/// D-17 loop-closer: the sample-mode preview must show the fiscal
/// authorization line, exactly as the printed paper would. A preview that
/// disagrees with the paper is worse than no preview, because it is trusted.
/// Placed under the config feature because that is where the operator opens
/// the preview (Hardware Settings) to verify D-17 before go-live.
void main() {
  Widget buildTestWidget() {
    return MaterialApp(
      home: Scaffold(
        body: Builder(
          builder: (context) => ElevatedButton(
            onPressed: () => ReceiptPreviewDialog.show(
              context,
              initialTaxRegime: TaxRegime.regimenGeneral,
              initialPaperWidthMm: 80,
            ),
            child: const Text('Open Preview'),
          ),
        ),
      ),
    );
  }

  testWidgets('sample-mode preview shows the fiscal authorization line',
      (tester) async {
    await tester.pumpWidget(buildTestWidget());
    await tester.tap(find.text('Open Preview'));
    await tester.pumpAndSettle();

    expect(find.textContaining('Autorización DGI'), findsOneWidget);
  });
}
