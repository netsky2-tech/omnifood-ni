import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';
import 'package:provider/provider.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/models/sales/cart_item.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/config/tenant_config.dart';
import 'package:pos_app/ui/features/sales/widgets/multi_currency_checkout_dialog.dart';

import 'multi_currency_checkout_dialog_test.mocks.dart';

@GenerateMocks([SaleViewModel])
void main() {
  late MockSaleViewModel mockSaleViewModel;

  setUp(() {
    mockSaleViewModel = MockSaleViewModel();
    when(mockSaleViewModel.total).thenReturn(365.00);
    when(mockSaleViewModel.grandTotalWithTip).thenReturn(365.00);
    when(mockSaleViewModel.tipAmount).thenReturn(0.0);
    when(mockSaleViewModel.subtotal).thenReturn(365.00);
    when(mockSaleViewModel.totalTax).thenReturn(0.00);
    when(mockSaleViewModel.commercialRate).thenReturn(36.50);
    when(mockSaleViewModel.bcnOfficialRate).thenReturn(36.6241);
    when(mockSaleViewModel.checkoutFxMode).thenReturn('COMMERCIAL');
    when(mockSaleViewModel.activeCheckoutRate).thenReturn(36.50);
    when(mockSaleViewModel.activeCheckoutRateLabel).thenReturn('TC Comercial: 36.50');
    when(mockSaleViewModel.isLoading).thenReturn(false);
    when(mockSaleViewModel.supportsBuzzerPager).thenReturn(false);
    when(mockSaleViewModel.supportsTables).thenReturn(true);
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

    // Check single active exchange rate badge
    expect(find.textContaining('TC Comercial: 36.50'), findsOneWidget);
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

  testWidgets('quick suggestion chip label shows exactly the amount the tap applies', (tester) async {
    tester.view.physicalSize = const Size(1024, 768);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() => tester.view.resetPhysicalSize());

    // Real-device case: a bill of C$ 202.50 makes the FIRST suggestion the
    // exact total with cents (202.50); the rest are whole denominations.
    when(mockSaleViewModel.grandTotalWithTip).thenReturn(202.50);

    await tester.pumpWidget(buildTestWidget());
    await tester.pumpAndSettle();

    final chips = find.byType(ActionChip);
    expect(chips, findsWidgets);

    final amountField = find.byType(TextField);

    // Invariant: for EVERY chip, the amount shown in the label equals the
    // amount the tap writes into the tender field.
    for (var i = 0; i < tester.widgetList(chips).length; i++) {
      final chip = tester.widget<ActionChip>(chips.at(i));
      final labelText = (chip.label as Text).data!;
      final labelAmount = double.parse(labelText.replaceAll(RegExp(r'[^0-9.]'), ''));

      await tester.ensureVisible(chips.at(i));
      await tester.pumpAndSettle();
      await tester.tap(chips.at(i));
      await tester.pumpAndSettle();

      final fieldText = tester.widget<TextField>(amountField).controller!.text;
      final appliedAmount = double.parse(fieldText);

      expect(
        appliedAmount,
        labelAmount,
        reason:
            'chip label "$labelText" must equal the amount the tap applies (field: "$fieldText")',
      );
    }
  });

  testWidgets('the USD suggestion chip label shows exactly the amount the tap applies', (tester) async {
    tester.view.physicalSize = const Size(1024, 768);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() => tester.view.resetPhysicalSize());

    // The same invariant on the OTHER currency branch: the fix formats both
    // branches with the value's own precision, and a USD suggestion below one
    // dollar is fractional, so a rounding label would drift here too. An
    // independent verifier flagged that only the NIO branch was covered.
    when(mockSaleViewModel.grandTotalWithTip).thenReturn(202.50);

    await tester.pumpWidget(buildTestWidget());
    await tester.pumpAndSettle();

    final usdButton = find.widgetWithText(ChoiceChip, 'USD (\$)');
    expect(usdButton, findsOneWidget);
    await tester.tap(usdButton);
    await tester.pumpAndSettle();

    final chips = find.byType(ActionChip);
    expect(chips, findsWidgets);

    final amountField = find.byType(TextField);

    for (var i = 0; i < tester.widgetList(chips).length; i++) {
      final chip = tester.widget<ActionChip>(chips.at(i));
      final labelText = (chip.label as Text).data!;
      expect(
        labelText.startsWith('\$'),
        isTrue,
        reason: 'expected a USD label on this branch, got "$labelText"',
      );
      final labelAmount = double.parse(
        labelText.replaceAll(RegExp(r'[^0-9.]'), ''),
      );

      await tester.ensureVisible(chips.at(i));
      await tester.pumpAndSettle();
      await tester.tap(chips.at(i));
      await tester.pumpAndSettle();

      final fieldText = tester.widget<TextField>(amountField).controller!.text;
      final appliedAmount = double.parse(fieldText);

      expect(
        appliedAmount,
        labelAmount,
        reason:
            'USD chip label "$labelText" must equal the amount the tap applies (field: "$fieldText")',
      );
    }
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

  testWidgets('keeps submit available after buzzer validation fails', (tester) async {
    when(mockSaleViewModel.supportsBuzzerPager).thenReturn(true);
    when(mockSaleViewModel.tenantConfig).thenReturn(
      const TenantConfig(buzzerPagerRequired: true),
    );

    await tester.pumpWidget(buildTestWidget());
    await tester.pumpAndSettle();

    final submitButton = find.widgetWithText(FilledButton, 'COBRAR');
    await tester.tap(submitButton);
    await tester.pumpAndSettle();

    expect(
      find.text('El número de Buzzer/Pager es obligatorio.'),
      findsOneWidget,
    );
    expect(tester.widget<FilledButton>(submitButton).onPressed, isNotNull);
  });

  testWidgets('only submits one sale while a checkout is in flight', (tester) async {
    final processing = Completer<void>();
    when(
      mockSaleViewModel.processSale(
        any,
        customPayments: anyNamed('customPayments'),
      ),
    ).thenAnswer((_) => processing.future);

    await tester.pumpWidget(buildTestWidget());
    await tester.pumpAndSettle();

    final submitButton = find.widgetWithText(FilledButton, 'COBRAR');
    await tester.tap(submitButton);
    await tester.pump();
    // Verify that the submit button is now in processing state (disabled)
    expect(tester.widget<FilledButton>(find.byType(FilledButton)).onPressed, isNull);
    await tester.tap(find.byType(FilledButton));
    await tester.pump();

    verify(
      mockSaleViewModel.processSale(
        [PaymentMethod.cash],
        customPayments: anyNamed('customPayments'),
      ),
    ).called(1);

    processing.completeError(StateError('failed'));
    await tester.pumpAndSettle();
    expect(tester.widget<FilledButton>(submitButton).onPressed, isNotNull);
  });

  testWidgets('shows a failed sale inline inside the dialog and keeps it open', (tester) async {
    tester.view.physicalSize = const Size(1024, 768);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() => tester.view.resetPhysicalSize());

    when(mockSaleViewModel.processSale(any, customPayments: anyNamed('customPayments')))
        .thenThrow(StateError('Prepared product abc-123 cannot be sold without a published active recipe version.'));
    when(mockSaleViewModel.errorMessage).thenReturn(
      'No se puede vender «Café Especial»: no tiene receta publicada. Avisá al encargado.',
    );

    await tester.pumpWidget(buildTestWidget());
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(FilledButton, 'COBRAR'));
    await tester.pumpAndSettle();

    // The dialog stays open so the operator can read the failure at the
    // point of action (NHILOS §4.1: never hide a material side effect).
    expect(find.text('Cobro y Facturación'), findsOneWidget);
    expect(find.byKey(const Key('checkout_inline_error')), findsOneWidget);
    expect(find.textContaining('receta publicada'), findsOneWidget);
    // Retry is possible, but only after the failure is visible.
    expect(
      tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'COBRAR')).onPressed,
      isNotNull,
    );
  });

  testWidgets('two rapid confirm taps launch only one sale attempt', (tester) async {
    tester.view.physicalSize = const Size(1024, 768);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() => tester.view.resetPhysicalSize());

    when(mockSaleViewModel.processSale(any, customPayments: anyNamed('customPayments')))
        .thenAnswer((_) async => throw StateError('failed'));

    await tester.pumpWidget(buildTestWidget());
    await tester.pumpAndSettle();

    final submitButton = find.widgetWithText(FilledButton, 'COBRAR');
    await tester.tap(submitButton);
    await tester.tap(submitButton, warnIfMissed: false);
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
      customerTaxId: anyNamed('customerTaxId'),
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
      customerTaxId: anyNamed('customerTaxId'),
    )).called(1);
  });

  testWidgets('renders RUC/Cedula input, preloads customer snapshot, and passes them to processSale', (tester) async {
    tester.view.physicalSize = const Size(1024, 768);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() => tester.view.resetPhysicalSize());

    when(mockSaleViewModel.supportsBuzzerPager).thenReturn(true);
    when(mockSaleViewModel.customerName).thenReturn('Empresa Modelo S.A.');
    when(mockSaleViewModel.customerTaxId).thenReturn('J0310000009999');
    when(mockSaleViewModel.processSale(
      any,
      customPayments: anyNamed('customPayments'),
      buzzerNumber: anyNamed('buzzerNumber'),
      customerName: anyNamed('customerName'),
      customerTaxId: anyNamed('customerTaxId'),
    )).thenAnswer((_) async {});

    await tester.pumpWidget(buildTestWidget());
    await tester.pumpAndSettle();

    final nameInput = find.byKey(const Key('checkout_customer_name_input'));
    final taxIdInput = find.byKey(const Key('checkout_customer_tax_id_input'));

    expect(nameInput, findsOneWidget);
    expect(taxIdInput, findsOneWidget);

    expect(find.text('Empresa Modelo S.A.'), findsOneWidget);
    expect(find.text('J0310000009999'), findsOneWidget);

    // Edit taxId
    await tester.enterText(taxIdInput, '001-120590-0001A');
    await tester.pumpAndSettle();

    verify(mockSaleViewModel.setCustomerTaxId('001-120590-0001A')).called(1);

    // Submit sale
    final submitButton = find.widgetWithText(FilledButton, 'COBRAR');
    await tester.tap(submitButton);
    await tester.pumpAndSettle();

    verify(mockSaleViewModel.processSale(
      [PaymentMethod.cash],
      customPayments: anyNamed('customPayments'),
      buzzerNumber: null,
      customerName: 'Empresa Modelo S.A.',
      customerTaxId: '001-120590-0001A',
    )).called(1);
  });

  testWidgets('clearing the RUC field sends the EXPLICIT-CLEAR signal, not the catalog value (registered customer)', (tester) async {
    tester.view.physicalSize = const Size(1024, 768);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() => tester.view.resetPhysicalSize());

    when(mockSaleViewModel.supportsBuzzerPager).thenReturn(true);
    when(mockSaleViewModel.customerName).thenReturn('Carlos Mendoza');
    when(mockSaleViewModel.customerTaxId).thenReturn('001-150885-0002Y');
    when(mockSaleViewModel.processSale(
      any,
      customPayments: anyNamed('customPayments'),
      buzzerNumber: anyNamed('buzzerNumber'),
      customerName: anyNamed('customerName'),
      customerTaxId: anyNamed('customerTaxId'),
    )).thenAnswer((_) async {});

    await tester.pumpWidget(buildTestWidget());
    await tester.pumpAndSettle();

    final taxIdInput = find.byKey(const Key('checkout_customer_tax_id_input'));
    expect(taxIdInput, findsOneWidget);

    // The operator ERASES the prefilled RUC/Cédula: the fiscal snapshot must
    // record NO tax id — the checkout boundary must distinguish "explicitly
    // cleared" from "not supplied" so the view model cannot silently
    // re-persist the catalog value (_selectedCustomer.taxId).
    await tester.enterText(taxIdInput, '');
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(FilledButton, 'COBRAR'));
    await tester.pumpAndSettle();

    final verification = verify(mockSaleViewModel.processSale(
      [PaymentMethod.cash],
      customPayments: anyNamed('customPayments'),
      buzzerNumber: anyNamed('buzzerNumber'),
      customerName: 'Carlos Mendoza',
      customerTaxId: captureAnyNamed('customerTaxId'),
    ))..called(1);
    final capturedTaxId = verification.captured[0] as String?;
    // The dialog passes the trimmed field value verbatim: an EMPTY string is
    // the explicit "operator cleared it" signal; the view model must turn it
    // into NO tax id on the invoice snapshot (never the catalog value).
    expect(capturedTaxId, '',
        reason: 'an explicitly cleared RUC field must NOT fall back to the customer catalog tax id');
  });
}
