import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/ui/features/sales/sale_view.dart';

/// Round-2 D-3: the mobile cart is a modal bottom sheet, so a
/// `ScaffoldMessenger` SnackBar renders in the page Scaffold BEHIND it and
/// the operator had to collapse the cart to notice a refusal. The sheet now
/// renders the message in its own banner, at the top.
void main() {
  group('CartSheetErrorBanner (round-2 D-3)', () {
    testWidgets('renders the refusal copy when there is a message',
        (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: CartSheetErrorBanner(
              message: 'El descuento por recompensa (C\$ 80.00) no puede '
                  'exceder el total de la orden (C\$ 40.00).',
            ),
          ),
        ),
      );

      expect(
        find.byKey(const Key('cart_sheet_error_banner')),
        findsOneWidget,
        reason: 'the refusal must be readable without collapsing the cart',
      );
      expect(find.textContaining('no puede exceder'), findsOneWidget);
    });

    testWidgets('renders nothing when there is no message', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(home: Scaffold(body: CartSheetErrorBanner(message: null))),
      );
      expect(find.byKey(const Key('cart_sheet_error_banner')), findsNothing);

      await tester.pumpWidget(
        const MaterialApp(home: Scaffold(body: CartSheetErrorBanner(message: ''))),
      );
      expect(
        find.byKey(const Key('cart_sheet_error_banner')),
        findsNothing,
        reason: 'an empty message must not reserve space in the sheet',
      );
    });
  });
}
