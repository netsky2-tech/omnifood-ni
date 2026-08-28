import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/sales/cart_item.dart';
import 'package:pos_app/ui/features/sales/widgets/split_bill_dialog.dart';

void main() {
  const item1 = CartItem(
    productId: 'p-1',
    productName: 'Churrasco 12oz',
    unitPrice: 400.00,
    quantity: 1,
    taxRate: 0.15,
  );
  const item2 = CartItem(
    productId: 'p-2',
    productName: 'Cerveza Toña',
    unitPrice: 60.00,
    quantity: 2,
    taxRate: 0.15,
  );
  final testCart = [item1, item2];

  Widget buildDialog({required Size surfaceSize}) {
    return MaterialApp(
      home: MediaQuery(
        data: MediaQueryData(size: surfaceSize),
        child: Scaffold(
          body: SplitBillDialog(
            cart: testCart,
            commercialRate: 36.50,
          ),
        ),
      ),
    );
  }

  group('ResponsiveSplitCheckout - Sunmi V2s Handheld & Desktop Adaptation', () {
    testWidgets('Sunmi V2s Handheld (360x720dp) renders compact vertical layout without RenderFlex overflow',
        (tester) async {
      tester.view.physicalSize = const Size(360, 720);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);

      await tester.pumpWidget(buildDialog(surfaceSize: const Size(360, 720)));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('split_dialog_compact_layout')), findsOneWidget);
      expect(find.byKey(const Key('split_dialog_desktop_layout')), findsNothing);
      expect(find.text('Dividir Cuenta'), findsOneWidget);
      expect(find.byKey(const Key('btn_increment_covers')), findsOneWidget);
      expect(tester.takeException(), isNull); // No RenderFlex overflow
    });

    testWidgets('Tablet/Desktop (1024x768dp) renders dual-pane side-by-side layout', (tester) async {
      tester.view.physicalSize = const Size(1024, 768);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);

      await tester.pumpWidget(buildDialog(surfaceSize: const Size(1024, 768)));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('split_dialog_desktop_layout')), findsOneWidget);
      expect(find.byKey(const Key('split_dialog_compact_layout')), findsNothing);
      expect(find.text('Dividir Cuenta'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });
}
