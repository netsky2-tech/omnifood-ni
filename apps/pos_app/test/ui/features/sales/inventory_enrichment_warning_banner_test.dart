import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/ui/features/sales/widgets/inventory_enrichment_warning_banner.dart';

void main() {
  group('InventoryEnrichmentWarningBanner (Slice 11)', () {
    testWidgets('renders SizedBox.shrink when pending count is 0', (
      tester,
    ) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: InventoryEnrichmentWarningBanner(initialPendingCount: 0),
          ),
        ),
      );

      expect(
        find.byKey(const Key('inventory_enrichment_warning_banner')),
        findsNothing,
      );
    });

    testWidgets(
      'renders warning banner when pending count is greater than 0 without blocking UI',
      (tester) async {
        await tester.pumpWidget(
          const MaterialApp(
            home: Scaffold(
              body: Column(
                children: [
                  InventoryEnrichmentWarningBanner(initialPendingCount: 3),
                  ElevatedButton(
                    key: Key('checkout_button'),
                    onPressed: null,
                    child: Text('Checkout'),
                  ),
                ],
              ),
            ),
          ),
        );

        expect(
          find.byKey(const Key('inventory_enrichment_warning_banner')),
          findsOneWidget,
        );
        expect(
          find.textContaining('3 ventas con inventario pendiente'),
          findsOneWidget,
        );
        // Checkout button remains present and unblocked
        expect(find.byKey(const Key('checkout_button')), findsOneWidget);
      },
    );
  });
}
