import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';
import 'package:provider/provider.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/models/sales/cart_item.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/ui/features/sales/widgets/multi_currency_checkout_dialog.dart';

import 'multi_currency_checkout_dialog_test.mocks.dart';

@GenerateMocks([SaleViewModel])
void main() {
  late MockSaleViewModel mockSaleViewModel;

  setUp(() {
    mockSaleViewModel = MockSaleViewModel();
    when(mockSaleViewModel.total).thenReturn(365.00);
    when(mockSaleViewModel.subtotal).thenReturn(365.00);
    when(mockSaleViewModel.totalTax).thenReturn(0.00);
    when(mockSaleViewModel.commercialRate).thenReturn(36.50);
    when(mockSaleViewModel.bcnOfficialRate).thenReturn(36.6241);
    when(mockSaleViewModel.isLoading).thenReturn(false);
    when(mockSaleViewModel.supportsBuzzerPager).thenReturn(false);
    when(mockSaleViewModel.supportsTables).thenReturn(true);
    when(mockSaleViewModel.buzzerNumber).thenReturn(null);
    when(mockSaleViewModel.customerName).thenReturn(null);
    when(mockSaleViewModel.tenantConfig).thenReturn(null);
    when(mockSaleViewModel.cart).thenReturn([
      CartItem(
        productId: 'p-1',
        productName: 'Café Especial',
        quantity: 1,
        unitPrice: 365.00,
        taxRate: 0.0,
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

  testWidgets('renders multi-currency amounts and exchange rates correctly', (tester) async {
    tester.view.physicalSize = const Size(1024, 768);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() => tester.view.resetPhysicalSize());

    await tester.pumpWidget(buildTestWidget());
    await tester.pumpAndSettle();

    // Check header displays NIO total and USD total at commercial rate
    expect(find.textContaining('C\$ 365.00'), findsWidgets);
    expect(find.textContaining('\$10.00 USD'), findsWidgets);

    // Check exchange rate badge
    expect(find.textContaining('TC Comercial: 36.50'), findsOneWidget);
    expect(find.textContaining('TC BCN: 36.6241'), findsOneWidget);
  });

  testWidgets('selecting USD tender updates breakdown and change in USD/NIO', (tester) async {
    tester.view.physicalSize = const Size(1024, 768);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() => tester.view.resetPhysicalSize());

    await tester.pumpWidget(buildTestWidget());
    await tester.pumpAndSettle();

    // Switch tender currency to USD
    final usdButton = find.widgetWithText(ChoiceChip, 'USD (\$)');
    expect(usdButton, findsOneWidget);
    await tester.tap(usdButton);
    await tester.pumpAndSettle();

    // Enter 20 USD in tender field
    final amountField = find.byType(TextField);
    await tester.enterText(amountField, '20');
    await tester.pumpAndSettle();

    // Total is C$ 365.00 ($10 USD). Paid $20 USD (= C$ 730 NIO).
    // Change in NIO = C$ 365.00. Change in USD = $10.00 USD.
    expect(find.textContaining('Vuelto: C\$ 365.00'), findsOneWidget);

    // Switch change currency preference to USD
    final changeUsdChip = find.widgetWithText(ChoiceChip, 'Vuelto en USD (\$)');
    expect(changeUsdChip, findsOneWidget);
    await tester.tap(changeUsdChip);
    await tester.pumpAndSettle();

    expect(find.textContaining('Vuelto: \$10.00 USD'), findsOneWidget);
  });

  testWidgets('clicking quick cash suggestion chip fills tender amount', (tester) async {
    tester.view.physicalSize = const Size(1024, 768);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() => tester.view.resetPhysicalSize());

    await tester.pumpWidget(buildTestWidget());
    await tester.pumpAndSettle();

    // Suggested chips for C$ 365 should include C$ 500
    final chip500 = find.widgetWithText(ActionChip, 'C\$ 500');
    expect(chip500, findsOneWidget);

    await tester.ensureVisible(chip500);
    await tester.tap(chip500);
    await tester.pumpAndSettle();

    // Change for C$ 500 tender on C$ 365 bill = C$ 135.00
    expect(find.textContaining('Vuelto: C\$ 135.00'), findsOneWidget);
  });

  testWidgets('disables submit when tender is insufficient and enables when valid', (tester) async {
    tester.view.physicalSize = const Size(1024, 768);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() => tester.view.resetPhysicalSize());

    when(mockSaleViewModel.processSale(any, customPayments: anyNamed('customPayments')))
        .thenAnswer((_) async {});

    await tester.pumpWidget(buildTestWidget());
    await tester.pumpAndSettle();

    // Enter insufficient amount C$ 100 on C$ 365 total
    final amountField = find.byType(TextField);
    await tester.enterText(amountField, '100');
    await tester.pumpAndSettle();

    expect(find.textContaining('Faltan C\$ 265.00'), findsOneWidget);
    final submitButton = find.widgetWithText(FilledButton, 'COBRAR');
    expect(tester.widget<FilledButton>(submitButton).onPressed, isNull);

    // Enter sufficient amount C$ 400
    await tester.enterText(amountField, '400');
    await tester.pumpAndSettle();

    expect(tester.widget<FilledButton>(submitButton).onPressed, isNotNull);

    // Click submit
    await tester.tap(submitButton);
    await tester.pumpAndSettle();

    verify(mockSaleViewModel.processSale(
      [PaymentMethod.cash],
      customPayments: anyNamed('customPayments'),
    )).called(1);
  });

  testWidgets('renders buzzer and customer name inputs when supportsBuzzerPager is true', (tester) async {
    tester.view.physicalSize = const Size(1024, 768);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() => tester.view.resetPhysicalSize());

    when(mockSaleViewModel.supportsBuzzerPager).thenReturn(true);
    when(mockSaleViewModel.processSale(
      any,
      customPayments: anyNamed('customPayments'),
      buzzerNumber: anyNamed('buzzerNumber'),
      customerName: anyNamed('customerName'),
    )).thenAnswer((_) async {});

    await tester.pumpWidget(buildTestWidget());
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('checkout_buzzer_input')), findsOneWidget);
    expect(find.byKey(const Key('checkout_customer_name_input')), findsOneWidget);
    expect(find.textContaining('BUZZER / PAGER DE ENTREGA'), findsOneWidget);

    // Enter buzzer number 14
    await tester.enterText(find.byKey(const Key('checkout_buzzer_input')), '14');
    await tester.pumpAndSettle();

    verify(mockSaleViewModel.setBuzzerNumber('14')).called(1);

    // Submit sale
    final submitButton = find.widgetWithText(FilledButton, 'COBRAR');
    await tester.tap(submitButton);
    await tester.pumpAndSettle();

    verify(mockSaleViewModel.processSale(
      [PaymentMethod.cash],
      customPayments: anyNamed('customPayments'),
      buzzerNumber: '14',
      customerName: anyNamed('customerName'),
    )).called(1);
  });
}
