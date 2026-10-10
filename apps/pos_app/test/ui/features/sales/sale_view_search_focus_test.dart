import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/daos/local_config_dao.dart';
import 'package:pos_app/data/services/sync_service.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/sales/cashier_session.dart';
import 'package:pos_app/domain/models/config/tenant_config.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';
import 'package:pos_app/domain/services/config/business_mode_evaluator.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/ui/features/sales/sale_view.dart';
import 'package:provider/provider.dart';

import 'sale_view_loyalty_warning_test.mocks.dart';

/// Operator-reported focus defects on the Ventas screen search field:
///
/// 1. Tapping outside the search field does not dismiss the cursor/keyboard
///    (Flutter's default tap-outside behavior keeps focus for touch events
///    on mobile platforms).
/// 2. Returning to the Sales screen restores the stale focus and reopens the
///    keyboard, covering the product grid on every visit (Flutter's
///    FocusScope restores the focused child of a covered route on pop).
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
    when(mockViewModel.searchQuery).thenReturn('');
    when(
      mockViewModel.businessModeEvaluator,
    ).thenReturn(const BusinessModeEvaluator(TenantConfig()));
    when(mockViewModel.hasPendingLoyaltyWarning).thenReturn(false);
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

  Widget buildTestApp({GlobalKey<NavigatorState>? navigatorKey}) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider<SaleViewModel>.value(value: mockViewModel),
        Provider<AuthRepository>.value(value: mockAuthRepository),
        Provider<AuditRepository>.value(value: mockAuditRepository),
        Provider<SyncService>.value(value: mockSyncService),
      ],
      child: MaterialApp(
        navigatorKey: navigatorKey,
        home: SaleView(),
      ),
    );
  }

  Finder searchFieldFinder() =>
      find.descendant(of: find.byType(AppBar), matching: find.byType(TextField));

  testWidgets('tapping outside the search field dismisses its focus and the '
      'keyboard', (tester) async {
    await tester.pumpWidget(buildTestApp());
    await tester.pumpAndSettle();

    final searchField = searchFieldFinder();
    expect(searchField, findsOneWidget);

    // Focus the search field: the keyboard (simulated input connection)
    // attaches.
    await tester.tap(searchField);
    await tester.pumpAndSettle();
    expect(tester.testTextInput.hasAnyClients, isTrue,
        reason: 'precondition: the search field is focused');
    expect(FocusManager.instance.primaryFocus, isNotNull);

    // A touch tap outside the field must dismiss focus and the keyboard.
    // The tester's default pointer kind is touch, matching the POS terminal.
    await tester.tapAt(const Offset(400, 560));
    await tester.pumpAndSettle();

    expect(tester.testTextInput.hasAnyClients, isFalse,
        reason: 'keyboard must be dismissed by the outside tap');
    final editableState = tester.state<EditableTextState>(
      find.descendant(of: searchField, matching: find.byType(EditableText)),
    );
    expect(editableState.widget.focusNode!.hasFocus, isFalse,
        reason: 'the search field must not keep focus');
  });

  testWidgets('the search field is not focused when the Sales screen is '
      're-entered after navigating away', (tester) async {
    final navigatorKey = GlobalKey<NavigatorState>();
    await tester.pumpWidget(buildTestApp(navigatorKey: navigatorKey));
    await tester.pumpAndSettle();

    final searchField = searchFieldFinder();
    await tester.tap(searchField);
    await tester.pumpAndSettle();
    expect(tester.testTextInput.hasAnyClients, isTrue,
        reason: 'precondition: the search field is focused');

    // Navigate away (route push, as the drawer does) and come back (pop).
    navigatorKey.currentState!.push(
      MaterialPageRoute<void>(
        builder: (_) => const Scaffold(body: SizedBox()),
      ),
    );
    await tester.pumpAndSettle();
    navigatorKey.currentState!.pop();
    await tester.pumpAndSettle();

    expect(tester.testTextInput.hasAnyClients, isFalse,
        reason: 'no keyboard may reopen when returning to the Sales screen');
    final editableState = tester.state<EditableTextState>(
      find.descendant(of: searchField, matching: find.byType(EditableText)),
    );
    expect(editableState.widget.focusNode!.hasFocus, isFalse,
        reason: 'no stale focus may be restored on re-entry');
  });

  testWidgets('typing and submitting still searches, adds to cart and clears '
      'the field', (tester) async {
    await tester.pumpWidget(buildTestApp());
    await tester.pumpAndSettle();

    final searchField = searchFieldFinder();
    await tester.showKeyboard(searchField);
    await tester.enterText(searchField, 'Coca Cola');
    await tester.pumpAndSettle();

    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pumpAndSettle();

    verify(mockViewModel.searchAndAddToCart('Coca Cola')).called(1);
    verify(mockViewModel.setSearchQuery('Coca Cola')).called(1);
    verify(mockViewModel.setSearchQuery('')).called(greaterThanOrEqualTo(1));
    final controller = tester.widget<TextField>(searchField).controller;
    expect(controller!.text, isEmpty, reason: 'the field clears after submit');
  });

  group('filteredProducts predicate (the search contract, not just the setter)',
      () {
    // Real catalog shape: Nicaraguan products whose names carry accents.
    const catalog = [
      Product(
        id: 'p1',
        name: 'Café de Olla',
        uom: 'pza',
        stock: 10,
        averageCost: 8,
        sellPrice: 25,
        // The sku deliberately does NOT spell the product ('cafe' must not
        // reach «Café de Olla» through an ASCII sku side door): the accent
        // test is about the NAME predicate.
        sku: 'BEB-114',
        barcode: '7501234567890',
      ),
      Product(
        id: 'p2',
        name: 'Panadería La Espiga',
        uom: 'pza',
        stock: 5,
        averageCost: 2,
        sellPrice: 8,
      ),
      Product(
        id: 'p3',
        name: 'Coca Cola 600ml',
        uom: 'pza',
        stock: 24,
        averageCost: 12,
        sellPrice: 18,
      ),
    ];

    // Builds the REAL SaleViewModel (autoLoad: false, driven explicitly) so
    // the predicate's OUTPUT is asserted, unlike the widget tests above whose
    // MockSaleViewModel stubs filteredProducts and could never catch a
    // defective predicate.
    Future<SaleViewModel> buildViewModel() async {
      final viewModel = SaleViewModel(
        _FakeSalesRepository(),
        _FakeInventoryRepository(catalog),
        MockAuthRepository(),
        _FakeAppDatabase(),
        null,
        false, // autoLoad: false — loadProducts() is called explicitly below.
      );
      await viewModel.loadProducts();
      return viewModel;
    }

    test('empty query returns the full catalog, order preserved', () async {
      final viewModel = await buildViewModel();
      viewModel.setSearchQuery('');
      expect(
        viewModel.filteredProducts.map((p) => p.name).toList(),
        ['Café de Olla', 'Panadería La Espiga', 'Coca Cola 600ml'],
      );
    });

    test('search is case-insensitive and partial ("CAF" and "caf" hit «Café»)',
        () async {
      final viewModel = await buildViewModel();
      viewModel.setSearchQuery('CAF');
      expect(
        viewModel.filteredProducts.map((p) => p.name),
        ['Café de Olla'],
      );
      viewModel.setSearchQuery('caf');
      expect(
        viewModel.filteredProducts.map((p) => p.name),
        ['Café de Olla'],
      );
    });

    test('search is accent-insensitive ("cafe" hits «Café de Olla»)', () async {
      final viewModel = await buildViewModel();
      viewModel.setSearchQuery('cafe');
      expect(
        viewModel.filteredProducts.map((p) => p.name),
        ['Café de Olla'],
        reason:
            "an operator typing 'cafe' without the accent must still find "
            '«Café de Olla» — the same accent-fold the admin backend applies',
      );
    });
  });
}

class _FakeSalesRepository extends Fake implements SalesRepository {}

class _FakeLocalConfigDao extends Fake implements LocalConfigDao {}

class _FakeAppDatabase extends Fake implements AppDatabase {
  @override
  LocalConfigDao get localConfigDao => _FakeLocalConfigDao();
}

class _FakeInventoryRepository extends Fake implements InventoryRepository {
  _FakeInventoryRepository(this.products);

  final List<Product> products;

  @override
  Future<List<Product>> getActiveProducts() async => products;
}
