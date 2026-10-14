import 'dart:ui' show FontFeature;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/domain/models/config/tenant_config.dart';
import 'package:pos_app/domain/models/sales/cart_item.dart';
import 'package:pos_app/domain/services/config/business_mode_evaluator.dart';
import 'package:pos_app/ui/design_system/nhilos_tokens.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/ui/features/sales/sale_view.dart';
import 'package:provider/provider.dart';

import 'sale_view_loyalty_warning_test.mocks.dart';

/// §29, §34.1 and §39 of the terminal experience standard on the cart surface:
/// financial figures never wobble while the operator counts change, the item
/// counter counts what it says it counts, and an empty cart says what to do
/// next instead of only announcing its emptiness.
CartItem _item({int quantity = 1, double unitPrice = 50}) => CartItem(
      productId: 'prod-1',
      productName: 'Galletas Oreo 6pk',
      quantity: quantity.toDouble(),
      unitPrice: unitPrice,
      taxRate: 0.15,
    );

void main() {
  late MockSaleViewModel mockViewModel;

  setUp(() {
    mockViewModel = MockSaleViewModel();
    when(mockViewModel.cart).thenReturn(const []);
    when(mockViewModel.tipAmount).thenReturn(0.0);
    when(mockViewModel.grandTotalWithTip).thenReturn(0.0);
    when(mockViewModel.total).thenReturn(0.0);
    // Members the cart summary reads on every build.
    when(mockViewModel.errorMessage).thenReturn(null);
    when(mockViewModel.grossSubtotal).thenReturn(0.0);
    when(mockViewModel.subtotal).thenReturn(0.0);
    when(mockViewModel.totalTax).thenReturn(0.0);
    when(mockViewModel.totalDiscounts).thenReturn(0.0);
    when(mockViewModel.manualDiscount).thenReturn(0.0);
    when(mockViewModel.loyaltyDiscount).thenReturn(0.0);
    when(mockViewModel.promoDiscounts).thenReturn(0.0);
    when(mockViewModel.isGlobalTaxExempt).thenReturn(false);
    when(mockViewModel.supportsBuzzerPager).thenReturn(false);
    when(mockViewModel.buzzerNumber).thenReturn('');
    when(mockViewModel.customerName).thenReturn(null);
    when(mockViewModel.selectedCustomer).thenReturn(null);
    when(mockViewModel.manualDiscountLimitLabel).thenReturn('');
    when(mockViewModel.maxDiscountAmountCap).thenReturn(0.0);
    when(mockViewModel.maxDiscountPercentCap).thenReturn(0.0);
    when(
      mockViewModel.businessModeEvaluator,
    ).thenReturn(const BusinessModeEvaluator(TenantConfig()));
  });

  Future<void> pump(WidgetTester tester, Widget child) async {
    await tester.pumpWidget(
      ChangeNotifierProvider<SaleViewModel>.value(
        value: mockViewModel,
        child: MaterialApp(
          // Same onSurface contract the app installs in main.dart, so the
          // amount colours asserted below are the product tokens.
          theme: ThemeData(
            useMaterial3: true,
            colorScheme: const ColorScheme.light(
              primary: NhilosColors.brandPrimary,
              onSurface: NhilosColors.textPrimary,
            ),
          ),
          home: Scaffold(body: child),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  group('MobileFloatingCartBar — el contador dice la verdad (§34.1, §39)', () {
    testWidgets('una unidad se anuncia en singular', (tester) async {
      when(mockViewModel.cart).thenReturn([_item()]);

      await pump(tester, MobileFloatingCartBar(onTap: () {}));

      expect(find.text('1 producto agregado'), findsOneWidget);
      expect(find.text('1 productos agregados'), findsNothing);
    });

    testWidgets('varias unidades se anuncian en plural y coinciden con el '
        'badge', (tester) async {
      when(mockViewModel.cart).thenReturn([_item(quantity: 3)]);

      await pump(tester, MobileFloatingCartBar(onTap: () {}));

      expect(find.text('3 productos agregados'), findsOneWidget);
      expect(
        find.descendant(of: find.byType(Badge), matching: find.text('3')),
        findsOneWidget,
        reason: 'el badge y el texto no pueden contar cosas distintas',
      );
    });

    testWidgets('el total usa números tabulares', (tester) async {
      when(mockViewModel.cart).thenReturn([_item(quantity: 3)]);
      when(mockViewModel.total).thenReturn(150.0);

      await pump(tester, MobileFloatingCartBar(onTap: () {}));

      final total = tester.widget<Text>(find.textContaining('Total:'));
      expect(
        total.style?.fontFeatures,
        contains(const FontFeature.tabularFigures()),
      );
    });
  });

  group('CartSidebar — precisión y estados (§29, §34.1)', () {
    testWidgets('el precio de cada línea usa números tabulares', (tester) async {
      when(mockViewModel.cart).thenReturn([_item(quantity: 2, unitPrice: 50)]);

      await pump(tester, const CartSidebar());

      final lineTotal = tester.widget<Text>(find.text('C\$ 100.00'));
      expect(
        lineTotal.style?.fontFeatures,
        contains(const FontFeature.tabularFigures()),
        reason: 'los montos del carrito no bailan al cambiar cantidades',
      );
      // §46: amounts are critical operation text, so they need the AAA-level
      // primary colour, not ListTile's default secondary grey (Slate 500 on
      // white is AA only).
      expect(lineTotal.style?.color, NhilosColors.textPrimary);
    });

    testWidgets('el carrito vacío orienta al siguiente paso', (tester) async {
      await pump(tester, const CartSidebar());

      expect(find.text('Carrito vacío'), findsOneWidget);
      expect(
        find.textContaining('Tocá un producto'),
        findsOneWidget,
        reason: 'un vacío válido orienta, no solo informa (§29)',
      );
    });
  });
}
