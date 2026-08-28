import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/data/services/sync_service.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/sales/cart_item.dart';
import 'package:pos_app/domain/models/sales/cashier_session.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/domain/models/config/tenant_config.dart';
import 'package:pos_app/domain/services/config/business_mode_evaluator.dart';
import 'package:pos_app/ui/features/sales/sale_view.dart';
import 'package:provider/provider.dart';

import 'sale_view_security_flows_test.mocks.dart';

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

  final testProducts = [
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
    const Product(
      id: 'prod-2',
      name: 'Panini Jamón & Queso',
      sellPrice: 120.0,
      averageCost: 60.0,
      uom: 'Unidad',
      stock: 50.0,
      sku: 'PAN-01',
      category: 'Comida',
    ),
  ];

  final testCartItems = [
    CartItem(
      productId: 'prod-1',
      productName: 'Café Espresso',
      quantity: 2,
      unitPrice: 50.0,
      taxRate: 0.15,
    ),
  ];

  setUp(() {
    mockViewModel = MockSaleViewModel();
    mockAuthRepository = MockAuthRepository();
    mockAuditRepository = MockAuditRepository();
    mockSyncService = MockSyncService();

    when(mockViewModel.errorMessage).thenReturn(null);
    when(mockViewModel.activeSession).thenReturn(activeSession);
    when(mockViewModel.isLoading).thenReturn(false);
    when(mockViewModel.filteredProducts).thenReturn(testProducts);
    when(mockViewModel.cart).thenReturn(testCartItems);
    when(mockViewModel.total).thenReturn(115.0);
    when(mockViewModel.subtotal).thenReturn(100.0);
    when(mockViewModel.totalTax).thenReturn(15.0);
    when(mockViewModel.totalDiscounts).thenReturn(0.0);
    when(mockViewModel.isGlobalTaxExempt).thenReturn(false);
    when(mockViewModel.supportsTables).thenReturn(false);
    when(mockViewModel.supportsBuzzerPager).thenReturn(false);
    when(mockViewModel.businessModeEvaluator).thenReturn(const BusinessModeEvaluator(TenantConfig()));
    when(mockViewModel.buzzerNumber).thenReturn(null);
    when(mockViewModel.canManageCashDrawer).thenReturn(true);
    when(mockViewModel.currentUserRole).thenReturn(UserRole.cashier);
    when(mockViewModel.sessionExpected).thenReturn({
      PaymentMethod.cash: 100,
      PaymentMethod.card: 0,
      PaymentMethod.qr: 0,
    });
    when(mockAuthRepository.getCurrentUser()).thenAnswer((_) async => currentUser);
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

  group('Sunmi V2s (360x720dp) Responsive SaleView', () {
    testWidgets('renders mobile layout with floating cart bar without RenderFlex overflow', (tester) async {
      tester.view.physicalSize = const Size(360, 720);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      await tester.pumpWidget(buildTestApp());
      await tester.pumpAndSettle();

      // Check products in grid
      expect(find.text('Café Espresso'), findsWidgets);
      expect(find.text('Panini Jamón & Queso'), findsOneWidget);

      // Check floating cart bar is visible on mobile
      expect(find.byKey(const Key('mobile_floating_cart_bar')), findsOneWidget);
      expect(find.text('Total: C\$ 115.00'), findsOneWidget);
      expect(find.byKey(const Key('mobile_view_cart_button')), findsOneWidget);

      // Verify PopupMenu exists for mobile app bar actions
      expect(find.byType(PopupMenuButton<String>), findsOneWidget);
    });

    testWidgets('tapping floating cart bar opens modal bottom sheet with Cart details', (tester) async {
      tester.view.physicalSize = const Size(360, 720);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      await tester.pumpWidget(buildTestApp());
      await tester.pumpAndSettle();

      // Tap floating cart button
      await tester.tap(find.byKey(const Key('mobile_view_cart_button')));
      await tester.pumpAndSettle();

      // Verify bottom sheet appears with cart summary
      expect(find.text('CARRITO'), findsOneWidget);
      expect(find.text('IVA (15%)'), findsOneWidget);
      expect(find.text('TOTAL'), findsOneWidget);
      expect(find.widgetWithText(ElevatedButton, 'COBRAR'), findsOneWidget);
    });

    testWidgets('renders desktop dual-panel layout on wide screens (> 600dp)', (tester) async {
      tester.view.physicalSize = const Size(1024, 768);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      await tester.pumpWidget(buildTestApp());
      await tester.pumpAndSettle();

      // On wide screens, CartSidebar is directly visible in a side column
      expect(find.text('CARRITO'), findsOneWidget);
      expect(find.byKey(const Key('mobile_floating_cart_bar')), findsNothing);
      expect(find.byType(PopupMenuButton<String>), findsNothing);
    });
  });
}
