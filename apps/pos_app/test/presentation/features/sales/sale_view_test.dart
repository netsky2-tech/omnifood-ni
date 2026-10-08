import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/data/services/sync_service.dart';
import 'package:pos_app/domain/models/sales/cashier_session.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/models/config/tenant_config.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';
import 'package:pos_app/domain/services/config/business_mode_evaluator.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/ui/features/sales/sale_view.dart';
import 'package:provider/provider.dart';

// Reuses the generated mocks from the loyalty-warning SaleView harness to
// avoid a duplicate build_runner codegen pass for this file.
import '../../../ui/features/sales/sale_view_loyalty_warning_test.mocks.dart';

/// Minimal fake so the mounted banner's best-effort refresh path can resolve
/// a pending count without a database. Everything else degrades through
/// noSuchMethod, exactly like the banner's own widget test fake.
class _FakeSalesRepository implements SalesRepository {
  _FakeSalesRepository(this.pendingCount);

  final int pendingCount;

  @override
  Future<int> getInventoryEnrichmentPendingCount() async => pendingCount;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

/// Issue #73c / R-13: InventoryEnrichmentWarningBanner must be mounted in
/// SaleView so operators are not blind to local sales with
/// APPLIED_INVENTORY_PENDING outcome (sales that did not deduct inventory).
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
  });

  Widget buildTestApp(SalesRepository salesRepository) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider<SaleViewModel>.value(value: mockViewModel),
        Provider<AuthRepository>.value(value: mockAuthRepository),
        Provider<AuditRepository>.value(value: mockAuditRepository),
        Provider<SyncService>.value(value: mockSyncService),
        Provider<SalesRepository>.value(value: salesRepository),
      ],
      child: const MaterialApp(home: SaleView()),
    );
  }

  Future<void> pumpSaleView(WidgetTester tester, int pendingCount) async {
    await tester.pumpWidget(buildTestApp(_FakeSalesRepository(pendingCount)));
    // Flush the banner's post-frame refresh (async best-effort count read).
    await tester.pump(const Duration(milliseconds: 50));
  }

  Future<void> unmount(WidgetTester tester) async {
    // Unmount so the banner's periodic refresh timer is cancelled.
    await tester.pumpWidget(const SizedBox.shrink());
  }

  testWidgets(
    'SaleView shows the inventory enrichment warning banner when pending '
    'count > 0',
    (tester) async {
      await pumpSaleView(tester, 3);

      expect(
        find.byKey(const Key('inventory_enrichment_warning_banner')),
        findsOneWidget,
      );
      expect(
        find.textContaining('3 ventas con inventario pendiente'),
        findsOneWidget,
      );

      await unmount(tester);
    },
  );

  testWidgets(
    'SaleView shows no inventory enrichment warning banner when pending '
    'count is 0',
    (tester) async {
      await pumpSaleView(tester, 0);

      expect(
        find.byKey(const Key('inventory_enrichment_warning_banner')),
        findsNothing,
      );

      await unmount(tester);
    },
  );
}
