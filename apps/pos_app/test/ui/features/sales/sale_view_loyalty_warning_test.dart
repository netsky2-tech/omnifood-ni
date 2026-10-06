import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/data/services/sync_service.dart';
import 'package:pos_app/domain/models/sales/cashier_session.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/models/config/tenant_config.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/sales/cart_item.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/domain/services/config/business_mode_evaluator.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/ui/features/sales/sale_view.dart';
import 'package:provider/provider.dart';

import 'sale_view_loyalty_warning_test.mocks.dart';

@GenerateNiceMocks([
  MockSpec<SaleViewModel>(),
  MockSpec<AuthRepository>(),
  MockSpec<AuditRepository>(),
  MockSpec<SyncService>(),
])

/// POS-B (re-audit): after a successful sale completion with a loyalty
/// failure recorded, SaleView must surface a NON-blocking warning SnackBar
/// (the sale WAS registered — loyalty drift must never be invisible).
void main() {
  late MockSaleViewModel mockViewModel;
  late MockAuthRepository mockAuthRepository;
  late MockAuditRepository mockAuditRepository;
  late MockSyncService mockSyncService;

  // Models the real consume-once contract of the view model: the armed
  // flag is cleared by consumePendingLoyaltyWarning.
  bool pendingLoyaltyWarning = false;

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
    pendingLoyaltyWarning = false;
    mockViewModel = MockSaleViewModel();
    mockAuthRepository = MockAuthRepository();
    mockAuditRepository = MockAuditRepository();
    mockSyncService = MockSyncService();

    when(mockViewModel.errorMessage).thenReturn(null);
    when(mockViewModel.activeSession).thenReturn(activeSession);
    when(mockViewModel.isLoading).thenReturn(false);
    when(mockViewModel.filteredProducts).thenReturn([]);
    when(mockViewModel.cart).thenReturn([]);
    when(mockViewModel.canManageCashDrawer).thenReturn(true);
    when(mockViewModel.currentUserRole).thenReturn(UserRole.cashier);
    when(mockViewModel.total).thenReturn(0.0);
    when(mockViewModel.grandTotalWithTip).thenReturn(0.0);
    when(mockViewModel.tipAmount).thenReturn(0.0);
    when(mockViewModel.subtotal).thenReturn(0.0);
    when(mockViewModel.totalTax).thenReturn(0.0);
    when(mockViewModel.totalDiscounts).thenReturn(0.0);
    when(mockViewModel.isGlobalTaxExempt).thenReturn(false);
    when(mockViewModel.supportsTables).thenReturn(false);
    when(mockViewModel.supportsBuzzerPager).thenReturn(false);
    when(
      mockViewModel.businessModeEvaluator,
    ).thenReturn(const BusinessModeEvaluator(TenantConfig()));
    when(mockViewModel.sessionExpected).thenReturn({
      PaymentMethod.cash: 100,
      PaymentMethod.card: 0,
      PaymentMethod.qr: 0,
    });
    when(
      mockViewModel.hasPendingLoyaltyWarning,
    ).thenAnswer((_) => pendingLoyaltyWarning);
    when(mockViewModel.consumePendingLoyaltyWarning()).thenAnswer((_) {
      pendingLoyaltyWarning = false;
    });
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

  testWidgets('shows the non-blocking loyalty warning after a sale '
      'completed with a loyalty failure', (tester) async {
    pendingLoyaltyWarning = true;

    await tester.pumpWidget(buildTestApp());
    await tester.pumpAndSettle();

    expect(
      find.text(
        'La venta se registró, pero los puntos de lealtad no se actualizaron.',
      ),
      findsOneWidget,
    );
    // The warning is consumed exactly once: the view owns the one-shot.
    verify(mockViewModel.consumePendingLoyaltyWarning()).called(1);
  });

  testWidgets('shows no loyalty warning when no loyalty failure was armed',
      (tester) async {
    pendingLoyaltyWarning = false;

    await tester.pumpWidget(buildTestApp());
    await tester.pumpAndSettle();

    expect(
      find.text(
        'La venta se registró, pero los puntos de lealtad no se actualizaron.',
      ),
      findsNothing,
    );
    verifyNever(mockViewModel.consumePendingLoyaltyWarning());
  });

  testWidgets('the warning is consumed once and never re-shown on the next '
      'notification', (tester) async {
    pendingLoyaltyWarning = true;

    await tester.pumpWidget(buildTestApp());
    await tester.pumpAndSettle();

    expect(
      find.text(
        'La venta se registró, pero los puntos de lealtad no se actualizaron.',
      ),
      findsOneWidget,
    );

    // A later view-model notification (consume already reset the flag)
    // must not duplicate the warning.
    mockViewModel.notifyListeners();
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));

    expect(
      find.text(
        'La venta se registró, pero los puntos de lealtad no se actualizaron.',
      ),
      findsOneWidget,
    );
    verify(mockViewModel.consumePendingLoyaltyWarning()).called(1);
  });

  group('Product options gate (grouped modifier groups)', () {
    final groupedOnlyProduct = Product(
      id: 'prod-grp',
      name: 'Café con Grupos',
      uom: 'UND',
      stock: 10,
      averageCost: 0,
      sellPrice: 50,
      availableModifierGroups: const [
        EffectiveModifierGroup(
          id: 'grp-1',
          name: 'Leche',
          minSelected: 0,
          maxSelected: 1,
          allowQuantities: false,
          source: 'category',
          options: [
            EffectiveModifierOption(
              id: 'opt-1',
              name: 'Entera',
              priceDelta: 5,
              isDefault: true,
            ),
          ],
        ),
      ],
    );

    final plainProduct = Product(
      id: 'prod-plain',
      name: 'Café Simple',
      uom: 'UND',
      stock: 10,
      averageCost: 0,
      sellPrice: 30,
    );

    testWidgets('a grouped-only product opens the selector instead of adding directly',
        (tester) async {
      when(mockViewModel.filteredProducts).thenReturn([groupedOnlyProduct]);

      await tester.pumpWidget(buildTestApp());
      await tester.pumpAndSettle();

      await tester.tap(find.text('Café con Grupos'));
      await tester.pumpAndSettle();

      // The dialog rendered with the group section (the bug under test made
      // the product add directly over empty modifiers).
      expect(find.text('Leche'), findsWidgets);
      verifyNever(
        mockViewModel.addToCart(
          any,
          quantity: anyNamed('quantity'),
          variantId: anyNamed('variantId'),
          modifiers: anyNamed('modifiers'),
        ),
      );
    });

    testWidgets('a product with no options keeps adding directly', (tester) async {
      when(mockViewModel.filteredProducts).thenReturn([plainProduct]);

      await tester.pumpWidget(buildTestApp());
      await tester.pumpAndSettle();

      await tester.tap(find.text('Café Simple'));
      await tester.pumpAndSettle();

      expect(find.text('Leche'), findsNothing);
      verify(
        mockViewModel.addToCart(
          any,
          quantity: anyNamed('quantity'),
          variantId: anyNamed('variantId'),
          modifiers: anyNamed('modifiers'),
        ),
      ).called(1);
    });

    testWidgets('the cart tile shows each selected modifier with its count', (tester) async {
      final cartItem = CartItem(
        productId: 'prod-grp',
        productName: 'Capuccino',
        quantity: 1,
        unitPrice: 60,
        taxRate: 0.15,
        selectedModifiers: const [
          Modifier(id: 'm-1', name: 'Extra Shot', extraPrice: 15, quantity: 2),
          Modifier(id: 'm-2', name: 'Crema', extraPrice: 10),
        ],
      );
      when(mockViewModel.filteredProducts).thenReturn([]);
      when(mockViewModel.cart).thenReturn([cartItem]);
      when(mockViewModel.total).thenReturn(100.0);

      await tester.pumpWidget(buildTestApp());
      await tester.pumpAndSettle();

      // One consistent '<qty>x <name>' format per modifier.
      expect(find.text('2x Extra Shot, 1x Crema'), findsOneWidget);

      // Copy guard over the rendered tile: Spanish business copy only.
      final tileText = tester
          .widgetList<Text>(find.byType(Text))
          .map((text) => text.data ?? '')
          .join('\n');
      expect(tileText, isNot(contains('§')));
      expect(tileText, isNot(matches(RegExp(r'INV\.'))));
      expect(tileText, isNot(matches(RegExp(r'\bT\d\.\d\b'))));
      expect(tileText, isNot(matches(RegExp(r'\b[0-9a-f]{40}\b'))));
      expect(
        tileText,
        isNot(matches(RegExp(r'\b(uuid|tenant|freezed|zod)\b', caseSensitive: false))),
      );
    });
  });
}
