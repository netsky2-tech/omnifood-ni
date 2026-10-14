import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/data/services/sync_service.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/sales/cashier_session.dart';
import 'package:pos_app/domain/models/config/tenant_config.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/domain/services/config/business_mode_evaluator.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/ui/design_system/ds_secondary_button.dart';
import 'package:pos_app/ui/features/sales/sale_view.dart';
import 'package:provider/provider.dart';

import 'sale_view_loyalty_warning_test.mocks.dart';

/// §13.2 / §28.1 / §29 / §47 of the terminal experience standard: the catalog
/// is served from local SQLite, so it must never block the operator with a
/// full-page loader, and "there is no catalog" has to read differently from
/// "your search matched nothing".
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

  const product = Product(
    id: 'prod-1',
    name: 'Galletas Oreo 6pk',
    sellPrice: 25.0,
    averageCost: 10.0,
    uom: 'Unidad',
    stock: 10.0,
    sku: 'GAL-01',
    category: 'Snacks',
  );

  setUp(() {
    mockViewModel = MockSaleViewModel();
    mockAuthRepository = MockAuthRepository();
    mockAuditRepository = MockAuditRepository();
    mockSyncService = MockSyncService();

    when(mockViewModel.errorMessage).thenReturn(null);
    when(mockViewModel.activeSession).thenReturn(activeSession);
    when(mockViewModel.isLoading).thenReturn(false);
    when(mockViewModel.products).thenReturn(const []);
    when(mockViewModel.filteredProducts).thenReturn(const []);
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

  group('Catálogo — estados de la superficie de ventas', () {
    testWidgets('la carga local usa un esqueleto, nunca un spinner de página '
        'completa (§28.1, §47)', (tester) async {
      when(mockViewModel.isLoading).thenReturn(true);

      await tester.pumpWidget(buildTestApp());
      await tester.pump();

      expect(find.byType(CircularProgressIndicator), findsNothing);
      expect(find.byKey(const Key('product_grid_skeleton')), findsOneWidget);
      expect(
        find.descendant(of: find.byType(AppBar), matching: find.byType(TextField)),
        findsOneWidget,
        reason: 'el operador puede seguir escribiendo mientras carga',
      );
    });

    testWidgets('el buscador declara que acepta nombre y SKU (§13.1)', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(1080, 2316);
      tester.view.devicePixelRatio = 2.8125;
      addTearDown(tester.view.reset);

      await tester.pumpWidget(buildTestApp());
      await tester.pumpAndSettle();

      expect(find.text('Buscar nombre o SKU'), findsOneWidget);
    });

    testWidgets('catálogo vacío no es "sin resultados": lo dice y ofrece '
        'recargar (§13.2, §29)', (tester) async {
      await tester.pumpWidget(buildTestApp());
      await tester.pumpAndSettle();

      expect(find.text('Todavía no hay productos'), findsOneWidget);
      expect(find.text('Sin resultados'), findsNothing);

      final reload = find.widgetWithText(
        DsSecondaryButton,
        'Recargar catálogo',
      );
      expect(reload, findsOneWidget);
      expect(
        find.descendant(of: reload, matching: find.byIcon(Icons.refresh)),
        findsOneWidget,
        reason: 'la acción de vacío no puede ser un "+" genérico',
      );

      await tester.tap(reload);
      await tester.pump();
      verify(mockViewModel.loadProducts()).called(1);
    });

    testWidgets('sin resultados: nombra lo buscado, limpia con una acción y '
        'no ofrece recargar (§13.1, §13.2)', (tester) async {
      when(mockViewModel.products).thenReturn(const [product]);
      when(mockViewModel.filteredProducts).thenReturn(const []);
      when(mockViewModel.searchQuery).thenReturn('oreo doble');

      await tester.pumpWidget(buildTestApp());
      await tester.pumpAndSettle();

      expect(find.text('Sin resultados'), findsOneWidget);
      expect(
        find.textContaining('oreo doble'),
        findsWidgets,
        reason: 'el término buscado permanece visible (§13.1)',
      );
      expect(
        find.text('Recargar catálogo'),
        findsNothing,
        reason: 'el catálogo sí tiene datos: no hay nada que recargar',
      );

      // The screen itself clears the query once while mounting, so the tap
      // under test is counted from a clean interaction log.
      clearInteractions(mockViewModel);
      await tester.tap(
        find.widgetWithText(DsSecondaryButton, 'Limpiar filtros'),
      );
      await tester.pump();
      verify(mockViewModel.setSearchQuery('')).called(1);
    });
  });
}
