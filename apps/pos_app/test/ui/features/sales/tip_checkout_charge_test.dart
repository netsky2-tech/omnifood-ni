import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/domain/models/sales/cart_item.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/ui/features/sales/widgets/multi_currency_checkout_dialog.dart';
import 'package:provider/provider.dart';

import 'multi_currency_checkout_dialog_test.mocks.dart';

/// D-7: the tip must actually be CHARGED. Once a tip is applied, every
/// operator-facing charge surface (checkout dialog total, tender seeding,
/// collected payment) must use `grandTotalWithTip`, never the fiscal
/// `total` that excludes the voluntary tip (DGI INV-16.1).
void main() {
  late MockSaleViewModel mockSaleViewModel;

  setUp(() {
    mockSaleViewModel = MockSaleViewModel();
    when(mockSaleViewModel.total).thenReturn(115.00);
    when(mockSaleViewModel.grandTotalWithTip).thenReturn(125.00);
    when(mockSaleViewModel.tipAmount).thenReturn(10.00);
    when(mockSaleViewModel.subtotal).thenReturn(100.00);
    when(mockSaleViewModel.totalTax).thenReturn(15.00);
    when(mockSaleViewModel.commercialRate).thenReturn(36.50);
    when(mockSaleViewModel.bcnOfficialRate).thenReturn(36.6241);
    when(mockSaleViewModel.checkoutFxMode).thenReturn('COMMERCIAL');
    when(mockSaleViewModel.activeCheckoutRate).thenReturn(36.50);
    when(mockSaleViewModel.activeCheckoutRateLabel)
        .thenReturn('TC Comercial: 36.50');
    when(mockSaleViewModel.isLoading).thenReturn(false);
    when(mockSaleViewModel.supportsBuzzerPager).thenReturn(false);
    when(mockSaleViewModel.supportsTables).thenReturn(false);
    when(mockSaleViewModel.errorMessage).thenReturn(null);
    when(mockSaleViewModel.buzzerNumber).thenReturn(null);
    when(mockSaleViewModel.customerName).thenReturn(null);
    when(mockSaleViewModel.customerTaxId).thenReturn(null);
    when(mockSaleViewModel.tenantConfig).thenReturn(null);
    when(mockSaleViewModel.cart).thenReturn([
      CartItem(
        productId: 'p-1',
        productName: 'Café Especial',
        quantity: 1,
        unitPrice: 100.00,
        taxRate: 0.15,
      ),
    ]);
  });

  Widget buildTestWidget() {
    return MaterialApp(
      home: ChangeNotifierProvider<SaleViewModel>.value(
        value: mockSaleViewModel,
        child: const Scaffold(
          body: MultiCurrencyCheckoutDialog(),
        ),
      ),
    );
  }

  testWidgets(
    'checkout dialog shows the grand total WITH tip as "Total a Cobrar"',
    (tester) async {
      tester.view.physicalSize = const Size(1024, 768);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      // Fiscal total 115 + tip 10 = 125 confirmed by the operator.
      expect(find.text('C\$ 125.00'), findsOneWidget);
      expect(find.text('C\$ 115.00'), findsNothing);

      // The tip amount itself is surfaced on the checkout header.
      expect(find.text('C\$ 10.00'), findsOneWidget);
    },
  );

  testWidgets(
    'cash tender is pre-seeded with the grand total with tip and the '
    'collected payment equals what the operator confirmed',
    (tester) async {
      tester.view.physicalSize = const Size(1024, 768);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      when(mockSaleViewModel.processSale(
        any,
        customPayments: anyNamed('customPayments'),
        buzzerNumber: anyNamed('buzzerNumber'),
        customerName: anyNamed('customerName'),
      )).thenAnswer((_) async {});

      await tester.tap(find.widgetWithText(FilledButton, 'COBRAR'));
      await tester.pumpAndSettle();

      final capturedPayments = verify(mockSaleViewModel.processSale(
        any,
        customPayments: captureAnyNamed('customPayments'),
        buzzerNumber: anyNamed('buzzerNumber'),
        customerName: anyNamed('customerName'),
      )).captured.single as List<Payment>;

      expect(capturedPayments, hasLength(1));
      expect(capturedPayments.single.amountNio, 125.00);
      expect(capturedPayments.single.amount, 125.00);
    },
  );
}
