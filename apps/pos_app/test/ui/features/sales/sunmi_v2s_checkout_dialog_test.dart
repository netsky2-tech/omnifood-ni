import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:provider/provider.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/models/sales/cart_item.dart';
import 'package:pos_app/domain/models/config/tenant_config.dart';
import 'package:pos_app/domain/models/config/tenant_operation_mode.dart';
import 'package:pos_app/ui/features/sales/widgets/multi_currency_checkout_dialog.dart';

import 'multi_currency_checkout_dialog_test.mocks.dart';

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
    when(mockSaleViewModel.supportsBuzzerPager).thenReturn(true);
    when(mockSaleViewModel.supportsTables).thenReturn(true);
    when(mockSaleViewModel.buzzerNumber).thenReturn(null);
    when(mockSaleViewModel.customerName).thenReturn(null);
    when(mockSaleViewModel.tenantConfig).thenReturn(
      const TenantConfig(
        operationMode: TenantOperationMode.foodparkQsr,
        buzzerPagerRequired: true,
      ),
    );
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

  group('Sunmi V2s (360x720dp) Checkout Dialog Responsiveness', () {
    testWidgets('renders single checkout dialog on Sunmi V2s (360x720) without RenderFlex overflow', (tester) async {
      tester.view.physicalSize = const Size(360, 720);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      // Check header and titles
      expect(find.text('Cobro y Facturación'), findsOneWidget);
      expect(find.textContaining('C\$ 365.00'), findsWidgets);
      expect(find.textContaining('\$10.00 USD'), findsWidgets);

      // Check buzzer section
      expect(find.byKey(const Key('checkout_buzzer_input')), findsOneWidget);
      expect(find.byKey(const Key('checkout_customer_name_input')), findsOneWidget);

      // Check method selector chips
      expect(find.text('Efectivo'), findsOneWidget);
      expect(find.text('Tarjeta'), findsOneWidget);
      expect(find.text('QR / Transfer'), findsOneWidget);

      // Check submit button
      expect(find.widgetWithText(FilledButton, 'COBRAR'), findsOneWidget);
    });

    testWidgets('renders card datafono panel with 2-layer fast checkout without overflow on Sunmi V2s', (tester) async {
      tester.view.physicalSize = const Size(360, 720);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      // Switch to Card
      final cardChip = find.widgetWithText(ChoiceChip, 'Tarjeta');
      await tester.tap(cardChip);
      await tester.pumpAndSettle();

      expect(find.text('Banco Adquirente / Datáfono:'), findsOneWidget);
      expect(find.text('BAC'), findsOneWidget);
      expect(find.text('VISA'), findsOneWidget);
      expect(find.textContaining('⚡ Cobro Rápido (Hora Pico)'), findsOneWidget);
    });

    testWidgets('renders split payment mode without overflow on Sunmi V2s (360x720)', (tester) async {
      tester.view.physicalSize = const Size(360, 720);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      // Switch to Pago Dividido
      final splitTab = find.text('Pago Dividido');
      await tester.tap(splitTab);
      await tester.pumpAndSettle();

      expect(find.text('Total Ticket:'), findsOneWidget);
      expect(find.textContaining('Resta: C\$ 365.00'), findsOneWidget);
      expect(find.text('Agregar Pago Parcial:'), findsOneWidget);
      expect(find.widgetWithText(FilledButton, 'FINALIZAR VENTA'), findsOneWidget);
    });
  });
}
