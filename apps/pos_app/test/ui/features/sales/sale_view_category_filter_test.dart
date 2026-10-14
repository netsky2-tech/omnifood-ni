import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/data/services/sync_service.dart';
import 'package:pos_app/domain/models/config/tenant_config.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/sales/cashier_session.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/domain/services/config/business_mode_evaluator.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/ui/features/sales/sale_view.dart';
import 'package:pos_app/ui/features/sales/widgets/product_card.dart';
import 'package:provider/provider.dart';

import 'sale_view_loyalty_warning_test.mocks.dart';

/// §14 of the terminal experience standard: the catalog is the surface the
/// operator hunts in during peak hour, and a menu with one long scroll is a
/// search problem, not a browsing problem. The filter state has to be visible,
/// resettable, and honest about producing no results.
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

  const espresso = Product(
    id: 'prod-1',
    name: 'Espresso Doble',
    sellPrice: 80.0,
    averageCost: 20.0,
    uom: 'Taza',
    stock: 10.0,
    sku: 'ESP-01',
    category: 'Café Caliente',
  );
  const oreo = Product(
    id: 'prod-2',
    name: 'Galletas Oreo 6pk',
    sellPrice: 25.0,
    averageCost: 10.0,
    uom: 'Unidad',
    stock: 10.0,
    sku: 'GAL-01',
    category: 'Snacks',
  );
  const croissant = Product(
    id: 'prod-3',
    name: 'Croissant de Mantequilla',
    sellPrice: 90.0,
    averageCost: 30.0,
    uom: 'Unidad',
    stock: 10.0,
    sku: 'CRO-01',
    category: 'Repostería',
  );

  const catalog = [espresso, oreo, croissant];

  setUp(() {
    mockViewModel = MockSaleViewModel();
    mockAuthRepository = MockAuthRepository();
    mockAuditRepository = MockAuditRepository();
    mockSyncService = MockSyncService();

    when(mockViewModel.errorMessage).thenReturn(null);
    when(mockViewModel.activeSession).thenReturn(activeSession);
    when(mockViewModel.isLoading).thenReturn(false);
    when(mockViewModel.products).thenReturn(catalog);
    when(mockViewModel.filteredProducts).thenReturn(catalog);
    when(mockViewModel.promotions).thenReturn(const []);
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

  Widget buildTestApp() {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider<SaleViewModel>.value(value: mockViewModel),
        Provider<AuthRepository>.value(value: mockAuthRepository),
        Provider<AuditRepository>.value(value: mockAuditRepository),
        Provider<SyncService>.value(value: mockSyncService),
      ],
      child: MaterialApp(home: SaleView()),
    );
  }

  Finder chipFor(String label) => find.widgetWithText(ChoiceChip, label);

  group('Catálogo — filtro por categoría (§14, §48)', () {
    testWidgets('el catálogo completo muestra una chip por categoría más '
        '"Todas"', (tester) async {
      await tester.pumpWidget(buildTestApp());
      await tester.pumpAndSettle();

      expect(chipFor('Todas'), findsOneWidget);
      expect(chipFor('Café Caliente'), findsOneWidget);
      expect(chipFor('Repostería'), findsOneWidget);
      expect(chipFor('Snacks'), findsOneWidget);
      expect(find.byType(ProductCard), findsNWidgets(3));
    });

    testWidgets('sin categorías configuradas la fila no se dibuja: nada de '
        'ruido vacío (§43)', (tester) async {
      when(mockViewModel.products).thenReturn(const [
        Product(
          id: 'prod-9',
          name: 'Producto sin categoría',
          sellPrice: 10.0,
          averageCost: 5.0,
          uom: 'Unidad',
          stock: 1.0,
        ),
      ]);

      await tester.pumpWidget(buildTestApp());
      await tester.pumpAndSettle();

      expect(find.byType(ChoiceChip), findsNothing);
      expect(find.text('Todas'), findsNothing);
    });

    testWidgets('tocar una categoría deja solo sus productos y el estado '
        'queda visible', (tester) async {
      await tester.pumpWidget(buildTestApp());
      await tester.pumpAndSettle();

      await tester.tap(chipFor('Café Caliente'));
      await tester.pumpAndSettle();

      expect(find.byType(ProductCard), findsOneWidget);
      expect(find.text('Espresso Doble'), findsOneWidget);
      expect(find.text('Galletas Oreo 6pk'), findsNothing);

      final chip = tester.widget<ChoiceChip>(chipFor('Café Caliente'));
      expect(chip.selected, isTrue, reason: 'el estado del filtro es visible');
    });

    testWidgets('"Todas" limpia el filtro y devuelve el catálogo completo', (
      tester,
    ) async {
      await tester.pumpWidget(buildTestApp());
      await tester.pumpAndSettle();

      await tester.tap(chipFor('Snacks'));
      await tester.pumpAndSettle();
      expect(find.byType(ProductCard), findsOneWidget);

      await tester.tap(chipFor('Todas'));
      await tester.pumpAndSettle();

      expect(find.byType(ProductCard), findsNWidgets(3));
      expect(
        tester.widget<ChoiceChip>(chipFor('Todas')).selected,
        isTrue,
      );
    });

    testWidgets('el filtro se combina con la búsqueda del view model', (
      tester,
    ) async {
      // The view model already applied the search: only the espresso matches.
      when(mockViewModel.filteredProducts).thenReturn(const [espresso]);
      when(mockViewModel.searchQuery).thenReturn('espresso');

      await tester.pumpWidget(buildTestApp());
      await tester.pumpAndSettle();

      await tester.tap(chipFor('Snacks'));
      await tester.pumpAndSettle();

      expect(find.byType(ProductCard), findsNothing);
      expect(find.text('Sin resultados'), findsOneWidget);
      expect(
        find.textContaining('Snacks'),
        findsWidgets,
        reason: 'el estado vacío nombra el filtro activo (§14.1)',
      );

      clearInteractions(mockViewModel);
      await tester.tap(find.text('Limpiar filtros'));
      await tester.pumpAndSettle();

      verify(mockViewModel.setSearchQuery('')).called(1);
      // The category chip reset too: the catalog is whole again.
      expect(tester.widget<ChoiceChip>(chipFor('Todas')).selected, isTrue);
      expect(find.byType(ProductCard), findsOneWidget);
    });
  });
}
