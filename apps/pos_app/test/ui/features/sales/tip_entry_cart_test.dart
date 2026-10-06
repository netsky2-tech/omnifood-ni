import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/domain/models/config/tenant_config.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/sales/cart_item.dart';
import 'package:pos_app/domain/models/sales/cashier_session.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/data/services/sync_service.dart';
import 'package:pos_app/domain/services/config/business_mode_evaluator.dart';
import 'package:pos_app/domain/services/sales/tip_engine.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/ui/features/sales/sale_view.dart';
import 'package:provider/provider.dart';

import 'sale_view_loyalty_warning_test.mocks.dart';

/// D-7 (owner decision 2026-10-02): tip entry must live directly on the
/// checkout — available whenever the cart is not empty and NEVER behind the
/// FOODPARK_QSR `isSplitBillAllowed` gate. `DIVIDIR CUENTA` stays gated.
void main() {
  late MockSaleViewModel mockViewModel;
  late MockAuthRepository mockAuthRepository;
  late MockAuditRepository mockAuditRepository;
  late MockSyncService mockSyncService;

  final activeSession = CashierSession(
    id: 'session-1',
    userId: 'cashier-1',
    openedAt: DateTime(2026, 1, 1),
    tipoModelo: CashSessionModel.cajaCentral,
    openingBalance: 100,
  );

  final currentUser = const User(
    id: 'cashier-1',
    name: 'Cashier',
    role: UserRole.cashier,
    isActive: true,
  );

  setUp(() {
    mockViewModel = MockSaleViewModel();
    mockAuthRepository = MockAuthRepository();
    mockAuditRepository = MockAuditRepository();
    mockSyncService = MockSyncService();

    when(mockViewModel.errorMessage).thenReturn(null);
    when(mockViewModel.activeSession).thenReturn(activeSession);
    when(mockViewModel.isLoading).thenReturn(false);
    when(mockViewModel.filteredProducts).thenReturn([
      const Product(
        id: 'prod-1',
        name: 'Café Espresso',
        sellPrice: 50.0,
        averageCost: 20.0,
        uom: 'Taza',
        stock: 100.0,
        sku: 'COF-01',
        category: 'Bebidas',
      ),
    ]);
    when(mockViewModel.cart).thenReturn([
      CartItem(
        productId: 'prod-1',
        productName: 'Café Espresso',
        quantity: 2,
        unitPrice: 50.0,
        taxRate: 0.15,
      ),
    ]);
    when(mockViewModel.total).thenReturn(115.0);
    when(mockViewModel.subtotal).thenReturn(100.0);
    when(mockViewModel.totalTax).thenReturn(15.0);
    when(mockViewModel.totalDiscounts).thenReturn(0.0);
    when(mockViewModel.commercialRate).thenReturn(36.50);
    when(mockViewModel.tipAmount).thenReturn(0.0);
    when(mockViewModel.grandTotalWithTip).thenReturn(115.0);
    when(mockViewModel.isGlobalTaxExempt).thenReturn(false);
    when(mockViewModel.supportsTables).thenReturn(false);
    when(mockViewModel.supportsBuzzerPager).thenReturn(false);
    when(
      mockViewModel.businessModeEvaluator,
    ).thenReturn(const BusinessModeEvaluator(TenantConfig()));
    when(
      mockAuthRepository.getCurrentUser(),
    ).thenAnswer((_) async => currentUser);
    when(
      mockAuthRepository.getAllUsers(),
    ).thenAnswer((_) async => [currentUser]);
    when(
      mockAuditRepository.logForensic(
        any,
        metadata: anyNamed('metadata'),
        metodoAutorizacion: anyNamed('metodoAutorizacion'),
        usuarioAutorizadorId: anyNamed('usuarioAutorizadorId'),
      ),
    ).thenAnswer((_) async {});
  });

  Widget buildTestApp() {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider<SaleViewModel>.value(value: mockViewModel),
        Provider<AuthRepository>.value(value: mockAuthRepository),
        Provider<AuditRepository>.value(value: mockAuditRepository),
        Provider<SyncService>.value(value: mockSyncService),
      ],
      child: const MaterialApp(home: SaleView()),
    );
  }

  Future<void> pumpDesktopSaleView(WidgetTester tester) async {
    tester.view.physicalSize = const Size(1024, 768);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() => tester.view.resetPhysicalSize());
    addTearDown(() => tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(buildTestApp());
    await tester.pumpAndSettle();
  }

  testWidgets(
    'PROPINA button is available on the cart sidebar in FOODPARK_QSR '
    '(where DIVIDIR CUENTA is gated off) with a non-empty cart',
    (tester) async {
      await pumpDesktopSaleView(tester);

      // D-7 core assertion: the tip entry exists even though split bill
      // is NOT allowed (foodparkQsr default config -> supportsTables false).
      expect(find.byKey(const Key('btn_tip_cart')), findsOneWidget);
      expect(find.byKey(const Key('btn_split_bill_cart')), findsNothing);

      // Tapping it opens the tip dialog directly on the checkout.
      await tester.tap(find.byKey(const Key('btn_tip_cart')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('tip_dialog')), findsOneWidget);
      expect(find.text('Sin propina'), findsOneWidget);
    },
  );

  testWidgets(
    'selecting 10% sugerida in the tip dialog applies the suggested tip '
    'to the view model',
    (tester) async {
      await pumpDesktopSaleView(tester);

      await tester.tap(find.byKey(const Key('btn_tip_cart')));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('tip_dialog_chip_10')));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('tip_dialog_apply')));
      await tester.pumpAndSettle();

      verify(
        mockViewModel.setTip(
          tipType: TipType.suggestedTenPercent,
          customPercentage: 0.0,
          fixedAmount: 0.0,
        ),
      ).called(1);
    },
  );

  testWidgets(
    'custom percentage is validated to 0-100 before it can be applied',
    (tester) async {
      await pumpDesktopSaleView(tester);

      await tester.tap(find.byKey(const Key('btn_tip_cart')));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('tip_dialog_chip_custom')));
      await tester.pumpAndSettle();

      await tester.enterText(
        find.byKey(const Key('tip_dialog_custom_input')),
        '150',
      );
      await tester.pumpAndSettle();

      // Out-of-range input must be rejected (0-100 only).
      expect(
        find.textContaining('entre 0 y 100'),
        findsOneWidget,
      );

      final applyButton = tester.widget<ElevatedButton>(
        find.byKey(const Key('tip_dialog_apply')),
      );
      expect(applyButton.onPressed, isNull);
      verifyNever(mockViewModel.setTip(
        tipType: anyNamed('tipType'),
        customPercentage: anyNamed('customPercentage'),
        fixedAmount: anyNamed('fixedAmount'),
      ));
    },
  );

  testWidgets(
    'a valid custom percentage is applied to the view model',
    (tester) async {
      await pumpDesktopSaleView(tester);

      await tester.tap(find.byKey(const Key('btn_tip_cart')));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('tip_dialog_chip_custom')));
      await tester.pumpAndSettle();

      await tester.enterText(
        find.byKey(const Key('tip_dialog_custom_input')),
        '15',
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('tip_dialog_apply')));
      await tester.pumpAndSettle();

      verify(
        mockViewModel.setTip(
          tipType: TipType.customPercentage,
          customPercentage: 15.0,
          fixedAmount: 0.0,
        ),
      ).called(1);
    },
  );

  testWidgets(
    'a fixed NIO amount is applied to the view model',
    (tester) async {
      await pumpDesktopSaleView(tester);

      await tester.tap(find.byKey(const Key('btn_tip_cart')));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('tip_dialog_chip_fixed_nio')));
      await tester.pumpAndSettle();

      await tester.enterText(
        find.byKey(const Key('tip_dialog_fixed_nio_input')),
        '50',
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('tip_dialog_apply')));
      await tester.pumpAndSettle();

      verify(
        mockViewModel.setTip(
          tipType: TipType.fixedAmountNio,
          customPercentage: 0.0,
          fixedAmount: 50.0,
        ),
      ).called(1);
    },
  );

  testWidgets(
    'a fixed USD amount is applied to the view model '
    '(TipEngine converts it through the commercial rate)',
    (tester) async {
      await pumpDesktopSaleView(tester);

      await tester.tap(find.byKey(const Key('btn_tip_cart')));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('tip_dialog_chip_fixed_usd')));
      await tester.pumpAndSettle();

      await tester.enterText(
        find.byKey(const Key('tip_dialog_fixed_usd_input')),
        '2',
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('tip_dialog_apply')));
      await tester.pumpAndSettle();

      verify(
        mockViewModel.setTip(
          tipType: TipType.fixedAmountUsd,
          customPercentage: 0.0,
          fixedAmount: 2.0,
        ),
      ).called(1);
    },
  );

  testWidgets(
    'choosing Sin propina clears the tip on the view model',
    (tester) async {
      await pumpDesktopSaleView(tester);

      await tester.tap(find.byKey(const Key('btn_tip_cart')));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('tip_dialog_chip_none')));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('tip_dialog_apply')));
      await tester.pumpAndSettle();

      verify(mockViewModel.clearTip()).called(1);
    },
  );

  testWidgets(
    'sidebar total shows grandTotalWithTip with a Propina row while a tip '
    'is applied, and the plain total otherwise',
    (tester) async {
      when(mockViewModel.tipAmount).thenReturn(10.0);
      when(mockViewModel.grandTotalWithTip).thenReturn(125.0);

      await pumpDesktopSaleView(tester);

      // Tip row + grand total (115 fiscal + 10 tip) are visible.
      expect(find.text('Propina'), findsOneWidget);
      expect(find.text('C\$ 10.00'), findsOneWidget);
      expect(find.text('C\$ 125.00'), findsOneWidget);
      expect(find.text('C\$ 115.00'), findsNothing);
    },
  );

  testWidgets(
    'sidebar total falls back to the fiscal total when no tip is applied',
    (tester) async {
      when(mockViewModel.tipAmount).thenReturn(0.0);
      when(mockViewModel.grandTotalWithTip).thenReturn(115.0);

      await pumpDesktopSaleView(tester);

      expect(find.text('Propina'), findsNothing);
      expect(find.text('C\$ 115.00'), findsOneWidget);
      expect(find.text('C\$ 125.00'), findsNothing);
    },
  );
}
