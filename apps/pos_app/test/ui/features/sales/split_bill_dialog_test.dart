import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/sales/cart_item.dart';
import 'package:pos_app/domain/services/sales/split_bill_engine.dart';
import 'package:pos_app/ui/features/sales/widgets/split_bill_dialog.dart';

void main() {
  const item1 = CartItem(
    productId: 'p-1',
    productName: 'Churrasco 12oz',
    unitPrice: 400.00,
    quantity: 1,
    taxRate: 0.15,
  ); // Subtotal: 400, Tax: 60, Total: 460

  const item2 = CartItem(
    productId: 'p-2',
    productName: 'Cerveza Toña',
    unitPrice: 60.00,
    quantity: 2,
    taxRate: 0.15,
  ); // Subtotal: 120, Tax: 18, Total: 138

  final testCart = [item1, item2]; // Cart Total: Sub 520, Tax 78, Total 598

  Widget buildDialog({
    List<CartItem>? cart,
    double commercialRate = 36.50,
    void Function(SplitBillShare share)? onPayShare,
  }) {
    return MaterialApp(
      home: Scaffold(
        body: SplitBillDialog(
          cart: cart ?? testCart,
          commercialRate: commercialRate,
          onPayShare: onPayShare,
        ),
      ),
    );
  }

  group('SplitBillDialog - TDD & Interactive Flow', () {
    testWidgets('Renders Equal Split tab by default with 2 covers and 10% suggested tip', (tester) async {
      await tester.pumpWidget(buildDialog());
      await tester.pumpAndSettle();

      // Verify Header and Tab selection
      expect(find.text('Dividir Cuenta'), findsOneWidget);
      expect(find.text('Partes Iguales'), findsOneWidget);
      expect(find.text('Por Ítems'), findsOneWidget);

      // Verify default 2 covers
      expect(find.text('2 Comensales'), findsOneWidget);

      // Verify 10% tip is selected by default (10% of 520 = C$ 52.00)
      // Total with tip: 520 sub + 78 tax + 52 tip = 650.00 -> 325.00 per cover
      expect(find.text('Propina (10%):'), findsOneWidget);
      expect(find.text('C\$ 52.00'), findsOneWidget);
      expect(find.text('Total con Propina:'), findsOneWidget);
      expect(find.text('C\$ 650.00'), findsOneWidget);
      expect(find.text('Comensal 1'), findsOneWidget);
      expect(find.text('Comensal 2'), findsOneWidget);
      expect(find.text('C\$ 325.00'), findsNWidgets(2));
    });

    testWidgets('Stepping cover count from 2 to 3 updates shares in real-time', (tester) async {
      await tester.pumpWidget(buildDialog());
      await tester.pumpAndSettle();

      // Tap '+' button to increase to 3 covers
      final plusButton = find.byKey(const Key('btn_increment_covers'));
      expect(plusButton, findsOneWidget);
      await tester.tap(plusButton);
      await tester.pumpAndSettle();

      expect(find.text('3 Comensales'), findsOneWidget);
      expect(find.text('Comensal 1'), findsOneWidget);
      expect(find.text('Comensal 2'), findsOneWidget);
      expect(find.text('Comensal 3'), findsOneWidget);

      // 650 / 3 = 216.67, 216.67, 216.66
      expect(find.text('C\$ 216.67'), findsNWidgets(2));
      expect(find.text('C\$ 216.66'), findsOneWidget);
    });

    testWidgets('Changing tip to "Sin Propina" recalculates shares without tip', (tester) async {
      await tester.pumpWidget(buildDialog());
      await tester.pumpAndSettle();

      // Tap 'Sin Propina' chip
      final noTipChip = find.byKey(const Key('tip_chip_none'));
      expect(noTipChip, findsOneWidget);
      await tester.tap(noTipChip);
      await tester.pumpAndSettle();

      // Total without tip: 520 sub + 78 tax = 598.00 -> 299.00 per cover
      expect(find.text('Propina (0%):'), findsOneWidget);
      expect(find.text('C\$ 0.00'), findsOneWidget);
      expect(find.text('Total con Propina:'), findsOneWidget);
      expect(find.text('C\$ 598.00'), findsOneWidget);
      expect(find.text('C\$ 299.00'), findsNWidgets(2));
    });

    testWidgets('Switching to "Por Ítems" tab allows assigning items to comensales', (tester) async {
      await tester.pumpWidget(buildDialog());
      await tester.pumpAndSettle();

      // Switch tab to Itemized
      await tester.tap(find.text('Por Ítems'));
      await tester.pumpAndSettle();

      expect(find.text('Asignación de Ítems'), findsOneWidget);
      expect(find.text('Churrasco 12oz'), findsOneWidget);
      expect(find.text('Cerveza Toña (x2)'), findsOneWidget);

      // Assign Item 1 to Comensal 1 (Churrasco)
      final assignItem1 = find.byKey(const Key('assign_item_p-1_cover_1'));
      expect(assignItem1, findsOneWidget);
      await tester.tap(assignItem1);
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('itemized_shares_list')), findsOneWidget);
    });

    testWidgets('Tapping "Cobrar Parte" invokes onPayShare callback with the selected share', (tester) async {
      SplitBillShare? paidShare;

      await tester.pumpWidget(
        buildDialog(
          onPayShare: (share) {
            paidShare = share;
          },
        ),
      );
      await tester.pumpAndSettle();

      final payCover1Button = find.byKey(const Key('btn_pay_share_1'));
      expect(payCover1Button, findsOneWidget);
      await tester.tap(payCover1Button);
      await tester.pumpAndSettle();

      expect(paidShare, isNotNull);
      expect(paidShare!.shareIndex, 1);
      expect(paidShare!.totalNio, 325.00);
    });
  });
}
